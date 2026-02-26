# Apply Workflow — Feature Specification

**Version:** 1.0  
**Date:** February 25, 2026  
**Author:** Pod 1 (Growth)  
**Status:** Spec complete — UI build ready, endpoints deferred

---

## Executive Summary

The Apply Workflow is the revenue-critical path from "I found a job" to "my resume is submitted." It covers six distinct user modes ranging from fully manual to fully autonomous, with a scoring and rewriting intelligence layer in between. The workflow is designed so the UI and state machine can be built now, with ATS submission endpoints plugged in later.

---

## The Six Apply Modes

| Mode | Name | Description | Score Required | Rewrite | Approval |
|------|------|-------------|---------------|---------|----------|
| 1 | **Manual Apply** | User clicks Apply → redirected to company ATS page | No | No | No |
| 2 | **Score-Gated Manual** | User clicks Apply → if score low/unscored, prompt to score first → option to rewrite → then apply | Prompted | Optional | No |
| 3 | **Auto-Apply** | System submits resume automatically for all Pipeline jobs | No | No | Optional |
| 4 | **Score-Gated Auto** | Auto-apply only fires if JD-Resume match ≥ user threshold | Yes (≥ threshold) | No | Optional |
| 5 | **Auto-Apply + Auto-Rewrite** | System scores, rewrites if below threshold, then submits | Yes | Auto | Optional |
| 6 | **Full Autopilot** | Score → rewrite if needed → submit → no approval needed | Yes | Auto | No |

---

## Mode 1: Manual Apply (Current)

**Trigger:** User clicks "Apply →" button on job row or job modal.

**Flow:**
```
User clicks Apply →
  → Open company ATS page in new tab (job.url)
  → Move job to Pipeline stage "applied"
  → Record applied_at timestamp
  → Done
```

**No changes needed** — this is the current behavior. The "Apply →" button already exists on every job row.

---

## Mode 2: Score-Gated Manual Apply

**Trigger:** User clicks "Apply →" but their resume is unscored or low-scoring for this JD.

**Flow:**
```
User clicks Apply →
  → Check: does this job have a JD-Resume match score?
    → YES and score ≥ threshold → proceed to ATS (Mode 1)
    → YES and score < threshold → show Score Gate Modal
    → NO (unscored) → show Score Gate Modal

Score Gate Modal:
  ┌─────────────────────────────────────────────────┐
  │  Your resume scores [X] against this job.       │
  │  [or: This job hasn't been scored yet.]         │
  │                                                 │
  │  ┌──────────────────────────────────────┐       │
  │  │  Score breakdown:                    │       │
  │  │  Skills match: 65%                   │       │
  │  │  Experience: 80%                     │       │
  │  │  Missing: Python, SQL, Tableau       │       │
  │  └──────────────────────────────────────┘       │
  │                                                 │
  │  [Apply Anyway]  [Rewrite Resume]  [Cancel]     │
  └─────────────────────────────────────────────────┘

  → Apply Anyway → open ATS page, mark applied
  → Rewrite Resume → trigger AI rewrite flow (see Rewrite Flow below)
  → Cancel → close modal, no action
```

**Score Gate Threshold:** User-configurable in Settings, default 70. Below this score, the modal appears. Above it, apply proceeds directly.

---

## Mode 3: Auto-Apply (No Score Gate)

**Trigger:** User enables auto-apply for a saved filter. System applies to all matching jobs in Pipeline automatically.

**Settings (per filter):**
- `auto_apply_enabled`: boolean
- `auto_apply_resume_id`: which resume to use (defaults to filter-assigned resume)
- `approval_required`: boolean — if true, queue for approval instead of submitting immediately

**Flow:**
```
New job enters Pipeline (via save or auto-save) →
  → Is auto-apply enabled for this filter? No → stop
  → Is there an assigned resume? No → skip, flag "no resume assigned"
  → Is approval required?
    → YES → create pending_application record → notify user
    → NO → submit immediately → mark applied → notify user of submission
```

---

## Mode 4: Score-Gated Auto-Apply

**Trigger:** Same as Mode 3, but only fires if the JD-Resume match score meets the user's threshold.

**Additional settings (per filter):**
- `score_threshold`: integer 0-100 (default 70)
- `score_unscored_behavior`: 'skip' | 'score_first' | 'apply_anyway'

