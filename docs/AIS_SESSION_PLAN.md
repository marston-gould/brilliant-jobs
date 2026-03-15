# Application Intelligence Suite — Session Plan

**Spec:** SPEC-AIS-001  
**Date:** 2026-03-15  
**Total Sessions:** 28  
**Total Effort:** 101 engineering days (45 Pod 2 + 56 Pod 3)  
**Phases:** A (Weeks 1–2), B (Weeks 3–4), C (Weeks 5–6), D (Weeks 7–11)

---

## Phase A — Foundation (Weeks 1–2)
*Unlock existing functionality for consumers. Highest ROI, lowest effort.*

| Session ID | Feature | Description | Dependencies | Effort |
|---|---|---|---|---|
| AIS-F3-S1 | Auto-Apply Gate Removal | Remove admin flag from auto-fill. Wire tierGate.js as sole access control (Free=0/day, Starter=5/day, Pro=unlimited). Application Mode integration: mode must be respected (Manual=no fill, Score-Gated=fill after score check, Auto=fill immediately). PostHog: `auto_apply_consumer_triggered`. Anti-detection: 45–90s randomized delay, max 25/session, circuit breaker on 3 consecutive failures. | None (built, needs gate removal) | Pod 3: 2d |
| AIS-F4-S1 | AI Q&A Gate Removal + Answer Review Mode | Remove admin flag from aiAnswerer.js + answer-form-question EF. Add pre-submit review panel for Score-Gated/Manual modes (show AI answer before submitting, editable, accept/regenerate). Answer quality feedback: thumbs up/down. PostHog: `ai_answer_generated`, `ai_answer_feedback`. | None (built, needs gate removal) | Pod 2: 1d, Pod 3: 3d |
| AIS-F4-S2 | Answer History Table + Personal Context | Create `answers` table (user_id, job_id, field_label, generated_answer, user_edited_answer, feedback, created_at). Persist all generated answers. Wire LinkedIn profile + resume text into answer-form-question prompt for personalized responses. Credit deduction: 0.5/answer, cached (same label+similar title) = free. | AIS-F4-S1 | Pod 2: 1d |
| AIS-F2-S1 | LinkedIn Import — EF + Storage | Build `parse-linkedin-pdf` Edge Function (accept PDF upload, extract structured fields via Claude Haiku: name, headline, location, experience, skills, education, connection count). Create `linkedin_profiles` table + `linkedin-profiles` Storage bucket (private, RLS, 10MB max). PDF hash dedup. Fraud signals (connections < 50, parse failure, blank sections). | None | Pod 2: 4d |
| AIS-F2-S2 | LinkedIn Import — Upload UI + Auto-Population | Drag-and-drop upload on Setup page. Parsed profile preview before save. Auto-fill user profile fields. Suggest filter keywords from extracted skills. Infer seniority from experience history. Clear error messaging for non-LinkedIn PDFs. PostHog: `linkedin_pdf_uploaded`. | AIS-F2-S1 | Pod 3: 3d |

---

## Phase B — Intelligence Engine (Weeks 3–4)
*Build the AI backend that powers everything else.*

