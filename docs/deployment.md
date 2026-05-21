# ☁️ Deployment & Infrastructure

The site is a static, zero-knowledge web app. Hosting is the only infrastructure:
a CDN serving `dist/`. Everything below is **disabled by default** — there is no
public instance until a maintainer turns it on. (The source is fully usable and
self-hostable without any of this.)

## Pieces

| File                                      | Role                                                              |
| ----------------------------------------- | ----------------------------------------------------------------- |
| `infra/terraform/`                        | IaC: enables Firebase + creates the Hosting site (see infra/README.md). |
| `.github/workflows/infra.yml`             | Terraform `fmt`/`validate`/`plan` on PRs, `apply` on `main`.       |
| `.github/workflows/deploy.yml`            | Builds and deploys to the **live** channel on `main`.             |
| `.github/workflows/deploy-preview.yml`    | Builds and deploys each PR to a temporary **preview** channel.    |
| `firebase.json`, `.firebaserc`            | Hosting config: output dir, SPA rewrite, strict security headers.  |

## One-time setup to go live

1. **Create a GCP project** (with billing) and a GCS bucket for Terraform state.
2. **Provision hosting** via Terraform (locally or by enabling `infra.yml`) — see
   `infra/README.md`.
3. **Configure repo variables/secrets:**
   - Variables: `FIREBASE_ENABLED=true`, and for IaC `IAC_ENABLED=true`,
     `GCP_PROJECT_ID`, `FIREBASE_SITE_ID`, `TF_STATE_BUCKET`.
   - Secrets: `FIREBASE_SERVICE_ACCOUNT` (Hosting deploys), `FIREBASE_PROJECT_ID`,
     and `GCP_SA_KEY` (Terraform). Prefer Workload Identity Federation over a
     long-lived key where possible.
4. Push to `main` → `deploy.yml` publishes the live site; PRs get preview URLs.

## Note on legal obligations

Operating a public instance from Germany generally triggers an Impressum
requirement (name + summons-capable address). This repo intentionally ships **no
Impressum and no personal address**. If/when you operate a public instance,
add the legally required notice (e.g. via a business/service address) before
enabling the deploy workflows. Until then, keep `FIREBASE_ENABLED` unset.
