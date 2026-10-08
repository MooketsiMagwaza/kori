# Deploying Kori

Kori's web apps deploy to **Vercel**, one Vercel project per app, all from the
private GitHub repository `MooketsiMagwaza/kori`. The repository stays private;
Vercel builds from it through its GitHub app.

Nothing here has been deployed yet. Deployment needs the owner's Vercel login,
which the assistant cannot use. Every step below is for the owner.

## What deploys where

| Order | Vercel project name (suggested) | Root Directory | Environment variables | State |
| ---: | --- | --- | --- | --- |
| 1 | `kori-field` | `apps/field` | none needed | Ready to deploy |
| 2 | `kori-landing` | `apps/landing` | `NEXT_PUBLIC_FIELD_APP_URL` = the field app's URL; `NEXT_PUBLIC_API_DOCS_URL` = the API docs URL (once it exists) | Ready to deploy |
| 3 | `kori-review` | `apps/review` | none needed | When the review console is merged |
| 4 | `kori-api-docs` | `apps/api-docs` | none needed | When the API docs are merged |

Each app folder has a `vercel.json` that sets the framework (Next.js), the
install command (`npm ci`), the build command (`npm run build`), and an ignore
step that skips a build when nothing in that app's folder changed.

## Steps, the first time (about 10 minutes)

1. Sign in at <https://vercel.com> with the account you already use.
2. Click **Add New…** → **Project**.
3. Under **Import Git Repository**, look for `kori`. If it is not listed,
   click **Adjust GitHub App Permissions** (or **Configure GitHub App**), and in
   GitHub choose **Only select repositories** → add **MooketsiMagwaza/kori** →
   **Save**. This is the one authorisation needed: it lets Vercel read this
   private repository. Back in Vercel, `kori` now appears.
4. Click **Import** next to `kori`. On the configuration screen:
   - **Project Name:** `kori-field`
   - **Framework Preset:** Next.js (detected)
   - **Root Directory:** click **Edit**, choose `apps/field`, **Continue**
   - **Build and Output Settings:** leave as they are (`vercel.json` sets them)
   - **Environment Variables:** none
   - Click **Deploy**.
5. When it finishes, copy the production URL (for example
   `https://kori-field.vercel.app`; Vercel may add a suffix if the name is taken).
6. Click **Add New…** → **Project** again, import `kori` a second time:
   - **Project Name:** `kori-landing`
   - **Root Directory:** `apps/landing`
   - **Environment Variables:** add `NEXT_PUBLIC_FIELD_APP_URL` with the URL
     from step 5. Leave `NEXT_PUBLIC_API_DOCS_URL` unset for now; its buttons
     point at the page's status section until it is set.
   - Click **Deploy**.
7. Later, for the review console and the API docs, repeat with
   `apps/review` and `apps/api-docs`. After the API docs are live, set
   `NEXT_PUBLIC_API_DOCS_URL` on `kori-landing` (**Settings** →
   **Environment Variables**) and redeploy it (**Deployments** → the latest →
   **⋯** → **Redeploy**).

After this, every merge to `main` redeploys the apps whose folders changed, and
every pull request gets a preview deployment.

## Command-line alternative

If you prefer the CLI (`npm i -g vercel`, then `vercel login`), from the
repository root:

```sh
cd apps/field && vercel link --project kori-field && vercel --prod
cd ../landing && vercel link --project kori-landing
vercel env add NEXT_PUBLIC_FIELD_APP_URL production   # paste the field app URL
vercel --prod
```

When `vercel link` asks for the root directory, answer `./` (you are already
in the app folder).

## Who can see it

- The **repository** stays private.
- A Vercel **production URL** is reachable by anyone who has the link, unless
  you turn on protection for production deployments under the project's
  **Settings** → **Deployment Protection**. Check what your plan allows there.
  Preview deployments are protected by default.
- Both apps send `noindex`, so search engines will not list them. When you
  decide to publish, remove the `robots` line from `apps/landing/app/layout.tsx`.

## Checks that run on every pull request

`.github/workflows/ci.yml` runs on GitHub Actions (minutes count against the
account's private-repository allowance):

- the name gate, the shared-file sync check and the shared tests;
- for each app: `npm ci`, lint, typecheck and build.

## What the deployed apps need at run time

Nothing else. The apps run entirely in the browser with sample data. There is
no database, no API server and no secret. `NEXT_PUBLIC_KORI_API_URL` exists in
the field app for the future API and must stay unset until that API exists.