| Session ID | Feature | Description | Dependencies | Effort |
|---|---|---|---|---|
| AIS-F8-S1 | Cover Letter Generator — UI + Table | Create `cover_letters` table (user_id, job_id, resume_id, tone, content, version, ai_score, credits_charged, created_at). Build slide-out panel on Applications page. Tone selector: Professional, Conversational, Enthusiastic, Executive. Version history (each regen = new version, compare + select). Wire existing `generate-cover-letter` EF for consumer access. DOCX export. PostHog: `cover_letter_generated`. Credit: 2/letter. | None (EF exists, admin-only) | Pod 2: 1d, Pod 3: 4d |
| AIS-F8-S2 | Cover Letter Auto-Attach in Apply Flow | When auto-apply or bulk apply fires and cover letter exists for job, attach it. Detect cover letter field in ATS forms, paste content. Cache: same company reuses letter. Auto-generate option in Application Mode settings (2 additional credits). | AIS-F8-S1, AIS-F3-S1 | Pod 2: 2d |
| AIS-F1-S1 | Resume Tailoring — EF Agents 1–2 (Gap + Questions) | Build Gap Analyzer agent (Claude Haiku, compare resume vs JD, output structured gap list) + Question Generator agent (Claude Haiku, generate 1–5 targeted questions from gaps — not generic). Separate invocations to stay under 150s Supabase limit. Create `resume_rewrites` table (user_id, resume_id, job_id, original_text, rewritten_text, diff_json, original_score, new_score, credits_charged, status, created_at). | score-resume EF (exists) | Pod 2: 3d |
| AIS-F1-S2 | Resume Tailoring — EF Agents 3–4 (Rewriter + Quality) | Resume Rewriter agent (Claude Sonnet, produces full rewritten resume text) + Quality Checker agent (fabrication detection: >95% truthfulness gate — rejects fabricated claims). Diff JSON output. Status progression: pending → processing → complete/failed. 0 credits charged on failure. | AIS-F1-S1 | Pod 2: 3d |
| AIS-F1-S3 | Resume Tailoring — Q&A Panel + Diff Preview UI | Client-side Q&A panel: replaces AI analysis area when active, progress indicator (stage 1/4–4/4), one question at a time, skip/back buttons, conversational tone (career coach feel). Side-by-side diff preview: green (added), amber (restructured), red strikethrough (removed). Accept all / cherry-pick per section / reject with feedback. DOCX download. | AIS-F1-S2 | Pod 3: 3d |
| AIS-F1-S4 | Resume Tailoring — Credit System + CTA Triggers | Credit balance infrastructure (check + deduct + top-up). 3 credits on success, 0 on failure. CTA trigger points: Feed Match% column (below 85%), Resume Readiness grade card (below A), Job Detail slide-out, Pipeline Saved stage. Wall-clock target: <20s excluding user Q&A. PostHog: `resume_rewrite_started`, `resume_rewrite_completed`, `resume_rewrite_qa_skipped`. | AIS-F1-S3 | Pod 2: 2d, Pod 3: 2d |

---

## Phase C — Application Modes (Weeks 5–6)
*The consumer-facing experience that ties intelligence to action.*

| Session ID | Feature | Description | Dependencies | Effort |
|---|---|---|---|---|
| AIS-F5-S1 | App Modes — Extension Popup + Storage Sync | Radio card mode selector in extension popup (6 modes: Manual/Score-Gated/Auto Apply/Auto+Score Gate/Auto Rewrite/Full Autopilot). Persist to `chrome.storage.sync` for cross-device roaming. Admin/consumer toggle: admins see both views, non-admins see consumer only. PostHog: `application_mode_changed`. | AIS-F3-S1 (gate removal) | Pod 3: 2d |
| AIS-F5-S2 | App Modes — Content Script + Button Injection | `job-site-overlay.ts` content script (or extend existing). 'Save to BJ Pipeline' button injection on job listing pages using per-site DOM selectors (job-sites.json config). Apply button interception: detect native apply click, route through mode logic before allowing submission. manifest.json update. | AIS-F5-S1 | Pod 3: 3d |
| AIS-F5-S3 | App Modes — Shadow DOM Score Gate Popup | Shadow DOM overlay rendered on apply click for Score-Gated modes: match score, JD gap summary, rewrite CTA, apply/cancel. Must not conflict with host page CSS. Wire score-resume EF call. <3s render target. PostHog: `score_gate_shown`. | AIS-F5-S2, score-resume EF | Pod 2: 2d, Pod 3: 2d |
| AIS-F5-S4 | App Modes — Dashboard Sync + Rate Limiting | Mode visible + changeable from Applications page Settings sub-tab. Mode changes sync bidirectionally (extension ↔ dashboard). Anti-detection enforcement: randomized delay (45–90s), session limit (max 25), failure circuit breaker (3 consecutive failures on one platform = pause + alert user). | AIS-F5-S3 | Pod 2: 1d, Pod 3: 1d |
| AIS-F6-S1 | Review Before Submit — Interception Panel | Pre-submit review panel (for Score-Gated + Auto+Score Gate modes): job title, company, match score, resume version (with tailored indicator), AI answers for custom questions (editable), cover letter preview (if exists). Edit-in-place: swap resume, edit answers, regenerate cover letter without leaving page. Submit / Cancel / Save for Later actions. PostHog: `review_panel_shown`. | AIS-F5-S3, AIS-F8-S1 | Pod 2: 1d, Pod 3: 3d |
| AIS-F6-S2 | Review Queue on Dashboard | 'Review Queue' section on Applications page. Jobs parked via Save for Later appear here. Per-job: title, company, score, resume assigned, answers, cover letter. Process from desktop. Status indicators. Integration with pipeline board. | AIS-F6-S1 | Pod 3: 1d |

