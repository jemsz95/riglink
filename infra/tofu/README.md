# Google Cloud infrastructure

OpenTofu owns the durable hosting resources in the `riglink-508420` project:
the `my.riglink.app` custom domain on Firebase Hosting, its records in the
existing Cloud DNS zone, and the Workload Identity Federation setup GitHub
Actions deploys through. It deliberately does **not** own the site content
-- see the header comment in `main.tf` for why.

    firebase          deploys the app on every commit  (build artifact)
    opentofu          points a hostname at it, once    (infrastructure)

## Credentials

None stored anywhere. Locally, both providers use Application Default
Credentials:

    gcloud auth application-default login

Your account needs to be able to manage DNS records, Firebase Hosting, IAM
service accounts and workload identity pools in the project -- Owner covers
it. CI never runs `tofu`; it only deploys, through the service account this
creates.

## First run

    cp terraform.tfvars.example terraform.tfvars   # then fill it in
    tofu init
    tofu plan
    tofu apply

`terraform.tfvars` is gitignored: it names your project and repository, which
is not secret but is not this repository's business either.

Then:

1. Set the GitHub Actions variables `GCP_WORKLOAD_IDENTITY_PROVIDER` and
   `GCP_DEPLOY_SERVICE_ACCOUNT` from `tofu output`. They are not secrets.
2. Wait for `tofu refresh && tofu output host_state` to say `HOST_ACTIVE`
   (minutes) and `cert_state` to say `CERT_ACTIVE` (up to a day).
3. `tofu output next_steps` prints the Supabase `site_url` change.

## The DNS check

`main.tf` hard-codes the records Firebase documents for a subdomain: an A
record to `199.36.158.100` and a `hosting-site=` TXT record. A `check` block
compares them against what Firebase actually asks for and fails the plan if
they differ, so a changed requirement surfaces as an error rather than a
certificate that silently stops renewing.

## State

Local, and gitignored. When CI needs to run `tofu apply`, switch to the GCS
backend sketched in `versions.tf`.
