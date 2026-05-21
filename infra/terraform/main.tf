# Infrastructure for the zero-knowledge PII Data Sanitizer.
#
# Scope is deliberately minimal: a static Firebase Hosting site (CDN) on an
# existing GCP project. No Firestore, Functions, Auth, or analytics — anything
# server-side would break the zero-knowledge guarantee. Application deploys
# (uploading dist/) are handled by the GitHub Actions workflows, not Terraform.

locals {
  required_services = [
    "firebase.googleapis.com",
    "firebasehosting.googleapis.com",
  ]
}

resource "google_project_service" "enabled" {
  for_each = toset(local.required_services)

  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

# Enable Firebase on the existing GCP project.
resource "google_firebase_project" "default" {
  provider = google-beta
  project  = var.project_id

  depends_on = [google_project_service.enabled]
}

# The static Hosting site.
resource "google_firebase_hosting_site" "site" {
  provider = google-beta
  project  = var.project_id
  site_id  = var.site_id

  depends_on = [google_firebase_project.default]
}

# Optional custom domain (only created when var.custom_domain is set).
resource "google_firebase_hosting_custom_domain" "domain" {
  count = var.custom_domain == "" ? 0 : 1

  provider      = google-beta
  project       = var.project_id
  site_id       = google_firebase_hosting_site.site.site_id
  custom_domain = var.custom_domain

  # Surface DNS records in the plan/state without blocking apply on verification.
  wait_dns_verification = false
}
