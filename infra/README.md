# 🏗️ Infrastructure (Terraform)

Infrastructure-as-Code for the zero-knowledge PII Data Sanitizer. It provisions a
**static Firebase Hosting site** (CDN) on an existing GCP project — nothing more.
No Firestore, Functions, Auth, or analytics, because anything server-side would
break the zero-knowledge guarantee. Uploading the built `dist/` is done by the
GitHub Actions deploy workflows, not by Terraform.

## What it manages

- Enables the `firebase` and `firebasehosting` APIs on the project.
- Enables Firebase on the (existing) GCP project.
- Creates the Firebase Hosting site.
- Optionally attaches a custom domain.

> Terraform does **not** create the GCP project or set up billing (that needs org
> admin). Create the project first, then point this at it.

## Prerequisites

- An existing GCP project with billing enabled.
- A GCS bucket for Terraform remote state.
- A service account (or Workload Identity) with rights to manage Firebase Hosting
  and enable services on the project.

## Local usage

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars   # then edit

terraform init -backend-config="bucket=YOUR_TF_STATE_BUCKET" -backend-config="prefix=pii-sanitizer"
terraform plan
terraform apply
```

## CI usage

The `Infrastructure (Terraform)` workflow (`.github/workflows/infra.yml`) runs
`fmt`/`validate`/`plan` on pull requests touching `infra/`, and `apply` on
`main`. It is **inert until enabled**. To turn it on, set these repository
**variables**:

| Variable           | Example                  | Purpose                          |
| ------------------ | ------------------------ | -------------------------------- |
| `IAC_ENABLED`      | `true`                   | Master switch for the workflow.  |
| `GCP_PROJECT_ID`   | `pii-sanitizer-prod`     | Target project id.               |
| `FIREBASE_SITE_ID` | `pii-sanitizer`          | Hosting site id.                 |
| `TF_STATE_BUCKET`  | `pii-sanitizer-tfstate`  | GCS bucket for remote state.     |

and this repository **secret**:

| Secret       | Purpose                                                       |
| ------------ | ------------------------------------------------------------ |
| `GCP_SA_KEY` | JSON key of a service account with the rights listed above. |

> Prefer [Workload Identity Federation](https://github.com/google-github-actions/auth#preferred-direct-workload-identity-federation)
> over a long-lived `GCP_SA_KEY` for production.
