# ============================================================================
# Google Cloud infrastructure for the riglink SPA.
#
# WHAT THIS OWNS, AND WHAT IT DELIBERATELY DOES NOT
#
# OpenTofu owns the DURABLE resources: the hostname, its DNS records, and the
# identity CI deploys with. Things that change when the architecture changes,
# which is rarely.
#
# It does NOT own the deployed site content. That is a BUILD ARTIFACT that
# changes on every commit; `firebase deploy` publishes it from CI, and
# rollback is a click in the Firebase console. Declaring releases here would
# make every deploy show up as drift.
#
# It also does not own the DNS zone or the Hosting site, only references them:
# the zone carries the domain's mail records, and the default site comes with
# the Firebase project.
# ============================================================================

locals {
  site_id = coalesce(var.hosting_site_id, var.project_id)
}

data "google_dns_managed_zone" "this" {
  name = var.dns_zone_name
}

# ---------------------------------------------------------------------------
# Custom domain
# ---------------------------------------------------------------------------

# Attaches the hostname to the site. Hosting then verifies the DNS records
# below and provisions the certificate on its own; with
# `wait_dns_verification = false` the apply does not block on that.
resource "google_firebase_hosting_custom_domain" "app" {
  provider              = google-beta
  site_id               = local.site_id
  custom_domain         = var.app_hostname
  wait_dns_verification = false
}

# Firebase Hosting's documented setup for a subdomain: an A record to the
# Hosting anycast address, and a TXT record proving this site may serve the
# name.
#
# Hosting's API also lists a CNAME to `<site>.web.app` as its "desired"
# record, and reports it as an ADD even once these records are verified. Both
# are valid; A + TXT is the documented one and is what this uses.
locals {
  dns_records = {
    A   = ["199.36.158.100"]
    TXT = ["\"hosting-site=${local.site_id}\""]
  }
}

resource "google_dns_record_set" "app" {
  for_each     = local.dns_records
  managed_zone = data.google_dns_managed_zone.this.name
  name         = "${var.app_hostname}."
  type         = each.key
  ttl          = 300
  rrdatas      = each.value
}

# Firebase's own verdict on the records above. If Hosting ever stops
# accepting them -- a new address, a changed ownership rule -- `tofu plan`
# warns, instead of the domain quietly going dark or its certificate failing
# to renew. Compare `tofu output required_dns_records` to see what it wants.
#
# Right after the domain is created Hosting has not checked DNS yet, so the
# first apply may warn once; the next plan is the one that counts.
check "dns_accepted_by_firebase" {
  assert {
    condition = (
      google_firebase_hosting_custom_domain.app.host_state == "HOST_ACTIVE" &&
      google_firebase_hosting_custom_domain.app.ownership_state == "OWNERSHIP_ACTIVE"
    )
    error_message = "Firebase Hosting does not accept the DNS records for ${var.app_hostname} (host: ${google_firebase_hosting_custom_domain.app.host_state}, ownership: ${google_firebase_hosting_custom_domain.app.ownership_state}). See `tofu output required_dns_records`."
  }
}

# ---------------------------------------------------------------------------
# Keyless deploys from GitHub Actions
#
# CI exchanges its GitHub OIDC token for short-lived Google credentials. There
# is no service account key to leak or rotate.
# ---------------------------------------------------------------------------

resource "google_project_service" "ci" {
  for_each = toset([
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "sts.googleapis.com",
  ])
  service = each.key
  # Other things in the project may depend on these.
  disable_on_destroy = false
}

resource "google_service_account" "deployer" {
  account_id   = "hosting-deployer"
  display_name = "Firebase Hosting deployer (GitHub Actions)"
}

# `firebase deploy --only hosting` needs to publish releases and to check that
# the Hosting API is enabled -- nothing else.
resource "google_project_iam_member" "deployer" {
  for_each = toset([
    "roles/firebasehosting.admin",
    "roles/serviceusage.serviceUsageConsumer",
  ])
  project = var.project_id
  role    = each.key
  member  = google_service_account.deployer.member
}

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github"
  display_name              = "GitHub Actions"
  depends_on                = [google_project_service.ci]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  display_name                       = "GitHub Actions OIDC"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
  }
  # Without a condition, ANY repository on GitHub could present a token to
  # this pool. Only this repository's main branch -- the only place CI
  # deploys from -- gets in.
  attribute_condition = "assertion.repository == '${var.github_repository}' && assertion.ref == 'refs/heads/main'"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account_iam_member" "github_deploys" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repository}"
}

# What the deploy job in .github/workflows/ci.yml authenticates with. Written
# from here so they cannot drift from the resources they name. Variables, not
# secrets: they identify the pool and the account, and only this repository's
# main branch is allowed to use them.
resource "github_actions_variable" "deploy" {
  for_each = {
    GCP_WORKLOAD_IDENTITY_PROVIDER = google_iam_workload_identity_pool_provider.github.name
    GCP_DEPLOY_SERVICE_ACCOUNT     = google_service_account.deployer.email
  }
  repository    = split("/", var.github_repository)[1]
  variable_name = each.key
  value         = each.value
}
