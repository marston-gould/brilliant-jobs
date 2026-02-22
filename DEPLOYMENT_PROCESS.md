# Brilliant Jobs — Deployment Process Specification

**Effective:** February 22, 2026  
**Owner:** Marston Gould, CPO  
**Scope:** All pods, all agents, all contributors  

---

## Why This Exists

On February 22, 2026, a 5-hour production debug session was caused by a compounding failure pattern:

1. **No verification between deploys** — 30 versions (v3.41–v3.70) were deployed in rapid succession without confirming each one landed in production.
2. **Browser caching masked regressions** — The user's browser was serving v3.57 while production was on v3.65+. Eight versions of fixes were invisible.
3. **No branching discipline** — All pushes went directly to `main`. No staging layer. No rollback points.
4. **Version tracking gap** — The dashboard said v3.40 in the roadmap while production was on v3.57. Nobody knew where the truth was.
5. **No pre-deploy checklist** — Edge Functions, database schema, and frontend code were deployed in arbitrary order without dependency checks.

This document establishes the deployment process that prevents all five failure modes.

---

## 1. Branch Model

Three long-lived branches. All work flows through the pipeline.

| Branch | Purpose | Deploys To | Who Merges |
|--------|---------|-----------|------------|
| `main` | Production | brilliantjobs.app | CPO only, after staging QA |
| `staging` | Pre-production QA | staging.brilliantjobs.app | Pod leads, after dev review |
| `dev` | Integration | dev.brilliantjobs.app | Any contributor via PR |

**Flow:** `feature/* → dev → staging → main`

Every change follows this path. No exceptions. No direct pushes to `main` or `staging`.

### Branch Naming

| Prefix | Use Case | Example |
|--------|----------|---------|
| `feat/` | New features | `feat/v3-71-resume-rewrite` |
| `fix/` | Bug fixes | `fix/timeline-timezone-utc` |
| `refactor/` | Code cleanup | `refactor/admin-inline-styles` |
| `data/` | DB migrations, RPCs, Edge Functions | `data/dfs-instant-pages` |
| `docs/` | Documentation, roadmap | `docs/roadmap-v3-44-70` |
| `hotfix/` | Emergency prod fix (bypasses dev) | `hotfix/broken-auth-gate` |

---

## 2. Development Workflow

### 2.1 Starting Work

```bash
git checkout dev && git pull origin dev
git checkout -b feat/v3-71-my-feature
# Do work, commit frequently
git add -A && git commit -m "v3.71: description of change"
git push origin feat/v3-71-my-feature
```

### 2.2 Pull Requests

- All PRs target `dev` (never `main` or `staging` directly)
- PR title: `v3.71: Feature description`
- PR body must include:
  - What changed (summary)
  - Files modified
  - Testing performed
  - Screenshots if visual
  - Edge Function / DB dependencies (if any)
- Self-review the diff before requesting review
- At least 1 approval required

### 2.3 Merging to Dev

- Squash merge preferred (one commit per feature)
- Delete the feature branch after merge
- `dev` auto-deploys to dev.brilliantjobs.app
- **Verify at dev URL before proceeding**

### 2.4 Promoting to Staging

When dev is stable and a batch of features is ready:

1. Open PR: `dev → staging`
2. Title: `Release candidate: v3.71–v3.75`
3. Regular merge (preserve individual commits)
4. Staging auto-deploys to staging.brilliantjobs.app
5. **Run the Staging QA Checklist (Section 5)**

### 2.5 Promoting to Production

CPO decision only, after staging QA passes:

1. Open PR: `staging → main`
2. CPO reviews and approves
3. Merge to `main` → auto-deploys to brilliantjobs.app
4. **Run the Production Verification Checklist (Section 6)**
5. Tag the release: `git tag v3.75 && git push origin v3.75`

### 2.6 Hotfix Process

For emergencies only (site down, data loss, auth broken):

1. Branch from `main`: `git checkout -b hotfix/broken-auth main`
2. Fix, commit, push, open PR to `main`
3. CPO fast-track approval
4. After merge to `main`, cherry-pick to dev and staging:
   ```bash
   git checkout dev && git cherry-pick <sha> && git push origin dev
   git checkout staging && git cherry-pick <sha> && git push origin staging
   ```

---

## 3. Version Discipline

### 3.1 Every Deploy Must Be Versioned

Every single deployment must include a version bump in **three** places:

1. **`js/app.js`** — `const BJ_VERSION = 'v3.XX';`
2. **`dashboard.html`** — Version string in HTML comment or footer
3. **`index.html`** — Version string in HTML comment or footer

