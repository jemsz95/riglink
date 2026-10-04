output "app_url" {
  value       = "https://${var.app_hostname}"
  description = "Put this in supabase/config.toml as site_url, then run `npm run config:push`."
}

output "host_state" {
  value       = google_firebase_hosting_custom_domain.app.host_state
  description = "HOST_ACTIVE once DNS has propagated and Hosting serves the name."
}

output "cert_state" {
  value       = try(google_firebase_hosting_custom_domain.app.cert[0].state, null)
  description = "CERT_ACTIVE once the certificate is issued. Can take up to 24 hours."
}

output "required_dns_records" {
  value       = google_firebase_hosting_custom_domain.app.required_dns_updates
  description = "What Firebase Hosting wants in DNS, for comparison with main.tf."
}

output "github_workload_identity_provider" {
  value       = google_iam_workload_identity_pool_provider.github.name
  description = "Written to the GitHub Actions variable GCP_WORKLOAD_IDENTITY_PROVIDER."
}

output "github_deploy_service_account" {
  value       = google_service_account.deployer.email
  description = "Written to the GitHub Actions variable GCP_DEPLOY_SERVICE_ACCOUNT."
}

output "next_steps" {
  description = "What is still manual after this applies."
  value       = <<-EOT
    Once `tofu output cert_state` is CERT_ACTIVE and https://${var.app_hostname}
    loads, supabase/config.toml:
      site_url = "https://${var.app_hostname}"
    then `npm run config:push`. Until this is done, magic links redirect to
    localhost and the failure looks like "magic links are broken".
  EOT
}
