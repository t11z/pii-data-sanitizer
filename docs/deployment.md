# ☁️ Deployment

The site is a static, zero-knowledge web app. Hosting is the only infrastructure:
a CDN serving `dist/`. The source is fully usable and self-hostable.

## Pieces

| File                                   | Role                                                          |
| -------------------------------------- | ------------------------------------------------------------ |
| `.github/workflows/deploy.yml`         | Builds and deploys to the **live** channel on `main`.        |
| `.github/workflows/deploy-preview.yml` | Builds and deploys each PR to a temporary **preview** channel. |
| `.github/workflows/release.yml`        | Builds a static bundle and attaches it to a **GitHub Release** for offline / local use. |
| `firebase.json`, `.firebaserc`         | Hosting config: output dir, SPA rewrite, strict security headers. |

## One-time setup to go live

1. **Create a Firebase project** and set `default` in `.firebaserc` (or rely on
   the `FIREBASE_PROJECT_ID` secret).
2. **Configure repo settings** (Settings → Secrets and variables → Actions):
   - Secrets: `FIREBASE_SERVICE_ACCOUNT` (a service-account JSON with Hosting
     access — Firebase console → Project settings → Service accounts → Generate
     new private key, or run `firebase init hosting:github`) and
     `FIREBASE_PROJECT_ID`.
3. Push to `main` → `deploy.yml` publishes the live site; PRs get preview URLs.

## Offline / local bundle (no Node required)

`release.yml` produces a downloadable, fully static build for users who want
to run the sanitizer locally without installing Node / npm:

- **Trigger**: push a tag matching `v*` (e.g. `git tag v0.1.0 && git push --tags`),
  or run the workflow manually via *Actions → Release prebuilt bundle → Run
  workflow* and supply a tag name.
- **Artifact**: a `pii-data-sanitizer-<version>.zip` (plus `.tar.gz` and a
  SHA-256 checksum file) attached to a GitHub Release. The archive contains
  the built `dist/` and a `RUN_LOCALLY.md` with one-liners for Python /
  `npx serve` / Docker.