---

## Phase D — Scale + New (Weeks 7–11)
*Higher-complexity features that build on the complete foundation.*

| Session ID | Feature | Description | Dependencies | Effort |
|---|---|---|---|---|
| AIS-F9-S1 | Bulk Apply — Multi-Select UI + Action Bar | Checkbox column on Jobs Feed. 'Select All Matching' button (selects all visible jobs). Selection count badge in toolbar. Bulk action bar appears when ≥1 selected: 'Apply to Selected' (primary), 'Save to Pipeline', 'Generate Cover Letters for Selected'. Shows selected count + estimated credit cost. | AIS-F3-S1 | Pod 3: 2d |
| AIS-F9-S2 | Bulk Apply — Queue Table + EF | `bulk_apply_jobs` table (user_id, job_id, resume_id, cover_letter_id, status: queued/scoring/rewriting/filling/submitted/failed, error_message, queued_at, started_at, completed_at). `bulk-apply-queue` Edge Function: sequential processing, 45–90s randomized delay, max 25/session, retry logic (max 2 per job). Score gate integration: jobs below threshold flagged for review vs auto-submitted. | AIS-F9-S1, AIS-F5-S3 | Pod 2: 5d |
| AIS-F9-S3 | Bulk Apply — Progress Dashboard + Safety Controls | Real-time progress bar on Applications page. Per-job status indicators: queued (gray), in progress (blue pulse), submitted (green check), failed (red x + error). Clickable for details. Safety: daily limit (Pro=50, Starter=10), 60s minimum between same-platform applications, duplicate detection (check pending_applications), 30-min cool-down after session, 10-second 'Cancel All Remaining' undo window. PostHog: `bulk_apply_started`, `bulk_apply_completed`. | AIS-F9-S2 | Pod 3: 4d |
| AIS-F10-S1 | LinkedIn Auto-Apply Hardening | Randomized interaction delays beyond typing: scroll pauses, field focus delays, tab switches. Viewport-aware interactions (no clicks outside visible viewport). Session cookie management. Max 15 Easy Apply/day enforcement. CAPTCHA detection: pause automation + alert user to complete manually. Failure circuit breaker. | AIS-F3-S1 | Pod 2: 3d |
| AIS-F10-S2 | LinkedIn Multi-Step + Profile Sync | Multi-step Easy Apply support (1–6 pages): page transition detection, per-page field filling, Review step handling before final submit. LinkedIn-specific Q&A optimization (authorization questions, years of experience patterns). Profile data sync: if LinkedIn import exists (Feature 2), use exact field matches to reduce detection risk. Connection awareness: check for company connections, surface 'You know people here' prompt before applying. PostHog: `linkedin_easy_apply_triggered`. | AIS-F10-S1, AIS-F2-S1 | Pod 2: 1d, Pod 3: 2d |
| AIS-F7-S1 | Resume Builder — Input Wizard + Generation EF | 4–6 screen input wizard: target role, industry, years of experience, key accomplishments (free-text), skills, education. Pre-fill all fields from LinkedIn profile if imported (Feature 2). Resume generation Edge Function (Claude Sonnet): takes collected inputs + optional LinkedIn data + target filter keywords, returns structured sections (summary, experience, skills, education). | None (standalone) | Pod 2: 4d |
| AIS-F7-S2 | Resume Builder — Templates + Editor + Export | 3–5 ATS-friendly templates (no graphics, no columns, no header/footer — CSS-driven for web preview). Live score preview during/after generation (wire score-resume EF). Section editor: per-section editing with re-score on change to show impact. DOCX + PDF export (PDF via headless rendering of web preview). Tier gate: Free=1 generation, Pro=unlimited. PostHog: `resume_built_from_scratch`. | AIS-F7-S1 | Pod 2: 2d, Pod 3: 8d |
| AIS-F11-S1 | Interview Practice — EF + Session Table | `interview-practice` Edge Function: accepts session_type (behavioral/role-specific/company-specific), job_id, resume_id. Generates 5–10 tailored questions (50% JD analysis, 30% resume gap, 20% industry patterns). Per-answer: follow-up questions + structured feedback (strength, gap, suggested improvement, STAR check). Claude Sonnet. `interview_sessions` table: user_id, job_id, session_type, questions_json, answers_json, feedback_json, aggregate_score, duration_seconds. Scoring: relevance 25%, specificity 25%, structure 20%, JD alignment 20%, communication 10%. | None (standalone) | Pod 2: 5d |
| AIS-F11-S2 | Interview Practice — Chat UI + Feedback + History | Chat-based UI on Pipeline page (contextual per job). Questions one at a time. Per-answer feedback display inline. Aggregate scorecard at session end. Session history tab: past sessions, per-dimension scores, improvement over time, re-practice low-score questions. Pipeline integration: 'Interview' stage auto-prompts 'Practice for this interview' CTA. Tier gate: Free=1 session, Pro=unlimited. PostHog: `interview_practice_started`, `interview_practice_completed`. | AIS-F11-S1 | Pod 3: 6d |
| AIS-F12-S1 | Resume A/B Testing — Engine + Tables | `resume_ab_tests` table (user_id, test_name, filter_id, variant_a_resume_id, variant_b_resume_id, status: active/paused/completed, winner_id, min_sample_size, created_at, completed_at). `resume_ab_results` table (test_id, job_id, variant a/b, resume_id, applied_at, response_received, response_at, outcome, days_to_response). Alternating assignment logic (round-robin) hooked into auto-apply + bulk apply flows. Outcome tracking: pipeline stage changes (responded/interview/offer/rejected) flow into resume_ab_results automatically. Tier gate: Free=none, Pro/PAYL=1 active test. | AIS-F3-S1 or AIS-F9-S1 | Pod 2: 4d |
| AIS-F12-S2 | Resume A/B Testing — Results Dashboard + Auto-Winner | Test creation UI on Resumes page (select 2 resumes + assign to filter). Results card: per-variant metrics (applications sent, responses, response rate %, avg days to response, interview rate). Response rate shown with confidence interval. Statistical significance via chi-squared / Fisher's exact (p<0.05). Minimum 10 applications/variant before showing metrics. Minimum 20/variant before significance testing activates. Auto-winner declaration: notify user + offer to set as default resume for filter. Manual override: pause/end/swap variants. PostHog: `resume_ab_test_created`, `resume_ab_variant_assigned`, `resume_ab_winner_declared`. | AIS-F12-S1 | Pod 3: 5d |

