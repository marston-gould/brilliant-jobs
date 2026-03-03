# Resume Archive & Performance Metrics — Pod 2 Handoff

**From:** Pod 1 (Growth) — CPO
**To:** Pod 2 (Engineering) — CTO
**Date:** February 24, 2026
**Priority:** P2 — Post-launch feature
**Effort:** Pod 2 to estimate (~4–5 dev days expected)
**Depends on:** Resume system (built), Pipeline system (built), AI scoring Edge Function (built)

---

## Executive Summary

Turn resumes from static uploaded documents into **performance-tracked assets**. Users should be able to archive resume versions, track how each version performs across scoring, applications, and pipeline outcomes, and make data-driven decisions about which resume to use for which roles.

This is a genuine differentiator — most platforms treat resumes as upload-and-forget. We turn them into instruments with measurable performance histories.

---

## User Stories

**As a** job seeker with multiple resume versions,
**I want to** see how each version has performed over time,
**So that** I can understand which resume works best for which types of roles.

**As a** returning user who has updated their resume,
**I want to** archive my previous version without losing its history,
**So that** I can compare old vs. new performance and revert if needed.

---

## Feature Scope

### Part A: Resume Archive

**What it does:** Adds version tracking and archive/restore capability to the existing resume system.

#### Data Model: `resume_archive`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | PK |
| `user_id` | uuid | FK → profiles |
| `resume_id` | uuid | Logical resume identifier (groups versions) |
| `version` | integer | Auto-incrementing per resume_id |
| `filename` | text | Original filename |
| `file_path` | text | Supabase Storage path |
| `extracted_text` | text | Full text content (pdf.js / mammoth.js output) |
| `file_size_bytes` | integer | For storage quota enforcement |
| `is_active` | boolean | Current version flag (only one per resume_id) |
| `is_archived` | boolean | Soft-delete / archive flag |
| `created_at` | timestamptz | Upload timestamp |
| `archived_at` | timestamptz | When archived (null if active) |
| `metadata` | jsonb | Flexible field: keyword count, page count, etc. |

**Key behaviors:**

- When user uploads a new version of an existing resume → previous version auto-archives, new version becomes active
- Archived resumes are hidden from the main Resumes view but accessible in the Archive tab
- Users can restore an archived version (makes it active, archives current)
- Users can permanently delete archived versions
- File content stored in Supabase Storage with path `resumes/{user_id}/{resume_id}/v{version}.pdf`

#### Storage Tier Limits (Placeholder — adjust post-launch)

| Tier | Max Resumes | Max Versions per Resume | Storage Cap |
|------|-------------|------------------------|-------------|
| Free | 3 | 3 | 2 MB total |
| Starter | 10 | 5 | 10 MB total |
| Pro | 25 | 10 | 50 MB total |

#### Compression Strategy

- PDFs stored as-is (already compressed)
- DOCX files: store original + extracted text separately
- Extracted text compressed via gzip before storage if > 50KB
- Archive restore is async via Edge Function if decompression needed

#### Retention

| Tier | Archived Version Retention |
|------|---------------------------|
| Free | 30 days, then auto-deleted |
| Starter | 90 days |
| Pro | Unlimited |

Credit-based retention extension: users can spend credits to extend retention on specific versions.

---

### Part B: Resume Performance Metrics

**What it does:** Tracks scoring history, job usage, and pipeline outcomes per resume version.

#### Data Model: `resume_score_history`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | PK |
| `user_id` | uuid | FK → profiles |
| `resume_id` | uuid | FK → resume_archive.resume_id |
| `version` | integer | Which version was scored |
| `filter_name` | text | Which saved filter was used |
| `score_type` | text | 'ngram' or 'ai' |
| `overall_score` | integer | 0–100 |
| `level_scores` | jsonb | `{"entry": 45, "mid": 72, "senior": 81, "director": 68}` |
| `matched_terms` | integer | Count of matched keywords |
| `total_terms` | integer | Total keywords compared |
| `top_missing` | jsonb | Array of `{term, count}` |
| `top_matched` | jsonb | Array of `{term, count}` |
| `jds_analyzed` | integer | How many JDs were in the corpus |
| `scored_at` | timestamptz | When the score was computed |

**Key behaviors:**

- Every time a resume is scored (ngram or AI), a row is inserted
- Historical scores allow trend visualization: "your resume improved from 62 → 78 after your last edit"
- Score comparisons across versions: "v3 scores 15 points higher on Senior roles than v2"
- Partition by user_id, index on (resume_id, scored_at)
- Archive scores older than 1 year for Free/Starter tiers

#### Data Model: `resume_job_usage`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | PK |
| `user_id` | uuid | FK → profiles |
| `resume_id` | uuid | FK → resume_archive.resume_id |
| `version` | integer | Which version was used |
| `job_id` | text | FK → ats_jobs |
| `company_name` | text | Denormalized for quick display |
| `job_title` | text | Denormalized for quick display |
| `match_score` | integer | Score at time of application (snapshot) |
| `pipeline_stage` | text | Current stage: saved, applied, responded, interview, offer, rejected |
| `stage_updated_at` | timestamptz | Last pipeline stage change |
| `applied_at` | timestamptz | When the application was submitted |
| `created_at` | timestamptz | When the record was created |

**Key behaviors:**

