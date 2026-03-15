# AIS-001 Session Plan — Application Intelligence Suite

**Spec:** SPEC-AIS-001  
**Date:** 2026-03-15  
**Total Sessions:** 28  
**Total Effort:** ~101 engineering days (45 Pod 2 + 56 Pod 3)  
**Timeline:** ~11 weeks (4 phases)

---

## Phase A — Foundation (Weeks 1–2)

Unlock existing functionality for consumers. Highest ROI, lowest effort.

### AIS-F3-S1: Auto-Apply Consumer Gate Removal
**Feature:** #3 Auto-Apply (Form Filling)  
**Effort:** Pod 2: 1d, Pod 3: 2d  
**What:**
- Remove admin-only check from auto-fill in extension
- Wire `tierGate.js` as sole access control (Free=0/day, Starter=5/day, Pro=unlimited)
- Application Mode integration: respect selected mode before triggering fill
- Anti-detection: randomized delay (45–90s), session limits (max 25), failure circuit breaker (3 consecutive failures = pause + alert)
- PostHog event: `auto_apply_consumer_triggered` (platform, job_id, mode, tier)

**Entry Gate:** None  
**Tests:** free=blocked, starter=5/day enforced, pro=unlimited, mode logic respected, circuit breaker fires at 3 failures

---

### AIS-F4-S1: AI Q&A Gate Removal + Answer Review Mode
**Feature:** #4 AI Application Q&A Answers  
**Effort:** Pod 2: 0.5d, Pod 3: 1.5d  
**What:**
- Remove admin-only check from `aiAnswerer.js` + `answer-form-question` EF
- Add answer review mode: for Score-Gated/Manual, show AI answer BEFORE submitting (editable)
- Tier gate: same as F3 (not admin gate)
- PostHog events: `ai_answer_generated` (job_id, field_label, cached, credits_charged), `ai_answer_feedback` (job_id, field_label, rating)

**Entry Gate:** AIS-F3-S1 complete  
**Tests:** gate removed, review panel shown in correct modes, auto-fill in auto modes, thumbs up/down fires PostHog

---

### AIS-F4-S2: Answer History Table + Personal Context
**Feature:** #4 AI Application Q&A Answers  
**Effort:** Pod 2: 0.5d, Pod 3: 1.5d  
**What:**
- Create `answers` table: user_id, job_id, field_label, generated_answer, user_edited_answer, feedback, created_at
- Persist generated answers (currently only in extension local cache)
- Wire LinkedIn profile + resume text into answer prompt for personalized responses
- Credit deduction: 0.5/answer; identical field_label + similar job title = free (cached)

**Entry Gate:** AIS-F4-S1 complete  
**Tests:** answers persisted to table, cache hit returns free, credit deducted on new answer, personalization data in prompt

---

### AIS-F2-S1: LinkedIn Import — EF + Storage
**Feature:** #2 LinkedIn Profile Import  
**Effort:** Pod 2: 2d  
**What:**
- Build `parse-linkedin-pdf` Edge Function: Claude Haiku for non-standard PDF layouts, extract name/headline/location/experience/skills/education/connection count
- Create `linkedin_profiles` table: user_id, display_name, headline, location, experience_json, skills_array, education_json, li_connections, pdf_hash, raw_pdf_url, parsed_at
- Create `linkedin-profiles` Storage bucket: private, RLS-protected, 10MB max
- Fraud signals: PDF hash dedup (same file = reject), connections < 50 = flag, parse failure = reject with error, blank sections = flag
- RLS on all new tables

**Entry Gate:** None  
**Tests:** parse extracts all structured fields, dedup rejects duplicate hash, connections < 50 flagged, non-LinkedIn PDF rejected with error

---

### AIS-F2-S2: LinkedIn Import — Upload UI + Profile Auto-Population
**Feature:** #2 LinkedIn Profile Import  
**Effort:** Pod 3: 3d  
**What:**
- Drag-and-drop / file picker upload on Setup page
- Parsed profile preview before save (user confirms)
- Clear error messaging for non-LinkedIn PDFs or parse failures
- Auto-populate user profile fields from parsed data
- Suggest filter keywords from extracted skills
- Infer seniority level from experience history
- PostHog event: `linkedin_pdf_uploaded` (file_size, parse_success, fields_extracted_count)

