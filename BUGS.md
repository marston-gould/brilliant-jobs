# Bug Tracker — v11.98 Session (2026-03-22)

## Open Issues

### CRIT-001: Pipeline saves fail silently (400 error)
- `user_pipeline` table has no unique constraint on `(user_id, job_id)`
- Upsert with `onConflict: 'user_id,job_id'` returns 400
- Fix: Add unique constraint OR change to insert-with-duplicate-ignore
- Impact: Pipeline button turns green locally but never writes to DB → not in My Applications

### CRIT-002: Pagination changes page selector but not content
- Root cause: TBD — setPage calls search(page) correctly but results don't update
- Need to investigate whether cache or search abort is interfering

### BUG-001: HOW MUCH pill — can't delete, shows wrong value
- Two separate `update()` calls in onClick — second overwrites first (stale closure)
- Fix: single `onChange({ ...values, payMin: '', payMax: '' })` call

### BUG-002: Browse modal — all titles say "Browse Companies"
- `CompanyBrowseModal` has `DIMENSION_LABELS` but never uses it in the header
- Fix: pass `DIMENSION_LABELS[dimension]` to modal title

### BUG-003: Browse modal — wrong data for all non-company dimensions
- `DIMENSION_COLUMNS` maps skills→department, level→level, title→title
- Modal only reloads on `[open]` not `[open, dimension]` — stale data
- title dimension shows full JD titles not normalized titles
- Skills shows departments not skills
- Level shows company names not levels
- Fix: add dimension to useEffect deps, fix column mapping, normalize/deduplicate

### BUG-004: Browse Companies alphabet — only shows _, 0, 1
- get_company_list RPC returns 404 — function doesn't exist
- Falls back to `select company_name limit(1000)` — only gets first 1000 rows, missing A-Z
- Fix: remove RPC call, use proper distinct query with higher limit

### BUG-005: Browse items not deduplicated by case
- "Engineering", "ENGINEERING", "engineering" all appear separately
- Fix: normalize to lowercase when building the list

### BUG-006: Saved search pill chips show as plain text not chips
- Chips render in HTML but styling may not match design intent
- User expects visual pill chips with color, not inline text

### BUG-007: All jobs tagged C-Suite
- `extracted_seniority` being applied incorrectly or Tuning level groupings not applied
- Need to investigate level display logic

### BUG-008: Newest job is 5+ days old
- Data ingestion issue — not a frontend bug
- Check ATS crawler / job ingestion pipeline

### BUG-009: Trust Level and AI Content grades not visible on job cards
- Was disabled as part of cost-reduction
- Should be available as opt-in (for credits)

### BUG-010: Search slow when switching filters
- Multiple concurrent Supabase queries per filter change
- Investigate debounce and query cancellation

### BUG-011: Console errors on pagination
- TBD — need error details

### INFO-001: Browse Job Titles — should use normalized/common titles
- Current: shows raw title from job postings (verbose)
- Better: extract common titles using ngrams, exclude years

### DEPLOY-001: Each file commit creates separate Vercel deployment (58 per release)
- Fix: use GitHub tree API to batch all files in single commit
- Status: PENDING — implement in next session
