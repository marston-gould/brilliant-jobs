# Staging Environment Setup

## How It Works

Vercel automatically creates **preview deployments** for any branch pushed to GitHub.
Push to a `staging` branch and Vercel generates a unique URL like:
`brilliant-jobs-<hash>-marston-goulds-projects.vercel.app`

## Setup Steps

1. **Create staging branch:**
   ```bash
   git checkout -b staging
   git push origin staging
   ```

2. **Vercel auto-deploys** — check the Vercel dashboard for the preview URL.

3. **(Optional) Create a staging Supabase project:**
   - Go to supabase.com → New Project → name it "LI Staging"
   - Run the baseline migration: `supabase db push --db-url <staging-db-url>`
   - Set staging env vars in Vercel (Project Settings → Environment Variables → Preview):
     - `NEXT_PUBLIC_SUPABASE_URL` = staging Supabase URL
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = staging anon key

## Workflow

```
Feature branch → PR to staging → Vercel preview + QA → PR to main → Production
```

## Current Environment

| Environment | URL | Database | Branch |
|-------------|-----|----------|--------|
| Production | brilliantjobs.app | qojhagupdnbtomfoxnsf | main |
| Staging | (auto-generated preview) | Same as prod (until step 3) | staging |

## GitHub Secrets Needed for CI/CD

Add these in GitHub → Settings → Secrets:
- `SUPABASE_DB_URL`: `postgresql://postgres:111@db.qojhagupdnbtomfoxnsf.supabase.co:5432/postgres`
- `SUPABASE_PROJECT_REF`: `qojhagupdnbtomfoxnsf`
- `SUPABASE_ACCESS_TOKEN`: Generate at supabase.com/dashboard/account/tokens