**Entry Gate:** AIS-F2-S1 complete  
**Tests:** upload triggers parse, preview shown before save, profile fields auto-filled, keywords suggested, seniority inferred, errors surfaced clearly

---

## Phase B — Intelligence Engine (Weeks 3–4)

Build the AI backend that powers everything else.

### AIS-F8-S1: Cover Letter Generator — UI + Table
**Feature:** #8 AI Cover Letter Generator  
**Effort:** Pod 2: 1d, Pod 3: 2d  
**What:**
- Create `cover_letters` table: user_id, job_id, resume_id, tone, content, version, ai_score, credits_charged, created_at
- Build slide-out panel on Applications page: generated letter, edit in place, regenerate, accept
- Tone selector: Professional, Conversational, Enthusiastic, Executive (meaningfully different, not synonym swaps)
- Context inputs: resume text + JD + ats_companies enrichment data + LinkedIn profile (if available)
- Version history: each regeneration = new version, user can compare/select
- DOCX export matching resume template style
- Remove admin gate from `generate-cover-letter` EF for consumers
- PostHog event: `cover_letter_generated` (job_id, tone, version, credits_charged)

**Entry Gate:** None  
**Tests:** letter generated with company-specific references, tone selector produces distinct output, version history saves correctly, DOCX downloads, credit deducted

---

### AIS-F8-S2: Cover Letter Auto-Attach in Apply Flow
**Feature:** #8 AI Cover Letter Generator  
**Effort:** Pod 2: 2d, Pod 3: 2d  
**What:**
- Auto-attach cover letter to application when auto-apply or bulk apply runs (if cover letter exists for that job)
- Detect cover letter fields in ATS forms, paste content
- Auto-generate setting in Application Mode settings: if enabled, generate at apply time (2 additional credits)
- Cache generated letters: same company reuses existing letter
- Credit model: 2 credits/letter; cached = free

**Entry Gate:** AIS-F8-S1 complete  
**Tests:** letter auto-attaches when exists, cover letter field detected and populated, auto-generate setting respected, cache reuse works, credits charged correctly

---

### AIS-F1-S1: Resume Tailoring — rewrite-resume EF (Agents 1–2)
**Feature:** #1 One-Click Resume Tailoring  
**Effort:** Pod 2: 2d  
**What:**
- Build `rewrite-resume` Edge Function, agent 1: Gap Analyzer (Claude Haiku) — compares resume vs JD, outputs structured gap list
- Agent 2: Question Generator (Claude Haiku) — generates 1–5 targeted questions based on actual gaps (not generic)
- Separate invocations to stay within 150s Supabase limit
- Create `resume_rewrites` table: user_id, resume_id, job_id, original_text, rewritten_text, diff_json, original_score, new_score, credits_charged, status (pending/processing/complete/failed), created_at
- Status tracking throughout pipeline

**Entry Gate:** score-resume EF in production (confirmed ✅)  
**Tests:** gap list references specific JD requirements, questions are targeted (not generic), status transitions correctly, table RLS enforced

---

### AIS-F1-S2: Resume Tailoring — rewrite-resume EF (Agents 3–4)
**Feature:** #1 One-Click Resume Tailoring  
**Effort:** Pod 2: 3d  
**What:**
- Agent 3: Resume Rewriter (Claude Sonnet) — produces rewritten resume text using gap list + user Q&A answers
- Agent 4: Quality Checker — fabrication detection (>95% truthfulness gate; rejects fabricated claims)
- Diff JSON output: structured change set (added/restructured/removed per section)
- Status: processing → complete/failed, with error messaging on failure
- 0 credits charged on failure

**Entry Gate:** AIS-F1-S1 complete  
**Tests:** rewrite improves score ≥15 pts avg, quality checker catches fabricated employer, diff JSON is structurally valid, failure returns 0 credits, wall-clock time (excl. Q&A) < 20s

---

### AIS-F1-S3: Resume Tailoring — Q&A Panel + Diff Preview UI
**Feature:** #1 One-Click Resume Tailoring  
**Effort:** Pod 3: 3d  
**What:**
- Client-side Q&A panel: replaces AI analysis area when active, progress indicator (stage 1/4–4/4), one question at a time, skip/back buttons, conversational tone (career coach feel, not a form)
- Side-by-side diff preview: green (added), amber (restructured), red strikethrough (removed)
- Accept all / cherry-pick per section / reject with feedback
- DOCX download of tailored resume (text-only, no layout changes for V1)
- PostHog event: `resume_rewrite_qa_skipped` (question_index, question_type)

