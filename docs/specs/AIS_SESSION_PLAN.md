# AIS_SESSION_PLAN.md — Application Intelligence Suite

**28 Sessions across 4 Phases (~11 weeks)**
Reference spec: SPEC_AIS_001_ApplicationIntelligenceSuite.md

Each session = one shippable unit. Tests + three-file close (ROADMAP.md, roadmap.html, HANDOFF.md) required on every session close.

---

## Phase A — Foundation (Weeks 1–2)
*Unlock existing admin-only functionality for consumers. Highest ROI, lowest effort.*

### AIS-F3-S1: Auto-Apply Consumer Gate Removal
**Feature:** #3 Auto-Apply (Form Filling)
**Pod:** 3
**Effort:** 2d

**Deliverables:**
- Remove admin-only check on auto-fill functionality in extension + dashboard
- Wire tierGate.js as the sole access control (Free=0/day, Starter=5/day, Pro=unlimited)
- Application Mode integration: Manual=no auto-fill, Score-Gated=auto-fill after score check, Auto Apply=fill immediately
- Fill status dashboard panel: surface real-time fill progress/success/error in Applications page
- Error recovery UI: actionable guidance on fill failure (dropdown mismatch, file upload error, CAPTCHA)
- Anti-detection enforcement: randomized delay (45–90s), session limits (max 25), failure circuit breaker (3 consecutive failures = pause + alert)

**PostHog events:** `auto_apply_consumer_triggered`
**Tests:** free=blocked, starter=5/day enforced, pro=unlimited, mode routing correct
**Entry gate:** staging synced to main ✅

---

### AIS-F4-S1: AI Q&A Gate Removal + Answer Review Mode
**Feature:** #4 AI Application Q&A Answers
**Pod:** 3
**Effort:** 2d

**Deliverables:**
- Remove admin-only flag from aiAnswerer.js + answer-form-question EF
- Tier gate as sole access control (same as F3)
- Answer review mode: for Score-Gated/Manual modes, show AI-generated answer BEFORE submitting (edit/accept/regenerate)
- Answer quality feedback: thumbs up/down post-submission

**PostHog events:** `ai_answer_generated`, `ai_answer_feedback`
**Tests:** answers show in review panel for score-gated mode, auto-filled for autopilot modes, credit deduction (0.5/answer), cached answers free
**Entry gate:** AIS-F3-S1 ✅

---

### AIS-F4-S2: Answer History Table + Personal Context
**Feature:** #4 AI Application Q&A Answers
**Pod:** 2
**Effort:** 1d

**Deliverables:**
- Create `answers` table: user_id, job_id, field_label, generated_answer, user_edited_answer, feedback, created_at
- Persist generated answers (currently lost after session)
- Wire LinkedIn profile + resume text into answer prompt for personalized responses
- RLS on answers table

**Tests:** answers persisted to DB, personalization uses profile data when available, RLS blocks cross-user access
**Entry gate:** AIS-F4-S1 ✅

---

### AIS-F2-S1: LinkedIn Import — EF + Storage
**Feature:** #2 LinkedIn Profile Import
**Pod:** 2
**Effort:** 3d

**Deliverables:**
- `parse-linkedin-pdf` Edge Function: extract name, headline, location, experience (dates/titles/companies), skills array, education, connection count via Claude Haiku
- `linkedin_profiles` table: user_id, display_name, headline, location, experience_json, skills_array, education_json, li_connections, pdf_hash, raw_pdf_url, parsed_at
- `linkedin-profiles` Storage bucket: private, RLS-protected, 10MB max per file
- Fraud signals: PDF hash dedup (same file = block), connection count <50 = flag, parse failure = reject with clear error, zero-date experience entries = flag
- RLS on linkedin_profiles table

**Tests:** parse succeeds on real LinkedIn PDF, dedup blocks duplicate upload, fraud signals fire correctly, storage bucket enforces 10MB limit
**Entry gate:** none (standalone)

---

### AIS-F2-S2: LinkedIn Import — Upload UI + Profile Auto-Population
**Feature:** #2 LinkedIn Profile Import
**Pod:** 3
**Effort:** 3d