---

## Summary

| Phase | Sessions | Weeks | Features |
|---|---|---|---|
| A — Foundation | 5 | 1–2 | F2 (LinkedIn Import), F3 (Auto-Apply gate), F4 (AI Q&A gate) |
| B — Intelligence Engine | 6 | 3–4 | F1 (Resume Tailoring), F8 (Cover Letter) |
| C — Application Modes | 6 | 5–6 | F5 (App Modes), F6 (Review Before Submit) |
| D — Scale + New | 11 | 7–11 | F7 (Resume Builder), F9 (Bulk Apply), F10 (LinkedIn Apply), F11 (Interview Practice), F12 (A/B Testing) |
| **Total** | **28** | **11** | **12 features** |

## Dependency Chain (Critical Path)
```
F3 gate removal ──► F5 App Modes ──► F6 Review ──► F9 Bulk Apply ──► F12 A/B Testing
                        │
F1 rewrite EF ──────────┘
        │
F8 Cover Letter (EF exists)
        │
F2 LinkedIn Import (standalone)
        │
F7 Resume Builder (standalone)
        │
F11 Interview Practice (standalone)
```

## Version Sequence
Sessions run sequentially. Each session bumps `BJ_VERSION`. Expected range: v9.55 (AIS-F3-S1) through ~v9.82 (AIS-F12-S2).