**Entry Gate:** AIS-F1-S2 complete  
**Tests:** Q&A shows correct question count, skip/back work, diff renders all three change types, accept all applies full rewrite, cherry-pick applies selected sections only, DOCX downloads

---

### AIS-F1-S4: Resume Tailoring — CTA Triggers + Credit System
**Feature:** #1 One-Click Resume Tailoring  
**Effort:** Pod 2: 3d, Pod 3: 2d  
**What:**
- Credit balance infrastructure: check balance before AI ops, deduct on completion, top-up flow
- CTA trigger points wired: Jobs Feed Match% column (< 85%), Resume Readiness grade card (< A), Job Detail slide-out, Pipeline Saved stage
- 3 credits deducted on success, 0 on failure
- PostHog events: `resume_rewrite_started` (job_id, resume_id, original_score, mode), `resume_rewrite_completed` (job_id, resume_id, original_score, new_score, credits_charged)

**Entry Gate:** AIS-F1-S3 complete  
**Tests:** all 4 CTA entry points open tailoring flow, credit balance checked before start, 3 credits deducted on success, 0 on failure, insufficient credits shows top-up prompt

---

## Phase C — Application Modes (Weeks 5–6)

Consumer-facing experience that ties intelligence to action.

### AIS-F5-S1: App Modes — Extension Popup + chrome.storage Sync
**Feature:** #5 Application Mode UI (6 Modes)  
**Effort:** Pod 2: 0.5d, Pod 3: 2d  
**What:**
- Radio card mode selector in extension popup (6 modes with labels, risk levels, tier badges)
- Persists to `chrome.storage.sync` for cross-device roaming
- Admin/consumer toggle: admins see legacy admin view + new consumer view; non-admins see consumer only
- PostHog event: `application_mode_changed` (old_mode, new_mode, source)

**Entry Gate:** AIS-F3-S1, AIS-F1-S4 complete  
**Tests:** mode persists across browser restart, cross-device sync, admin toggle shows/hides legacy view, PostHog fires on change

---

### AIS-F5-S2: App Modes — Content Script + Apply Button Interception
**Feature:** #5 Application Mode UI (6 Modes)  
**Effort:** Pod 2: 1d, Pod 3: 3d  
**What:**
- `job-site-overlay.ts` content script
- 'Save to BJ Pipeline' button injection on job listing pages using `job-sites.json` per-site CSS selectors
- Apply button interception: detect native apply click, route through mode logic before submission
- Manifest v3 update: add content_scripts entry, web_accessible_resources
- Bump extension to 3.1.0

**Entry Gate:** AIS-F5-S1 complete  
**Tests:** save button injects on all configured sites, interception fires before native submit, mode=manual allows native submit, mode=auto-apply triggers fill immediately

---

### AIS-F5-S3: App Modes — Shadow DOM Score Gate Popup
**Feature:** #5 Application Mode UI (6 Modes)  
**Effort:** Pod 2: 1.5d, Pod 3: 2d  
**What:**
- Shadow DOM overlay on apply click (score-gated modes): match %, JD gap summary, rewrite CTA, apply/cancel
- Must render in Shadow DOM — no CSS conflicts with host page
- score-resume EF call triggered on interception
- Handles score below/above threshold correctly per mode
- PostHog event: `score_gate_shown` (job_id, score, threshold, user_action)

**Entry Gate:** AIS-F5-S2 complete, score-resume EF production  
**Tests:** Shadow DOM renders without CSS bleed, score fetched within 3s, above-threshold auto-applies, below-threshold shows popup, rewrite CTA opens tailoring flow

---

### AIS-F5-S4: App Modes — Dashboard Sync + Rate Limiting
**Feature:** #5 Application Mode UI (6 Modes)  
**Effort:** Pod 2: 1d, Pod 3: 1d  
**What:**
- Current mode visible on Applications > Settings sub-tab
- Mode changeable from dashboard (syncs to extension via `chrome.storage.sync`)
- Rate limiting hardening: randomized delay (45–90s), cool-down period, session limits
- Failure circuit breaker: 3 consecutive failures on one platform = pause + alert user