- When a user applies to a job with a specific resume, a row is created
- Pipeline stage updates propagate here from the pipeline system
- Enables per-resume stats: "Resume v3 was used on 12 jobs, 4 got responses, 2 reached interview"
- Company/job title denormalized to avoid joins on every load
- Match score is snapshotted at application time (doesn't change retroactively)

---

## UI Placement

### Option A: Inset Tab on Resumes Page (Recommended)

Similar to how Search Tuning works — the Resumes page gets a tab bar:

- **Active** — current resume management (existing view)
- **Archive** — version history, restore/delete, storage usage
- **Performance** — score trends, job usage log, pipeline outcomes

### Option B: Under Intelligence Page

If Intelligence becomes a dedicated section, Resume Performance could live there alongside other analytics. But this separates the metrics from the resume management actions, which feels less intuitive.

**CPO recommendation:** Option A for launch. Revisit if Intelligence section materializes.

---

## Metrics & Visualizations (Performance Tab)

### Per-Resume Summary Cards

- **Applications:** Total jobs this resume was used on
- **Response Rate:** % that progressed past "Applied"
- **Best Score:** Highest match score achieved + which filter
- **Last Scored:** Date + score of most recent scoring run

### Score Trend Chart

- X-axis: time (scored_at)
- Y-axis: overall_score (0–100)
- Lines: one per filter, colored by filter palette
- Overlay: version markers showing when a new version was uploaded
- ECharts, matching Stats page aesthetic

### Level Fit Breakdown

- Horizontal bar chart showing score by seniority level
- Compare across versions: "v2 vs v3 on Senior roles"

### Job Usage Log

- Table: Job Title | Company | Applied Date | Match Score | Pipeline Stage
- Sortable by date, score, stage
- Stage shown as colored dot matching pipeline color scheme
- Click-through to job detail

### Pipeline Funnel (Per Resume)

- Funnel chart: Applied → Responded → Interview → Offer
- Shows conversion rates at each stage
- Compare across resume versions

---

## Migration from localStorage

The current resume system stores metadata in `localStorage` key `bj_resumes` and file blobs in IndexedDB (`bj_resume_files`). Migration path:

1. On first load after feature ships, detect existing localStorage data
2. Prompt user: "We've upgraded resume management. Migrate your resumes to the cloud?"
3. On confirmation: upload files to Supabase Storage, create `resume_archive` rows, backfill metadata
4. Mark migration complete in user profile
5. Maintain read fallback to localStorage for 30 days, then remove

---

## Implementation Sequence

### Phase A: Archive (2–3 dev days)

1. Create `resume_archive` table + RLS policies
2. Supabase Storage bucket setup with tier-based quotas
3. Upload flow: new uploads create archive entries, version auto-increment
4. Archive/restore/delete actions on Resumes page
5. Archive inset tab UI
6. localStorage → Supabase migration flow
7. Retention enforcement via pg_cron (auto-delete expired archives)

### Phase B: Metrics (2–3 dev days)

1. Create `resume_score_history` + `resume_job_usage` tables + RLS
2. Instrument scoring functions to write history rows on every score
3. Instrument application flow to write usage rows
4. Pipeline stage change propagation to `resume_job_usage`
5. Performance tab UI: summary cards, score trend chart, job usage table
6. Level fit breakdown chart
7. Pipeline funnel per resume
8. PostHog events for tab views and metric interactions

---

## Success Criteria

- [ ] Users can upload, archive, restore, and delete resume versions
- [ ] Version history is visible with timestamps
- [ ] Storage quotas enforced per tier
- [ ] Every scoring event creates a history row
- [ ] Every application creates a usage row with pipeline tracking
- [ ] Score trend chart renders with version markers
- [ ] Job usage table is sortable and links to job details
- [ ] localStorage migration completes without data loss
- [ ] Retention enforcement runs on schedule
- [ ] No regression to existing resume scoring or feed matching

---

## Risk Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| localStorage migration data loss | High | Dual-write for 30 days. Migration is user-initiated with confirmation. Rollback retains localStorage copy. |
| Score history table grows large | Low | Partition by user_id. Index on (resume_id, scored_at). Archive scores > 1 year for Free/Starter. |
| Pipeline stage data incomplete (user-reported) | Medium | Show data confidence indicator. Cross-reference with ATS integration data where available. |
| Compression adds latency to archive/restore | Low | Async compression via Edge Function. Show progress indicator on restore. |
| Storage cost scaling with user growth | Medium | Aggressive tier limits on Free/Starter. Monitor Supabase Storage costs per cohort in Revenue tab. |

---

## Open Questions for Pod 2

1. **Supabase Storage bucket:** Single bucket with path-based organization, or separate buckets per tier? Single bucket with RLS is simpler.
2. **Score history write path:** Should the Edge Function (`score-resume`) write directly to `resume_score_history`, or should the client write after receiving the response? Server-side is more reliable.
3. **Pipeline propagation:** When pipeline stage changes on the Pipeline page, what's the cleanest way to update `resume_job_usage`? Database trigger on pipeline table? Client-side dual-write?
4. **ECharts version:** Same instance/version as Stats page? Confirm shared CDN bundle.
5. **Migration timing:** Ship archive first (Phase A) and let it stabilize before adding metrics (Phase B), or ship together?

---

*This brief was produced by Pod 1 (Growth). Pod 2 has authority to push back on effort estimates, suggest simpler alternatives, and flag technical risks. Security concerns are Pod 2 veto territory. Scope changes require CPO approval.*