**Deliverables:**
- Drag-and-drop or file picker upload UI on Setup page
- Parsed profile preview: user confirms before saving (shows name, headline, top 5 skills, job count)
- Clear error messaging for non-LinkedIn PDFs or parse failures
- Profile auto-population: pre-fill user profile fields from parsed data
- Filter keyword suggestions: extracted skills → recommended search filters
- Seniority inference from experience history

**PostHog events:** `linkedin_pdf_uploaded`
**Tests:** upload flow end-to-end, preview renders correctly, profile fields populate, error states handled gracefully
**Entry gate:** AIS-F2-S1 ✅

---

## Phase B — Intelligence Engine (Weeks 3–4)
*Build the AI backend that powers the full suite.*

### AIS-F8-S1: Cover Letter Generator — UI + Table
**Feature:** #8 AI Cover Letter Generator
**Pod:** 2 + 3
**Effort:** Pod 2: 2d, Pod 3: 2d

**Deliverables:**
- `cover_letters` table: user_id, job_id, resume_id, tone, content, version, ai_score, credits_charged, created_at
- Consumer gate removal on `generate-cover-letter` EF
- Slide-out panel on Applications page for cover letter generation per job
- Tone selector: Professional, Conversational, Enthusiastic, Executive
- Context inputs: resume text + JD + ats_companies enrichment data + LinkedIn profile (if available)
- Version history: each regeneration = new version; user can compare and select
- DOCX export

**PostHog events:** `cover_letter_generated`
**Tests:** generates meaningfully different content per tone, version history saves correctly, DOCX exports cleanly, 2-credit deduction on generation
**Entry gate:** AIS-F2-S1 ✅ (for LinkedIn context)

---

### AIS-F8-S2: Cover Letter Auto-Attach in Apply Flow
**Feature:** #8 AI Cover Letter Generator
**Pod:** 2
**Effort:** 1d

**Deliverables:**
- Auto-attach existing cover letter when auto-apply or bulk apply runs for that job
- Detect cover letter fields in ATS forms, paste content
- Auto-generation at apply time when user has enabled 'Auto-generate cover letters' in Application Mode settings (2 credits/application)
- Caching: same company reuses generated letter, not regenerated

**Tests:** letter attaches correctly in Greenhouse, Lever, Ashby, LinkedIn Easy Apply, auto-generation fires when setting enabled, cache prevents duplicate generation for same company
**Entry gate:** AIS-F8-S1 ✅

---

### AIS-F1-S1: Resume Tailoring — rewrite-resume EF (Agents 1–2)
**Feature:** #1 One-Click Resume Tailoring
**Pod:** 2
**Effort:** 3d

**Deliverables:**
- Gap Analyzer agent (Claude Haiku): compares resume vs JD, outputs structured gap list
- Question Generator agent (Claude Haiku): produces 1–5 targeted questions based on actual gaps (not generic prompts)
- `resume_rewrites` table: user_id, resume_id, job_id, original_text, rewritten_text, diff_json, original_score, new_score, credits_charged, status (pending/processing/complete/failed), created_at
- RLS on resume_rewrites table
- Each agent = separate EF invocation (stay within 150s Supabase limit)

**Tests:** gap analysis correctly identifies JD skills not in resume, question generation produces role-specific questions (not generic), status transitions correctly (pending → processing)
**Entry gate:** none (new EF)

---

### AIS-F1-S2: Resume Tailoring — rewrite-resume EF (Agents 3–4)
**Feature:** #1 One-Click Resume Tailoring
**Pod:** 2
**Effort:** 3d

**Deliverables:**
- Resume Rewriter agent (Claude Sonnet): produces rewritten resume text using Q&A answers + gap analysis
- Quality Checker agent (Claude Sonnet): validates no fabricated claims (>95% truthfulness gate — if fails, reject and surface error)
- diff_json output: structured diff per section (original vs rewritten)
- Status tracking through to complete/failed
- On success: 3 credits deducted. On failure: 0 credits deducted.

**Tests:** rewrite improves score by ≥15 points average, quality checker catches fabricated claims, credit deduction only on success, total wall-clock time (excl. Q&A) < 20s
**Entry gate:** AIS-F1-S1 ✅

---

### AIS-F1-S3: Resume Tailoring — Q&A Panel + Diff Preview UI
**Feature:** #1 One-Click Resume Tailoring
**Pod:** 3
**Effort:** 3d