**Entry Gate:** AIS-F5-S3 complete  
**Tests:** dashboard mode change reflects in extension, extension mode change reflects in dashboard, rate limits enforced, circuit breaker triggers at 3 failures

---

### AIS-F6-S1: Review Before Submit — Interception Panel
**Feature:** #6 Review Before Submit  
**Effort:** Pod 2: 1d, Pod 3: 2d  
**What:**
- Pre-submit review panel (Score-Gated + Auto+Score Gate modes): job title, company, match score, resume version (with tailored indicator), AI answers (editable), cover letter (if exists)
- Edit-in-place: modify AI answers, swap resume version, regenerate cover letter without leaving page
- Submit / Cancel / Save for Later actions
- Submit fires auto-fill; Cancel aborts; Save for Later queues to Review Queue
- PostHog event: `review_panel_shown` (job_id, resume_version, has_cover_letter, user_action)

**Entry Gate:** AIS-F5-S3 complete, AIS-F8-S1 complete  
**Tests:** panel shows in Score-Gated mode, skipped in Full Autopilot, edits to answers persist to submit, cancel aborts fill, save for later adds to queue

---

### AIS-F6-S2: Review Queue on Dashboard
**Feature:** #6 Review Before Submit  
**Effort:** Pod 3: 2d  
**What:**
- Review Queue section on Applications page: jobs parked via "Save for Later" from review panel
- Status indicators, apply/discard actions
- Integration with pipeline board (moves to Saved stage on apply)

**Entry Gate:** AIS-F6-S1 complete  
**Tests:** saved jobs appear in Review Queue, apply from queue triggers fill and moves to pipeline, discard removes from queue

---

## Phase D — Scale + New (Weeks 7–11)

Higher-complexity features building on the complete foundation.

### AIS-F9-S1: Bulk Apply — Multi-Select UI + Bulk Action Bar
**Feature:** #9 Mass/Bulk Auto-Apply  
**Effort:** Pod 3: 2d  
**What:**
- Checkbox column on Jobs Feed job cards
- 'Select All Matching' button (selects all visible/filtered jobs)
- Selection count badge in toolbar
- Bulk action bar (appears when ≥1 selected): Apply to Selected (primary), Save to Pipeline, Generate Cover Letters for Selected
- Estimated credit cost display before triggering

**Entry Gate:** AIS-F3-S1 complete  
**Tests:** checkboxes render, select all works, count badge updates, bulk bar appears/disappears, credit estimate calculated correctly

---

### AIS-F9-S2: Bulk Apply — Queue Table + EF
**Feature:** #9 Mass/Bulk Auto-Apply  
**Effort:** Pod 2: 3d  
**What:**
- Create `bulk_apply_jobs` table: user_id, job_id, resume_id, cover_letter_id, status (queued/scoring/rewriting/filling/submitted/failed), error_message, queued_at, started_at, completed_at
- `bulk-apply-queue` Edge Function: sequential processing, 45–90s randomized delay, max 25/session, retry logic (max 2 retries/job)
- Score gate integration: jobs below threshold flagged for review, not auto-submitted
- Duplicate detection: skip jobs in pending_applications
- Safety: 30-min cool-down after bulk session

**Entry Gate:** AIS-F9-S1 complete, AIS-F5-S1 complete  
**Tests:** queue processes sequentially, delay enforced, max 25 per session, retry fires on failure, duplicate skipped, cool-down enforced

---

### AIS-F9-S3: Bulk Apply — Progress Dashboard + Safety Controls
**Feature:** #9 Mass/Bulk Auto-Apply  
**Effort:** Pod 2: 2d, Pod 3: 4d  
**What:**
- Real-time progress bar on Applications page: queue status, per-job indicators (queued=gray, in progress=blue pulse, submitted=green, failed=red+error)
- Clickable job rows for detail
- Daily limits: Pro=50/day, Starter=10/day
- Platform spacing: min 60s between applications to same ATS platform
- 10-second 'Cancel All Remaining' undo window after bulk apply starts
- PostHog events: `bulk_apply_started` (job_count, mode, estimated_credits), `bulk_apply_completed` (jobs_submitted, jobs_failed, jobs_skipped, duration_seconds)

