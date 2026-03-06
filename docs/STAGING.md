# Staging Environment Setup

> CS-020 FIX-21: Staging environment configuration

## Architecture

```
Feature branch ──PR──▶ staging ──PR──▶ main ──▶ Production
                         │                       │
                    Vercel Preview           Vercel Prod
                    (auto-deploy)           (auto-deploy)
                         │                       │
                    Same Supabase *         Production DB
```

\* Staging shares the production Supabase project until user volume justifies
a separate staging database. RLS policies protect data isolation.

## How It Works

Vercel automatically creates **preview deployments** for any branch pushed to GitHub.
The `staging` branch gets a stable preview URL that can be bookmarked and shared.

### Branch Protection Rules

Configure in GitHub → Settings → Branches:

| Branch | Rules |
|--------|-------|
| `main` | Require PR, require CI passing, require 1 approval, no force push |
| `staging` | Require PR, require CI passing, no force push |

### Vercel Preview Configuration

Vercel auto-deploys preview environments for every branch. For staging-specific
environment variables, configure in Vercel Dashboard → Project Settings →
Environment Variables → **Preview** scope:

| Variable | Value | Notes |
|----------|-------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Same as prod (for now) | Switch when staging DB created |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same as prod (for now) | Switch when staging DB created |
| `POSTHOG_ENV` | `staging` | Separate PostHog events |

## Workflow

### Day-to-day development

```bash
# 1. Create feature branch from staging
git checkout staging && git pull
git checkout -b fix/my-feature

# 2. Develop + commit
git add . && git commit -m "fix: description"

# 3. Push → Vercel creates preview URL automatically
git push origin fix/my-feature

# 4. Open PR to staging → CI runs tests + build check
# 5. Merge to staging → Vercel preview updates at staging URL
# 6. QA validates on staging
# 7. Open PR from staging → main → CI runs again
# 8. Merge to main → Production deploy via Vercel + deploy.yml
```

### Creating the staging branch (first time)

```bash
git checkout main
git checkout -b staging
git push origin staging
```

## CI/CD Pipeline Summary

| Workflow | Trigger | What it does |
|----------|---------|-------------|
| `ci.yml` | PR or push to main/staging | Tests (vitest), build check, version sync, extension build |
| `deploy.yml` | Push to main (specific paths) | Supabase migrations, Edge Function deploys, CSS/JS rebuilds, extension packaging |
| `load-test.yml` | Manual dispatch | k6 load tests against staging or prod |
| `psi-audit.yml` | Existing | PageSpeed Insights audit |
| `selector-monitor.yml` | Existing | ATS selector health checks |
| `workable-xml.yml` | Existing | Workable XML feed refresh |

## GitHub Secrets Required

Add in GitHub → Settings → Secrets and variables → Actions:

| Secret | Purpose |
|--------|---------|
| `SUPABASE_DB_URL` | Database connection for migrations |
| `SUPABASE_PROJECT_REF` | Project reference for CLI |
| `SUPABASE_ACCESS_TOKEN` | CLI auth token (generate at supabase.com/dashboard/account/tokens) |
| `K6_TEST_EMAIL` | Load test user email |
| `K6_TEST_PASSWORD` | Load test user password |

## Future: Separate Staging Database

When user volume or data sensitivity requires it:

1. Create new Supabase project ("brilliant-jobs-staging")
2. Run all migrations against the new project
3. Update Vercel Preview env vars to point to staging DB
4. Update `load-tests/config.js` with staging URLs
5. Update this document