**Flow:**
```
New job enters Pipeline →
  → Is auto-apply enabled? No → stop
  → Does this job have a score?
    → NO → check score_unscored_behavior:
      → 'skip' → mark as "skipped: unscored"
      → 'score_first' → trigger scoring → re-enter this flow with score
      → 'apply_anyway' → proceed to submit
    → YES → is score ≥ threshold?
      → YES → submit (or queue for approval)
      → NO → mark as "skipped: below threshold [X]"
      → Notify user: "Skipped [Job] — resume scored [X], threshold is [Y]"
```

---

## Mode 5: Auto-Apply + Auto-Rewrite

**Trigger:** Same as Mode 4, but when score is below threshold, system rewrites the resume before submitting.

**Additional settings (per filter):**
- `auto_rewrite_enabled`: boolean
- `rewrite_approval`: 'none' | 'notify_after' | 'approve_before'
  - `none`: rewrite and submit silently
  - `notify_after`: rewrite, submit, then notify user what was changed
  - `approve_before`: rewrite, hold for user review, submit only after approval

**Flow:**
```
Score check: score < threshold →
  → Is auto_rewrite enabled? No → skip (Mode 4 behavior)
  → YES → trigger AI rewrite
    → Rewrite complete
    → Re-score rewritten resume against JD
    → Is rewrite_approval 'approve_before'?
      → YES → create pending_application with rewritten resume attached
             → notify user: "Rewrote your resume for [Job]. Score improved [X→Y]. Review?"
             → User approves → submit
             → User rejects → discard rewrite, mark skipped
      → NO → submit rewritten resume
            → Is rewrite_approval 'notify_after'?
              → YES → notify: "Applied to [Job] with rewritten resume. Score: [X→Y]. Changes: [summary]"
              → NO → silent submit
```

---

## Mode 6: Full Autopilot

Same as Mode 5 with `rewrite_approval: 'none'` and `approval_required: false`. No human in the loop. System scores, rewrites if needed, submits, and logs everything. User reviews results in their Pipeline.

---

## The Rewrite Flow (Shared)

Used by Modes 2, 5, and 6. The rewrite takes the current resume + JD and produces an optimized version.

```
Input: resume_text + jd_text + score_result
  → AI Rewrite (Claude API via score-resume Edge Function extension)
    → Output: rewritten_resume_text + change_summary + new_score
  → Store as resume version (resume_versions table)
  → Return to calling flow
```

**Rewrite output includes:**
- `rewritten_text`: the full optimized resume
- `change_summary`: human-readable list of what changed ("Added Python to skills", "Reworded experience bullet #3")
- `before_score`: original match score
- `after_score`: new match score after rewrite
- `confidence`: how confident the AI is in the improvement

---

## Notification Matrix

When an apply action happens (or is blocked), the user may need to be notified. This ties into the existing notification system.

| Event | In-App | Email | SMS (Pro) |
|-------|--------|-------|-----------|
| Manual apply completed | Toast | — | — |
| Score gate triggered | Modal | — | — |
| Auto-apply submitted | Bell + Pipeline card | ✓ | ✓ |
| Auto-apply skipped (low score) | Bell + Pipeline card | ✓ | — |
| Rewrite completed, awaiting approval | Bell + Modal on next visit | ✓ | ✓ |
| Rewrite completed, auto-submitted | Bell + Pipeline card | ✓ | — |
| Auto-apply failed (no resume) | Bell + warning banner | ✓ | — |
| Bulk apply completed | Toast + summary card | ✓ | ✓ |

**Notification channels by tier:**
- **Free:** In-app only (toast + bell + banners)
- **Starter:** In-app + email
- **Pro:** In-app + email + SMS

**SMS approval flow:**
```
SMS: "BJ: Resume rewrote for [Role] at [Company]. Score: 58→82. Reply Y to submit, N to skip, R to review online."
  → Y → submit
  → N → skip, mark passed
  → R → send link to review page
  → No reply in 4h → escalation or auto-action based on user preference
```

---

## Pending Applications Queue

A central queue for all applications awaiting action. Visible on the Pipeline page.

### pending_applications table