**Entry Gate:** AIS-F9-S2 complete  
**Tests:** progress updates in real-time, daily limit blocks at threshold, platform spacing enforced, cancel window works within 10s, PostHog fires correctly

---

### AIS-F10-S1: LinkedIn Auto-Apply Hardening
**Feature:** #10 LinkedIn Auto-Apply  
**Effort:** Pod 2: 2d  
**What:**
- LinkedIn Easy Apply handler: randomized interaction delays (scroll pauses, field focus delays, tab switches — not just typing)
- Viewport-aware interactions: no clicks outside visible viewport
- Session cookie management improvements
- Max 15 Easy Apply applications/day/account enforcement
- CAPTCHA/verification detection: pause immediately + alert user to complete manually

**Entry Gate:** AIS-F3-S1 complete  
**Tests:** delays are genuinely randomized (not uniform), viewport check prevents off-screen clicks, daily limit enforced, CAPTCHA detection triggers pause + alert

---

### AIS-F10-S2: LinkedIn Multi-Step + Profile Sync
**Feature:** #10 LinkedIn Auto-Apply  
**Effort:** Pod 2: 2d, Pod 3: 2d  
**What:**
- Multi-step Easy Apply support (1–6 pages): page transition detection, fill each page, handle Review step before final submit
- LinkedIn-specific Q&A: test and optimize aiAnswerer.js for LinkedIn's specific question patterns
- Profile data sync: if LinkedIn profile imported (F2), use exact field matches to reduce detection risk
- Connection awareness: before applying, check connections at company; surface 'You know people here' prompt
- PostHog event: `linkedin_easy_apply_triggered` (job_id, steps_count, connections_at_company)

**Entry Gate:** AIS-F10-S1 complete, AIS-F2-S2 complete  
**Tests:** multi-step fills all pages, Review step handled, Q&A answers accurate for LinkedIn patterns, connection prompt fires when applicable

---

### AIS-F7-S1: Resume Builder — Input Wizard + Generation EF
**Feature:** #7 AI Resume Builder  
**Effort:** Pod 2: 3d, Pod 3: 3d  
**What:**
- 4–6 screen input wizard: target role, industry, years of experience, key accomplishments (free-text), skills, education
- Pre-fill all fields from LinkedIn profile if exists (F2)
- Resume generation Edge Function: inputs + optional LinkedIn data + target filter keywords → ATS-optimized resume sections (summary, experience, skills, education). Claude Sonnet.
- Returns structured sections (not raw text blob)

**Entry Gate:** AIS-F2-S2 complete  
**Tests:** wizard pre-fills from LinkedIn, generation produces all 4 sections, ATS-incompatible formatting absent (no columns/tables/headers), keywords from target filters appear in output

---

### AIS-F7-S2: Resume Builder — Template Engine + Editor + Export
**Feature:** #7 AI Resume Builder  
**Effort:** Pod 2: 3d, Pod 3: 5d  
**What:**
- 3–5 ATS-friendly templates: CSS-driven for web preview, no graphics/columns/headers that choke ATS parsers
- Live score preview during generation: projected match score vs active filters
- Section editor: post-generation per-section edits, each edit triggers re-score showing impact
- DOCX + PDF export: downloadable in both formats. PDF via headless rendering of web preview
- Tier gate: Free=1 generation (onboarding hook), Pro=unlimited
- PostHog event: `resume_built_from_scratch` (source: linkedin/manual, template, initial_score)

**Entry Gate:** AIS-F7-S1 complete  
**Tests:** all 3 templates render correctly in browser and export, live score updates on edit, DOCX downloads, PDF downloads, free tier gate at 2nd generation, tier upgrade prompt shown

---

### AIS-F11-S1: Interview Practice — EF + Session Table
**Feature:** #11 AI Interview Practice  
**Effort:** Pod 2: 3d  
**What:**
- `interview-practice` Edge Function: accepts session_type (general/role-specific/company), job_id, resume_id → generates 5–10 questions. For each user answer, generates follow-up + real-time feedback. Claude Sonnet.
- Three session types: (a) General behavioral (STAR method), (b) Role-specific technical (JD-based), (c) Company-specific (ats_companies data)
- Question generation: 50% JD analysis, 30% resume gap analysis, 20% industry patterns
- Create `interview_sessions` table: user_id, job_id, session_type, questions_json, answers_json, feedback_json, aggregate_score, duration_seconds, created_at
- Scoring dimensions: relevance (25%), specificity (25%), structure (20%), JD alignment (20%), communication (10%)

