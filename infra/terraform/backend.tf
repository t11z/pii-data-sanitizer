# Remote state in a GCS bucket. The bucket/prefix are supplied at init time via
# -backend-config (see infra/README.md), so the same config works for any project
# and nothing project-specific is committed. For local experiments you can delete
# this file to fall back to local state.
terraform {
  backend "gcs" {}
}
