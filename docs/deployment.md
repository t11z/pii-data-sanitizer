# ☁️ Deployment

The site is a static, zero-knowledge web app. Hosting is the only infrastructure:
a CDN serving `dist/`. The source is fully usable and self-hostable.

## Pieces

| File                                   | Role                                                          |
| -------------------------------------- | ------------------------------------------------------------ |
| `.github/workflows/deploy.yml`         | Builds and deploys to the **live** channel on `main`.        |
| `.github/workflows/deploy-preview.yml` | Builds and deploys each PR to a temporary **preview** channel. |
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