**Entry Gate:** None  
**Tests:** questions are role-specific (not generic), follow-up questions reference prior answer, feedback covers all 5 scoring dimensions, session saved to table, credit deducted (3/session)

---

### AIS-F11-S2: Interview Practice — Chat UI + Feedback + History
**Feature:** #11 AI Interview Practice  
**Effort:** Pod 3: 6d  
**What:**
- Chat-based UI: slide-out panel on Pipeline page, contextual per job
- AI interviewer asks questions one at a time, user types answer, AI responds with follow-up or next question
- Per-answer feedback: strength assessment, gap assessment, suggested stronger answer, STAR structure check (for behavioral)
- Aggregate scores at session end across all 5 dimensions
- Session history page/section: past sessions, improvement tracking over time, re-practice low-scored questions
- Pipeline integration: when entry reaches 'Interview' stage, auto-prompt 'Practice for this interview' CTA on Pipeline card
- Tier gate: Free=1 session, Pro=unlimited
- PostHog events: `interview_practice_started` (job_id, session_type, question_count), `interview_practice_completed` (job_id, aggregate_score, duration_seconds, questions_answered)

**Entry Gate:** AIS-F11-S1 complete  
**Tests:** chat UI renders contextually per job, feedback shows all 4 components per answer, aggregate score calculated, history shows past sessions, pipeline CTA appears at Interview stage, free gate fires at 2nd session

---

### AIS-F12-S1: Resume A/B Testing — Engine + Tables
**Feature:** #12 Resume A/B Testing  
**Effort:** Pod 2: 4d  
**What:**
- Create `resume_ab_tests` table: user_id, test_name, filter_id, variant_a_resume_id, variant_b_resume_id, status (active/paused/completed), winner_id, min_sample_size, created_at, completed_at
- Create `resume_ab_results` table: test_id, job_id, variant (a/b), resume_id, applied_at, response_received, response_at, outcome (no_response/rejected/interview/offer), days_to_response
- Alternating assignment logic: round-robin variant selection at apply time
- Hook into auto-apply (F3), bulk apply (F9), and manual apply flows
- Outcome tracking: pipeline stage changes (responded/interview/offer/rejected) flow into resume_ab_results automatically
- Tier gate: Free=no A/B, Pro/PAYL=1 active test

**Entry Gate:** AIS-F3-S1 complete (or AIS-F9-S2)  
**Tests:** round-robin alternates correctly, assignment logged per application, outcome updates from pipeline stage changes, tier gate blocks free users, RLS enforced on both tables

---

### AIS-F12-S2: Resume A/B Testing — Results Dashboard + Auto-Winner
**Feature:** #12 Resume A/B Testing  
**Effort:** Pod 3: 5d  
**What:**
- Test creation UI on Resumes page: select 2 resumes, assign to filter, set min sample size (default 20/variant)
- Results card per active test: applications sent, responses received, response rate %, avg days to response, interview rate, statistical significance indicator
- Visual bar chart comparing two variants
- Statistical significance: chi-squared or Fisher's exact test (p < 0.05)
- Minimum 10 applications/variant before showing comparison; minimum 20 before stat sig testing; 'Not enough data yet' messaging below threshold
- Response rate with confidence interval (not just point estimate)
- Warning when variant job quality differs significantly (company size / salary range divergence)
- Auto-winner declaration: when both hit min sample + stat sig advantage → declare winner, notify user, offer to set as default for that filter
- Manual override: pause / end / swap variants at any time; early end = inconclusive flag
- PostHog events: `resume_ab_test_created`, `resume_ab_variant_assigned`, `resume_ab_winner_declared`

**Entry Gate:** AIS-F12-S1 complete  
**Tests:** test creation assigns to filter, results card shows correct metrics, stat sig indicator only appears ≥20/variant, auto-winner fires at p<0.05, manual pause/end work, inconclusive flag on early end

---

## Session Index

