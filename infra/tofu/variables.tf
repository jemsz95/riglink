variable "project_id" {
  type        = string
  description = "The Google Cloud project that holds the Firebase project and the DNS zone."
}

variable "hosting_site_id" {
  type        = string
  default     = null
  description = <<-EOT
    Firebase Hosting site to attach the domain to. Defaults to the project's
    default site, whose id is the project id. That site is created with the
    Firebase project, so it is referenced here rather than managed.
  EOT
}

variable "dns_zone_name" {
  type        = string
  description = <<-EOT
    Name (not DNS name) of the existing Cloud DNS managed zone, e.g. "riglink".

    The zone is referenced, not managed: it also carries the domain's mail
    records, which have nothing to do with this app and must not be destroyed
    by a `tofu destroy` here.
  EOT
}

variable "app_hostname" {
  type        = string
  description = <<-EOT
    Where the app is served, e.g. "my.riglink.app".

    This value has consequences beyond DNS: it must also be set as `site_url`
    and in `additional_redirect_urls` in supabase/config.toml, or magic links
    will send people somewhere else. See the note in that file.
  EOT
}

variable "github_repository" {
  type        = string
  description = <<-EOT
    "owner/repo" of the GitHub repository whose CI deploys the app. Only
    workflow runs from this repository, on its main branch, can impersonate
    the deploy service account.
  EOT
}