### 3.2 Console Must Print Version

On page load, the browser console must print:
```
Dashboard v3.XX loaded
```

This is the **source of truth** for what version is running. If the console says v3.57 and you just deployed v3.70, the user has a caching problem.

### 3.3 Version Must Match Across All Surfaces

After every deploy, verify:
- Browser console version matches the commit
- Dashboard footer (if visible) matches
- `index.html` source version matches

If any mismatch: hard refresh → clear cache → verify again.

### 3.4 No Version Gaps

The roadmap must be updated with every version deployed to production. If the roadmap says v3.40 and production is on v3.70, that's a 30-version documentation gap that makes debugging impossible.

**Rule:** The roadmap update is part of the deploy, not a separate task.

---

## 4. Deploy Order for Multi-Component Changes

When a change spans frontend code, Edge Functions, and/or database schema, deploy in this order:

### Order of Operations

```
1. Database schema (migrations)     — additive only, backward-compatible
2. Supabase RPC functions           — additive only
3. Edge Functions                   — deploy + verify
4. Frontend code                    — build + deploy + verify
5. Roadmap update                   — document what shipped
```

### Why This Order Matters

- **Database first** because both old and new frontend code must work with the schema. New columns must have DEFAULT values or be nullable.
- **Edge Functions second** because the frontend may depend on new endpoints. Old frontend must gracefully handle new Edge Function responses (or the Edge Function must be backward-compatible).
- **Frontend last** because it's the consumer of everything above. By the time the frontend deploys, all its dependencies are live.

### Dependency Declaration

Every PR must declare its deploy dependencies:

```
## Deploy Dependencies
- [ ] Requires DB migration: `ALTER TABLE ats_jobs ADD COLUMN ...`
- [ ] Requires Edge Function deploy: `seo-sync`
- [ ] Requires env variable: `CLOUDFLARE_ZONE_ID`
- [ ] No backend dependencies (frontend only)
```

---

## 5. Staging QA Checklist

Before promoting staging → main, verify:

### Functional
- [ ] Landing page loads, login/signup buttons work
- [ ] Jobs Feed loads with data, filters work
- [ ] Stats page charts render (all 8 chart types)
- [ ] Resume upload + text extraction works
- [ ] AI filter suggest triggers and returns results
- [ ] Saved filters persist across page reload
- [ ] Admin SEO tab loads with charts and data

### Visual
- [ ] Stat card numbers visible (both light and dark theme)
- [ ] No white-on-white or invisible text
- [ ] Alaska/Hawaii visible on all map types
- [ ] Charts have correct axis labels and scales
- [ ] Mobile responsive at 375px, 768px, 1024px

### Console
- [ ] Correct version prints on load
- [ ] No 500 errors
- [ ] No 401/403 errors (auth working)
- [ ] No uncaught exceptions
- [ ] No 406 error floods from Edge Functions

### Data
- [ ] RPC calls return non-empty arrays
- [ ] `get_weekly_job_counts` returns cumulative data
- [ ] Stats page shows real numbers (not all zeros)
- [ ] DataForSEO scores populated (not null)

---

## 6. Production Verification Checklist

After every merge to `main`, within 5 minutes:

### Immediate (within 60 seconds)

1. **Hard refresh** production URL: `Cmd+Shift+R`
2. **Check console version**: Must print `Dashboard v3.XX loaded` matching the deploy
3. **Check for errors**: No red errors in console

### Within 5 Minutes

4. **Load Jobs Feed**: Confirm job cards render with data
5. **Load Stats page**: Confirm at least 3 charts render
6. **Check one Edge Function**: Trigger AI filter or SEO sync
7. **Verify on mobile**: Load on phone browser, check responsiveness

### If Verification Fails

- If version mismatch: Clear site data (DevTools → Application → Clear Storage)
- If still wrong version: Check Vercel deployment status, confirm the deploy completed
- If 500 errors: Check Supabase dashboard for errors, verify RLS policies
- If Edge Function 406: Redeploy with `supabase functions deploy <name> --no-verify-jwt`
- **If unrecoverable: Revert to previous tag** `git revert v3.XX..HEAD`

---

## 7. Caching Strategy

Browser caching caused 5 hours of invisible fixes on Feb 22. These rules prevent recurrence.

### Cache-Busting

- All JS bundle references in HTML must include a version query parameter:
  ```html
  <script src="/dist/dashboard.min.js?v=3.70"></script>
  ```
- The `?v=` parameter must be updated with every version bump
- Vercel's CDN edge cache is purged on every deploy automatically

### User-Side Cache Issues