**Deliverables:**
- Client-side Q&A panel: replaces AI analysis area when active, progress indicator (stage 1/4 through 4/4), one question at a time, skip/back buttons, conversational career-coach tone
- Side-by-side diff preview: green (added), amber (restructured), red strikethrough (removed)
- Accept all / cherry-pick per section / reject with feedback actions
- DOCX download of tailored resume

**PostHog events:** `resume_rewrite_started`, `resume_rewrite_qa_skipped`
**Tests:** Q&A flow renders correctly, diff preview shows all change types, DOCX downloads correctly, cherry-pick works per section
**Entry gate:** AIS-F1-S2 ✅

---

### AIS-F1-S4: Resume Tailoring — CTA Triggers + Credit System
**Feature:** #1 One-Click Resume Tailoring
**Pod:** 2 + 3
**Effort:** Pod 2: 2d, Pod 3: 2d

**Deliverables:**
- Credit balance infrastructure: balance check before operation, deduction on success, top-up flow (link to billing)
- CTA trigger points:
  - Jobs Feed: Match % column — 'Boost Match' CTA when below 85%
  - Resume Readiness grade card — CTA when below A
  - Job Detail slide-out — 'Tailor Resume' button
  - Pipeline Saved stage — 'Boost Before Applying' prompt
- Insufficient credits state: block action, show credits needed, link to top-up

**PostHog events:** `resume_rewrite_completed`
**Tests:** CTA appears at correct threshold points, credit check blocks when insufficient, deduction fires only on success, top-up link routes correctly
**Entry gate:** AIS-F1-S3 ✅

---

## Phase C — Application Modes (Weeks 5–6)
*The consumer-facing experience that ties intelligence to action.*

### AIS-F5-S1: App Modes — Extension Popup + chrome.storage Sync
**Feature:** #5 Application Mode UI (6 Modes)
**Pod:** 3
**Effort:** 2d

**Deliverables:**
- Radio card mode selector in extension popup (6 modes: Manual, Score-Gated, Auto Apply, Auto+Score Gate, Auto Rewrite, Full Autopilot)
- Mode persists in `chrome.storage.sync` for cross-device roaming
- Admin/consumer toggle: admins see both consumer view and legacy admin view (contacts, scanner, export). Non-admins see consumer view only.
- Tier gate: Manual = Free. All other modes = Pro. Show upgrade prompt for Free users.

**PostHog events:** `application_mode_changed`
**Tests:** mode selection persists across browser restarts, chrome.storage.sync syncs across devices, admin toggle shows/hides correct views, free user sees upgrade prompt for pro modes
**Entry gate:** AIS-F3-S1 ✅, AIS-F1-S4 ✅

---

### AIS-F5-S2: App Modes — Content Script + Apply Button Interception
**Feature:** #5 Application Mode UI (6 Modes)
**Pod:** 3
**Effort:** 3d

**Deliverables:**
- `job-site-overlay.ts` content script
- 'Save to BJ Pipeline' button injection on job listing pages using per-site DOM selectors
- `job-sites.json` config: CSS selectors per ATS platform (Greenhouse, Lever, Ashby, Workable, LinkedIn, Indeed, Workday, iCIMS, Taleo, SmartRecruiters)
- Apply button interception: detect native apply button clicks, route through mode logic before allowing submission
- Manifest v3 update: content_scripts entry for job-site-overlay.js, web_accessible_resources

**Tests:** Save button injects correctly on all 10 ATS platforms, apply interception fires before native handler, mode routing correct (manual passes through, others intercept)
**Entry gate:** AIS-F5-S1 ✅

---

### AIS-F5-S3: App Modes — Shadow DOM Score Gate Popup
**Feature:** #5 Application Mode UI (6 Modes)
**Pod:** 3
**Effort:** 3d

**Deliverables:**
- Shadow DOM overlay on apply click (Score-Gated mode): renders match score, JD gap analysis summary, rewrite CTA, Apply Anyway / Cancel
- Must not conflict with host page CSS (Shadow DOM isolation)
- Wire score-resume EF call: fetch score on popup open, display within 3s
- Loading state while score fetches
- Error state if score fetch fails (allow user to proceed anyway)