```sql
CREATE TABLE pending_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  job_id TEXT NOT NULL,  -- greenhouse_id
  filter_id INTEGER,     -- which saved filter matched
  resume_id UUID,        -- resume used
  rewritten_resume_id UUID,  -- if rewrite happened
  
  -- Scoring
  original_score INTEGER,
  rewritten_score INTEGER,
  score_result JSONB,     -- full scoring output
  
  -- Rewrite
  rewrite_summary TEXT,
  rewrite_confidence NUMERIC(3,2),
  
  -- State machine
  status TEXT NOT NULL DEFAULT 'pending',
    -- pending: awaiting user action
    -- approved: user approved, ready to submit
    -- submitted: resume sent to ATS
    -- skipped: user declined
    -- expired: no action within timeout
    -- failed: submission error
  
  -- Approval
  approval_mode TEXT NOT NULL,
    -- 'manual': user must click Apply
    -- 'auto_no_approval': submit immediately
    -- 'auto_with_approval': queue for approval
    -- 'rewrite_review': rewrite done, needs review
  
  -- Notification
  notified_via TEXT[],    -- ['in_app', 'email', 'sms']
  notified_at TIMESTAMPTZ,
  escalated_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,  -- auto-expire pending items
  
  -- Metadata
  job_title TEXT,
  company_name TEXT,
  job_url TEXT
);

CREATE INDEX idx_pending_user_status ON pending_applications(user_id, status);
CREATE INDEX idx_pending_expires ON pending_applications(expires_at) WHERE status = 'pending';
```

---

## Apply Settings (per user, per filter)

Extends the existing saved filter schema.

```javascript
// Added to each saved filter object
{
  apply_mode: 'manual',  // 'manual' | 'score_gated' | 'auto' | 'score_gated_auto' | 'auto_rewrite' | 'autopilot'
  score_threshold: 70,
  auto_rewrite_enabled: false,
  rewrite_approval: 'approve_before',  // 'none' | 'notify_after' | 'approve_before'
  approval_required: true,
  unscored_behavior: 'score_first',  // 'skip' | 'score_first' | 'apply_anyway'
  notification_channels: ['in_app', 'email'],  // per-filter override
}
```

Global defaults stored in `user_apply_settings` (new localStorage key, synced to Supabase):

```javascript
{
  default_apply_mode: 'manual',
  default_score_threshold: 70,
  default_approval_required: true,
  default_notification_channels: ['in_app', 'email'],
  sms_enabled: false,  // requires phone verification
  quiet_hours_start: '22:00',
  quiet_hours_end: '07:00',
  auto_expire_hours: 48,  // pending items expire after this
}
```

---

## UI Components

### 1. Apply Button Enhancement (Job Feed)

Current: `[Pipeline] [Apply →]`

New behavior based on mode:
- **Manual/Score-gated:** Same buttons. Apply opens ATS or shows score gate.
- **Auto modes:** Pipeline button changes to reflect auto-apply status:
  - `[Pipeline ✓ Auto]` — auto-apply will handle this
  - `[Pipeline ⏸ Pending]` — queued for approval
  - `[Pipeline ✕ Skipped]` — score too low

### 2. Filter Apply Settings Panel

New section in each saved filter's settings:

```
┌─ Apply Settings for "SEO Director NYC" ──────────────┐
│                                                       │
│  Apply Mode:  ○ Manual  ○ Score-Gated  ● Auto        │
│                                                       │
│  Score Threshold: [====70====] 70                     │
│                                                       │
│  When unscored:  ○ Skip  ● Score first  ○ Apply anyway│
│                                                       │
│  Auto-rewrite below threshold:  [ON]                  │
│  Rewrite approval:  ○ None  ○ Notify after  ● Review  │
│                                                       │
│  Require my approval before submit:  [ON]             │
│                                                       │
│  Notify me via:  ☑ In-app  ☑ Email  ☐ SMS            │
└───────────────────────────────────────────────────────┘
```

### 3. Pending Applications Panel (Pipeline page)

New collapsible section at top of Pipeline:

```
┌─ Pending Applications (3) ───────────────────────────┐
│                                                       │
│  ● SEO Manager at iPullRank          Score: 72       │
│    Resume: Marston_SEO_2025.pdf      ✓ Above threshold│
│    [Approve & Submit]  [Skip]  [View JD]             │
│                                                       │
│  ⚠ VP Marketing at LendingTree      Score: 58 → 81  │
│    Resume: REWRITTEN                 Improved +23    │
│    [Review Rewrite]  [Submit Original]  [Skip]       │
│                                                       │
│  ○ Content Lead at ElevenLabs        Unscored        │
│    Resume: Marston_Content_2025.pdf                   │
│    [Score & Review]  [Apply Anyway]  [Skip]          │
│                                                       │
└───────────────────────────────────────────────────────┘
```

