output "hosting_site_id" {
  description = "The Firebase Hosting site id."
  value       = google_firebase_hosting_site.site.site_id
}

output "default_url" {
  description = "The default *.web.app URL of the Hosting site."
  value       = google_firebase_hosting_site.site.default_url
}

output "custom_domain" {
  description = "The configured custom domain, if any. Retrieve the exact DNS records from the Firebase console or `terraform state show`."
  value       = var.custom_domain
}