**PostHog events:** `score_gate_shown`
**Tests:** Shadow DOM correctly isolated from LinkedIn/Indeed/Greenhouse CSS, score fetches and displays within 3s, rewrite CTA launches tailoring flow, Apply Anyway bypasses gate
**Entry gate:** AIS-F5-S2 ✅

---

### AIS-F5-S4: App Modes — Dashboard Sync + Rate Limiting
**Feature:** #5 Application Mode UI (6 Modes)
**Pod:** 2 + 3
**Effort:** Pod 2: 1d, Pod 3: 2d

**Deliverables:**
- Mode visible and changeable from Applications page Settings sub-tab (dashboard ↔ extension stay in sync via Supabase)
- Anti-detection enforcement active on all consumer apply paths:
  - Randomized delay 45–90s between applications
  - Session limits: max 25 applications per session
  - Failure circuit breaker: 3 consecutive failures on one platform → pause + user alert
  - Cool-down period: 30 min after hitting session limit

**Tests:** mode change in dashboard reflects in extension popup within 5s, rate limiting fires correctly, circuit breaker pauses and alerts after 3 failures
**Entry gate:** AIS-F5-S3 ✅

---

### AIS-F6-S1: Review Before Submit — Interception Panel
**Feature:** #6 Review Before Submit
**Pod:** 3
**Effort:** 3d

**Deliverables:**
- Pre-submit review panel (Score-Gated and Auto+Score Gate modes): job title, company, match score, resume version (with 'tailored' badge if applicable), AI-generated answers (editable inline), cover letter (if exists)
- Edit-in-place: modify AI answers, swap resume version, regenerate cover letter — without leaving the page
- Three actions: Submit (fires auto-fill), Cancel (aborts), Save for Later (parks to Review Queue)

**PostHog events:** `review_panel_shown`
**Tests:** panel renders with all correct data, edit-in-place saves changes before submit, Save for Later parks correctly, Submit passes edited data to auto-fill handler
**Entry gate:** AIS-F5-S4 ✅, AIS-F8-S1 ✅

---

### AIS-F6-S2: Review Queue on Dashboard
**Feature:** #6 Review Before Submit
**Pod:** 3
**Effort:** 1d

**Deliverables:**
- 'Review Queue' section on Applications page (Board sub-tab or separate indicator)
- Shows jobs parked via Save for Later with job title, company, score, parked date
- Per-job actions: Open Review Panel, Remove from Queue
- Badge count on Applications nav item when queue is non-empty

**Tests:** parked jobs appear in queue, badge count correct, Open Review Panel opens with correct job data, Remove clears from queue
**Entry gate:** AIS-F6-S1 ✅

---

## Phase D — Scale + New (Weeks 7–11)
*Higher-complexity features that build on the complete foundation.*

### AIS-F9-S1: Bulk Apply — Multi-Select UI + Bulk Action Bar
**Feature:** #9 Mass/Bulk Auto-Apply
**Pod:** 3
**Effort:** 2d

**Deliverables:**
- Checkbox column on Jobs Feed job cards (appears on hover or via toggle)
- 'Select All Matching' button selects all jobs matching current filter view
- Selection count badge in toolbar
- Bulk action bar (appears when ≥ 1 job selected): 'Apply to Selected' (primary), 'Save Selected to Pipeline', 'Generate Cover Letters for Selected'
- Estimated credit cost display before confirming bulk apply
- 10-second 'Cancel All Remaining' undo window after bulk apply starts

**Tests:** multi-select works with keyboard (shift+click range), Select All Matching respects active filters, estimated credit cost calculates correctly, undo window cancels remaining jobs
**Entry gate:** AIS-F3-S1 ✅, AIS-F5-S4 ✅

---

### AIS-F9-S2: Bulk Apply — Queue Table + EF
**Feature:** #9 Mass/Bulk Auto-Apply
**Pod:** 2
**Effort:** 3d

**Deliverables:**
- `bulk_apply_jobs` table: user_id, job_id, resume_id, cover_letter_id (optional), status (queued/scoring/rewriting/filling/submitted/failed), error_message, queued_at, started_at, completed_at
- `bulk-apply-queue` Edge Function: sequential processing, 45–90s randomized delay, max 25/session, retry logic (max 2 retries per job), platform spacing (min 60s between same ATS platform)
- Score gate integration: score each job first if Application Mode requires it. Jobs below threshold → flagged for review, not auto-submitted.
- Duplicate detection: skip jobs where user has already applied (check pending_applications)
- 30-minute cool-down enforcement after session limit hit
- Daily limit enforcement: Pro=50/day, Starter=10/day
- RLS on bulk_apply_jobs table