If a user reports issues that don't match current production:

1. Ask them to check console version first
2. If version is stale: `Cmd+Shift+R` (hard refresh)
3. If still stale: DevTools → Application → Clear Storage → Clear site data
4. If still stale: Different browser / incognito mode
5. Document the mismatch — this is a deploy verification failure

---

## 8. Rules for Claude AI Agents

### Absolute Rules

- **NEVER** push directly to `main` or `staging`
- **NEVER** trigger the production deploy hook directly
- **NEVER** deploy without updating version in `js/app.js`, `dashboard.html`, and `index.html`
- **NEVER** deploy frontend before its Edge Function / DB dependencies are live
- **NEVER** deploy more than 3 versions without the user verifying the intermediate state
- **ALWAYS** create a feature branch, commit, push, and inform the user
- **ALWAYS** include the version number in commit messages
- **ALWAYS** run `node build.js` and verify the version appears in `dist/dashboard.min.js`
- **ALWAYS** confirm deployment landed by checking Vercel job status

### Safe Agent Push Pattern

```
1. Fetch latest dev HEAD SHA from GitHub API
2. Create feature branch from dev HEAD
3. Make changes locally, build, verify
4. Push to feature branch
5. Report branch name to user for PR creation
6. DO NOT merge. DO NOT deploy. User handles from here.
```

### Emergency Override (Hotfix)

Only when explicitly instructed by the user for a production emergency:

```
1. Create hotfix/ branch from main
2. Make minimal fix
3. Push to hotfix/ branch  
4. Inform user to merge via GitHub
5. After merge confirmed, cherry-pick to dev and staging
```

---

## 9. Supabase Environment Strategy

### Current: Single Project

All environments share one Supabase instance (`qojhagupdnbtomfoxnsf`).

**Implications:**
- Schema changes are immediately live for all environments
- Migrations must be backward-compatible (additive only)
- New columns: nullable or with DEFAULT
- New RPCs: can deploy immediately (additive)
- Renamed/dropped columns: 2-phase (add new → migrate → update code → drop old)

### Edge Function Deploys

```bash
SUPABASE_ACCESS_TOKEN=sbp_... npx supabase functions deploy <name> \
  --no-verify-jwt --project-ref qojhagupdnbtomfoxnsf
```

After deploy, verify by calling the function and checking the response.

---

## 10. Rollback Procedures

### Frontend Rollback

```bash
# Revert to previous version
git revert HEAD --no-edit
git push origin main
# Vercel auto-deploys the revert
```

Or via Vercel dashboard: Deployments → find previous deploy → Promote to Production.

### Edge Function Rollback

Re-deploy the previous version of the function from the git history:

```bash
git checkout v3.XX -- supabase/functions/<name>/index.ts
SUPABASE_ACCESS_TOKEN=sbp_... npx supabase functions deploy <name> --no-verify-jwt --project-ref qojhagupdnbtomfoxnsf
```

### Database Rollback

No automated rollback. For schema changes:
- If additive (new column): Leave it, it's harmless
- If destructive (dropped column): Restore from Supabase backup (daily automatic backups)

---

## 11. Implementation Checklist

| # | Task | Owner | Time |
|---|------|-------|------|
| 1 | Create `dev` and `staging` branches from current `main` HEAD | CPO | 5 min |
| 2 | Set up GitHub branch protection rules (Section 8) | CPO | 10 min |
| 3 | Configure Vercel preview deployments for `dev` and `staging` | CPO | 15 min |
| 4 | Add `staging` and `dev` CNAME records in Cloudflare DNS | CPO | 5 min |
| 5 | Add `?v=` cache-busting parameters to all script tags | Agent | 10 min |
| 6 | Update Claude Project instructions with agent rules | CPO | 10 min |
| 7 | Tag current production: `git tag v3.70` | CPO | 2 min |
| 8 | Update roadmap with v3.44–v3.70 entries | Agent | 15 min |

**Total setup time: ~1 hour. Zero downtime.**

---

## 12. Monitoring & Alerts

### What to Monitor

- **Vercel deployment status** — check after every push
- **Browser console version** — first thing after every deploy
- **Supabase Edge Function logs** — after Edge Function deploys
- **Error rate in console** — 500s, 401s, 406s should be zero

### When Something Breaks

1. **Don't panic-deploy more fixes on top.** Diagnose first.
2. Check what version the user is actually running (console).
3. Check if it's a caching issue before assuming code is broken.
4. If code is broken: revert to last known good tag, then fix on a branch.
5. Document the failure in the roadmap as a lessons-learned entry.