### 4. Score Gate Modal

Shown when Mode 2 is active and user clicks Apply on a low-scoring job:

```
┌─ Resume Match Check ─────────────────────────────────┐
│                                                       │
│  Your resume scores 58 against this job.              │
│  Threshold: 70                                        │
│                                                       │
│  ┌─────────────────────────────────────────┐         │
│  │  ✓ Experience alignment      80%        │         │
│  │  ✕ Skills match              45%        │         │
│  │  ~ Education fit             60%        │         │
│  │                                         │         │
│  │  Missing: Python, SQL, Tableau          │         │
│  │  Suggestion: Add data viz experience    │         │
│  └─────────────────────────────────────────┘         │
│                                                       │
│  [Apply Anyway]  [AI Rewrite ($1 credit)]  [Cancel]  │
│                                                       │
│  ☐ Don't show this for scores above [__70__]         │
└───────────────────────────────────────────────────────┘
```

### 5. Rewrite Review Modal

Shown when a rewrite is pending approval:

```
┌─ Resume Rewrite Review ──────────────────────────────┐
│                                                       │
│  Job: VP Marketing at LendingTree                     │
│  Score: 58 → 81 (+23)                                │
│                                                       │
│  Changes made:                                        │
│  • Added "marketing automation" to skills section     │
│  • Reworded bullet #3: "managed campaigns" →          │
│    "led $2M multi-channel acquisition campaigns"      │
│  • Added Python and SQL to technical skills           │
│  • Strengthened leadership language in summary        │
│                                                       │
│  [View Side-by-Side]                                  │
│                                                       │
│  [Submit Rewritten]  [Submit Original]  [Cancel]      │
└───────────────────────────────────────────────────────┘
```

---

## Credit Costs

| Action | Credits | Tier Availability |
|--------|---------|-------------------|
| Score a JD-Resume pair | 1 | Starter+ |
| AI Rewrite | 3 | Pro only |
| Auto-score (batch, per job) | 1 | Starter+ |
| Auto-rewrite (per job) | 3 | Pro only |
| ATS submission | 0 | All tiers |
| Manual apply (redirect) | 0 | All tiers |

---

## Build Order

### Phase 1: UI Shell (Pod 1 — no endpoints needed)
1. Score Gate Modal component
2. Pending Applications panel on Pipeline page
3. Filter Apply Settings panel
4. Apply button state enhancement
5. Rewrite Review Modal component
6. Apply Settings page section (global defaults)

### Phase 2: State Machine (Pod 2)
1. `pending_applications` table + RLS
2. Apply flow controller (client-side state machine)
3. Score check integration (calls existing `score-resume` EF)
4. Rewrite flow integration (extends `score-resume` EF)
5. Notification wiring (extends existing notification system)

### Phase 3: Auto-Apply Engine (Pod 2)
1. Auto-apply trigger on Pipeline save
2. Score-gated decision logic
3. Batch scoring for unscored jobs
4. Rewrite pipeline
5. Approval queue processing
6. Expiry cron for stale pending items

### Phase 4: ATS Submission (Pod 2 — deferred)
1. Greenhouse API submission
2. Lever API submission
3. Ashby API submission
4. Workable API submission
5. Recruitee API submission
6. USAJOBS submission
7. Fallback: open ATS page in browser

---

## Key Design Decisions

1. **Submission is decoupled from the workflow.** The entire score → rewrite → approve → submit pipeline works even if the final "submit" step is just "open ATS page." When real API submission is ready, it plugs into the last step.

2. **Every auto action is logged.** Users can always see what happened, when, and why. No black box.

3. **Rewrite never overwrites the original.** Rewrites are stored as versions. The original is always preserved and selectable.

4. **SMS approval is Pro-only.** Keeps the monetization incentive strong.

5. **Score Gate is opt-out, not opt-in.** Users see it by default, can disable per-filter or globally. This drives awareness of the scoring feature and creates natural upsell moments.

6. **Credits are consumed on AI actions, not on apply.** Clicking Apply is always free. Scoring and rewriting cost credits. This keeps the core experience free while monetizing intelligence.