**Tests:** queue processes sequentially with correct delays, duplicate detection fires, daily limits block when exceeded, score gate integration flags below-threshold jobs, retry logic fires on failure (max 2)
**Entry gate:** AIS-F9-S1 ✅

---

### AIS-F9-S3: Bulk Apply — Progress Dashboard + Safety Controls
**Feature:** #9 Mass/Bulk Auto-Apply
**Pod:** 3
**Effort:** 3d

**Deliverables:**
- Real-time progress bar on Applications page (polling or realtime subscription to bulk_apply_jobs)
- Per-job status indicators: queued (gray), in progress (blue pulse), submitted (green check), failed (red x with error message)
- Clickable job rows to view error details and retry/skip options
- Score-flagged jobs panel: jobs held for review, with approve/skip/rewrite per job

**PostHog events:** `bulk_apply_started`, `bulk_apply_completed`
**Tests:** progress updates in real-time, failed jobs show actionable error messages, flagged jobs require explicit approval before submission, completed event fires with correct stats
**Entry gate:** AIS-F9-S2 ✅

---

### AIS-F10-S1: LinkedIn Auto-Apply Hardening
**Feature:** #10 LinkedIn Auto-Apply
**Pod:** 2
**Effort:** 3d

**Deliverables:**
- Randomized interaction delays: not just typing — scroll pauses (500–1500ms), field focus delays (200–800ms), tab switches
- Viewport-aware interactions: never click elements outside visible viewport
- Session cookie management: preserve and rotate session state
- Max 15 Easy Apply applications per day per account enforcement
- CAPTCHA/verification detection: detect challenge trigger, pause queue, alert user to complete manually

**Tests:** interaction timing is randomized (not constant), viewport check blocks off-screen clicks, daily limit enforced across sessions, CAPTCHA detection pauses correctly
**Entry gate:** AIS-F3-S1 ✅

---

### AIS-F10-S2: LinkedIn Multi-Step + Profile Sync
**Feature:** #10 LinkedIn Auto-Apply
**Pod:** 2
**Effort:** 2d

**Deliverables:**
- Multi-step Easy Apply support (1–6 pages): page transition detection, fill each page, handle the 'Review' step before final submit
- LinkedIn-specific Q&A optimization: test and tune aiAnswerer.js for LinkedIn's common screening question patterns
- Profile data sync: if LinkedIn profile imported (Feature 2), use exact field values to pre-fill LinkedIn-specific fields (headline, current company, education)
- Connection awareness: before applying, check for connections at the company. If found, surface 'You know people here' prompt with reach-out option before applying.

**Tests:** multi-step form completes all pages correctly, profile sync uses exact LinkedIn field values, connection check surfaces prompt when connections exist
**Entry gate:** AIS-F10-S1 ✅, AIS-F2-S2 ✅

---

### AIS-F7-S1: Resume Builder — Input Wizard + Generation EF
**Feature:** #7 AI Resume Builder
**Pod:** 2
**Effort:** 4d

**Deliverables:**
- Input collection wizard: 4–6 screens collecting target role, industry, years of experience, key accomplishments (free-text), skills, education
- Pre-fill from LinkedIn profile if exists (Feature 2)
- Resume generation Edge Function (Claude Sonnet): takes collected inputs + optional LinkedIn data + target filter keywords → ATS-optimized resume text → structured sections (summary, experience, skills, education)
- Tier gate: Free = 1 generation (onboarding hook), Pro = unlimited, PAYL = unlimited

**Tests:** wizard pre-fills correctly from LinkedIn data, generation produces all 4 sections, tier gate blocks free users after 1 generation, EF stays within 150s limit
**Entry gate:** AIS-F2-S2 ✅ (for LinkedIn pre-fill)

---

### AIS-F7-S2: Resume Builder — Template Engine + Editor + Export
**Feature:** #7 AI Resume Builder
**Pod:** 3
**Effort:** 5d