| Session | Feature | Phase | Pod 2 | Pod 3 | Total |
|---------|---------|-------|-------|-------|-------|
| AIS-F3-S1 | Auto-Apply Gate Removal | A | 1d | 2d | 3d |
| AIS-F4-S1 | AI Q&A Gate Removal + Review Mode | A | 0.5d | 1.5d | 2d |
| AIS-F4-S2 | Answer History + Personal Context | A | 0.5d | 1.5d | 2d |
| AIS-F2-S1 | LinkedIn Import EF + Storage | A | 2d | — | 2d |
| AIS-F2-S2 | LinkedIn Import UI + Auto-Population | A | — | 3d | 3d |
| AIS-F8-S1 | Cover Letter UI + Table | B | 1d | 2d | 3d |
| AIS-F8-S2 | Cover Letter Auto-Attach | B | 2d | 2d | 4d |
| AIS-F1-S1 | Resume Tailoring EF Agents 1–2 | B | 2d | — | 2d |
| AIS-F1-S2 | Resume Tailoring EF Agents 3–4 | B | 3d | — | 3d |
| AIS-F1-S3 | Resume Tailoring Q&A Panel + Diff UI | B | — | 3d | 3d |
| AIS-F1-S4 | Resume Tailoring CTA Triggers + Credits | B | 3d | 2d | 5d |
| AIS-F5-S1 | App Modes Popup + Storage Sync | C | 0.5d | 2d | 2.5d |
| AIS-F5-S2 | App Modes Content Script + Interception | C | 1d | 3d | 4d |
| AIS-F5-S3 | App Modes Shadow DOM Score Gate | C | 1.5d | 2d | 3.5d |
| AIS-F5-S4 | App Modes Dashboard Sync + Rate Limiting | C | 1d | 1d | 2d |
| AIS-F6-S1 | Review Before Submit Panel | C | 1d | 2d | 3d |
| AIS-F6-S2 | Review Queue on Dashboard | C | — | 2d | 2d |
| AIS-F9-S1 | Bulk Apply Multi-Select UI | D | — | 2d | 2d |
| AIS-F9-S2 | Bulk Apply Queue Table + EF | D | 3d | — | 3d |
| AIS-F9-S3 | Bulk Apply Progress Dashboard + Safety | D | 2d | 4d | 6d |
| AIS-F10-S1 | LinkedIn Auto-Apply Hardening | D | 2d | — | 2d |
| AIS-F10-S2 | LinkedIn Multi-Step + Profile Sync | D | 2d | 2d | 4d |
| AIS-F7-S1 | Resume Builder Wizard + Generation EF | D | 3d | 3d | 6d |
| AIS-F7-S2 | Resume Builder Templates + Editor + Export | D | 3d | 5d | 8d |
| AIS-F11-S1 | Interview Practice EF + Session Table | D | 3d | — | 3d |
| AIS-F11-S2 | Interview Practice Chat UI + History | D | — | 6d | 6d |
| AIS-F12-S1 | Resume A/B Testing Engine + Tables | D | 4d | — | 4d |
| AIS-F12-S2 | Resume A/B Testing Results + Auto-Winner | D | — | 5d | 5d |
| **TOTAL** | | | **45d** | **56d** | **101d** |

---

## Dependency Chain

```
AIS-F2-S1 → AIS-F2-S2
AIS-F3-S1 → AIS-F4-S1 → AIS-F4-S2
AIS-F3-S1 → AIS-F5-S1 → AIS-F5-S2 → AIS-F5-S3 → AIS-F5-S4
AIS-F1-S1 → AIS-F1-S2 → AIS-F1-S3 → AIS-F1-S4
AIS-F1-S4 + AIS-F3-S1 → AIS-F5-S1
AIS-F8-S1 → AIS-F8-S2
AIS-F5-S3 + AIS-F8-S1 → AIS-F6-S1 → AIS-F6-S2
AIS-F3-S1 → AIS-F9-S1 → AIS-F9-S2 → AIS-F9-S3
AIS-F3-S1 → AIS-F10-S1 → AIS-F10-S2
AIS-F2-S2 → AIS-F7-S1 → AIS-F7-S2
AIS-F11-S1 → AIS-F11-S2
AIS-F9-S2 → AIS-F12-S1 → AIS-F12-S2
```

---

*Generated 2026-03-15. Ref: SPEC-AIS-001. All sessions follow standard session lifecycle in HANDOFF.md.*
