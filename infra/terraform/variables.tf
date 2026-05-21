variable "project_id" {
  type        = string
  description = "Existing GCP project id that will host the site. Terraform does not create the project (that needs org/billing access); create it first or via a separate bootstrap."
}

variable "region" {
  type        = string
  description = "Default region for the providers."
  default     = "europe-west1"
}

variable "site_id" {
  type        = string
  description = "Firebase Hosting site id (the *.web.app subdomain). Often the same as the project id."
}

variable "custom_domain" {
  type        = string
  description = "Optional custom domain to attach to the Hosting site. Leave empty to skip (you must own/verify the domain and set DNS yourself)."
  default     = ""
}