**Deliverables:**
- 3–5 ATS-friendly templates: CSS-driven, no graphics, no columns, no headers/footers that ATS parsers choke on
- Live score preview during generation: projected match score against user's active filters. Below threshold → one-click optimization suggestions.
- Section editor: post-generation, edit individual sections. Each edit triggers re-score to show impact.
- DOCX export: downloadable. PDF export via headless rendering of web preview.
- 5 credits charged on generation

**PostHog events:** `resume_built_from_scratch`
**Tests:** all 3 templates render correctly and export valid DOCX, live score updates on section edit, PDF export matches web preview, 5-credit deduction fires correctly
**Entry gate:** AIS-F7-S1 ✅

---

### AIS-F11-S1: Interview Practice — EF + Session Table
**Feature:** #11 AI Interview Practice
**Pod:** 2
**Effort:** 4d

**Deliverables:**
- `interview-practice` Edge Function (Claude Sonnet): accepts session_type, job_id, resume_id. Generates 5–10 role-specific questions. For each user answer: generates follow-up question + per-answer feedback. Question generation weighted: JD analysis 50%, resume gap analysis 30%, industry patterns 20%.
- Three session types: (a) General behavioral (STAR coaching), (b) Role-specific technical (JD requirements), (c) Company-specific (ats_companies data)
- `interview_sessions` table: user_id, job_id, session_type, questions_json, answers_json, feedback_json, aggregate_score, duration_seconds, created_at
- Scoring dimensions: Relevance (25%), Specificity (25%), Structure (20%), JD Alignment (20%), Communication (10%)
- 3 credits per session. RLS on interview_sessions table.

**Tests:** question generation produces role-specific questions (not generic), feedback scores each dimension correctly, session table persists full Q&A + feedback, credit deduction fires on session start
**Entry gate:** none (standalone)

---

### AIS-F11-S2: Interview Practice — Chat UI + Feedback + History
**Feature:** #11 AI Interview Practice
**Pod:** 3
**Effort:** 4d

**Deliverables:**
- Chat-based UI: slide-out panel on Pipeline page, contextual per job. AI interviewer asks one question at a time. User types answer. AI responds with follow-up or moves to next question.
- Per-answer feedback display: strength assessment, gap assessment, suggested improvement (stronger answer rewrite), STAR structure check
- Aggregate score display at session end across all 5 dimensions
- Session history: review past sessions, track improvement over time, re-practice low-scoring questions
- Pipeline integration: when pipeline entry reaches 'Interview' stage, auto-prompt user to practice. 'Practice for this interview' CTA on Pipeline card.

**PostHog events:** `interview_practice_started`, `interview_practice_completed`
**Tests:** chat UI renders correctly and handles multi-turn conversation, per-answer feedback shows all 4 components, aggregate score calculates correctly, Pipeline CTA appears at correct stage
**Entry gate:** AIS-F11-S1 ✅

---

### AIS-F12-S1: Resume A/B Testing — Engine + Tables
**Feature:** #12 Resume A/B Testing
**Pod:** 2
**Effort:** 4d

**Deliverables:**
- `resume_ab_tests` table: user_id, test_name, filter_id, variant_a_resume_id, variant_b_resume_id, status (active/paused/completed), winner_id (null until declared), min_sample_size, created_at, completed_at
- `resume_ab_results` table: test_id, job_id, variant (a/b), resume_id, applied_at, response_received (boolean), response_at, outcome (no_response/rejected/interview/offer), days_to_response
- Alternating assignment logic: when auto-apply, bulk apply, or manual apply fires for a job matching the test's filter, system selects which variant is 'due' next (round-robin). Logs to resume_ab_results.
- Outcome tracking: pipeline stage changes (responded/interview/offer/rejected) → update resume_ab_results automatically
- Tier gate: Free = no A/B testing. Pro/PAYL = 1 active test at a time. Block creation of 2nd active test.
- RLS on both tables.

**PostHog events:** `resume_ab_test_created`, `resume_ab_variant_assigned`
**Tests:** round-robin assignment alternates correctly, outcome tracking fires on pipeline stage change, tier gate blocks second active test for pro user, RLS blocks cross-user access
**Entry gate:** AIS-F3-S1 ✅ (auto-apply) or AIS-F9-S2 ✅ (bulk apply)

---

### AIS-F12-S2: Resume A/B Testing — Results Dashboard + Auto-Winner
**Feature:** #12 Resume A/B Testing
**Pod:** 3
**Effort:** 4d

**Deliverables:**
- Test creation UI on Resumes page: select two resumes, assign to a filter, set test name + min sample size (default 20/variant)
- Results card per active test: per-variant metrics (applications sent, responses received, response rate %, avg days to response, interview rate), statistical significance indicator, visual bar chart comparing variants
- Statistical rigor: no comparison metrics shown until 10/variant. No significance testing until 20/variant. Response rate shown with confidence interval (not just point estimate). Warning when variants sent to very different job quality.
- 'Not enough data yet' state for early-stage tests
- Auto-winner declaration: when both variants reach min_sample_size AND one has significant advantage (p < 0.05): declare winner, notify user, offer to set winner as default resume for that filter
- Manual override: pause, end, or swap variants at any time. Early end = flagged as inconclusive.

**PostHog events:** `resume_ab_winner_declared`
**Tests:** results card shows correct metrics, significance indicator only appears at correct sample size, auto-winner fires at correct threshold, manual pause/end works correctly
**Entry gate:** AIS-F12-S1 ✅

---

## Summary

| Session | Feature | Pod | Effort | Phase |
|---------|---------|-----|--------|-------|
| AIS-F3-S1 | Auto-Apply Gate Removal | 3 | 2d | A |
| AIS-F4-S1 | AI Q&A Gate Removal + Review | 3 | 2d | A |
| AIS-F4-S2 | Answer History + Context | 2 | 1d | A |
| AIS-F2-S1 | LinkedIn Import EF + Storage | 2 | 3d | A |
| AIS-F2-S2 | LinkedIn Import UI | 3 | 3d | A |
| AIS-F8-S1 | Cover Letter UI + Table | 2+3 | 4d | B |
| AIS-F8-S2 | Cover Letter Auto-Attach | 2 | 1d | B |
| AIS-F1-S1 | Resume Tailoring EF Agents 1–2 | 2 | 3d | B |
| AIS-F1-S2 | Resume Tailoring EF Agents 3–4 | 2 | 3d | B |
| AIS-F1-S3 | Resume Tailoring Q&A Panel + Diff UI | 3 | 3d | B |
| AIS-F1-S4 | Resume Tailoring CTAs + Credit System | 2+3 | 4d | B |
| AIS-F5-S1 | App Modes Popup + Storage Sync | 3 | 2d | C |
| AIS-F5-S2 | App Modes Content Script + Interception | 3 | 3d | C |
| AIS-F5-S3 | App Modes Shadow DOM Score Gate | 3 | 3d | C |
| AIS-F5-S4 | App Modes Dashboard Sync + Rate Limiting | 2+3 | 3d | C |
| AIS-F6-S1 | Review Before Submit Panel | 3 | 3d | C |
| AIS-F6-S2 | Review Queue on Dashboard | 3 | 1d | C |
| AIS-F9-S1 | Bulk Apply Multi-Select UI | 3 | 2d | D |
| AIS-F9-S2 | Bulk Apply Queue Table + EF | 2 | 3d | D |
| AIS-F9-S3 | Bulk Apply Progress Dashboard | 3 | 3d | D |
| AIS-F10-S1 | LinkedIn Apply Hardening | 2 | 3d | D |
| AIS-F10-S2 | LinkedIn Multi-Step + Profile Sync | 2 | 2d | D |
| AIS-F7-S1 | Resume Builder Wizard + EF | 2 | 4d | D |
| AIS-F7-S2 | Resume Builder Templates + Editor + Export | 3 | 5d | D |
| AIS-F11-S1 | Interview Practice EF + Table | 2 | 4d | D |
| AIS-F11-S2 | Interview Practice Chat UI + History | 3 | 4d | D |
| AIS-F12-S1 | A/B Testing Engine + Tables | 2 | 4d | D |
| AIS-F12-S2 | A/B Testing Results Dashboard + Auto-Winner | 3 | 4d | D |

**Total: 28 sessions | ~11 weeks | 101 engineering days**

---

*Session plan prepared March 15, 2026. Reference: SPEC_AIS_001_ApplicationIntelligenceSuite.md*
