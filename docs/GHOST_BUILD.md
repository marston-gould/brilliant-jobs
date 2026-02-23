# Brilliant Jobs — Ghost Detection Build Spec

> **Status:** In Progress (Gmail OAuth + Pipeline Ghost Engine)
> **Owner:** Pod 2 (Architecture & Data)
> **Created:** February 23, 2026
> **Depends on:** Gmail OAuth integration, Pipeline system, Notification system

---

## 1. What Is Ghost Detection

Ghost detection identifies when a company has effectively "ghosted" a user — the user applied, time passed, and no response came. Brilliant Jobs detects this through two complementary signals:

1. **Time-based ghosting** — Applied X days ago with no pipeline stage advancement (already partially built in `job-intelligence` Edge Function).
2. **Email-based ghosting** — Gmail OAuth confirms no inbound email from the company domain, strengthening confidence that the user was truly ghosted (not just that they forgot to update their pipeline).

The combination of both signals creates a high-confidence ghost score that powers alerts, the Ghost Monitor dashboard page, and aggregate employer accountability data.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     USER'S GMAIL                            │
│  (read-only OAuth — gmail.readonly scope)                   │
└──────────────────────┬──────────────────────────────────────┘
                       │ OAuth 2.0 refresh token
                       ▼
┌──────────────────────────────────────┐
│  gmail-scan Edge Function            │
│  (pg_cron: every 6 hours)            │
│                                      │
│  1. List messages from:company.com   │
│  2. Match against pipeline companies │
│  3. Classify: response / interview / │
│     rejection / scheduling / silence │
│  4. Write to email_signals table     │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│  ghost-engine RPC                    │
│  (called by job-intelligence daily)  │
│                                      │
│  Inputs:                             │
│  • Pipeline entries (applied_at)     │
│  • Email signals (last_email_at)     │
│  • Company avg response time         │
│  • Listing status (still open?)      │
│                                      │
│  Output:                             │
│  • ghost_score (0–100)               │
│  • ghost_status enum                 │
│  • confidence_level                  │
│  • recommended_action                │
└──────────────┬───────────────────────┘
               │
        ┌──────┴──────┐
        ▼             ▼
  Notifications   Ghost Monitor
  (ghost_alert)   (dashboard page)
```

---

## 3. Gmail OAuth Integration

### 3.1 GCP Setup (Manual Steps)

The GCP project `brilliant-jobs` (ID: `27086315974`) already exists with the service account for GSC/BigQuery. Gmail OAuth requires a separate **OAuth 2.0 Client ID** (user-facing consent flow):

1. **Enable Gmail API** in GCP Console → APIs & Services → Library → Gmail API → Enable
2. **Configure OAuth Consent Screen** (if not already done for this project):
   - User type: External
   - App name: "Brilliant Jobs"
   - Authorized domains: `brilliantjobs.app`
   - Scopes: `gmail.readonly` (restricted scope — requires Google verification)
   - Test users: add your own email while in Testing mode
3. **Create OAuth Client ID**:
   - Application type: Web application
   - Name: "BJ Gmail Integration"
   - Authorized redirect URI: `https://brilliantjobs.app/api/auth/gmail/callback`
   - Download the client JSON → store Client ID and Client Secret as Supabase secrets

### 3.2 Scopes

| Scope | Purpose | Classification |
|-------|---------|---------------|
| `gmail.readonly` | Read messages, list threads, search by sender domain | **Restricted** — requires Google verification + security assessment for production |

We intentionally use the narrowest scope possible. We never need to send, modify, or delete emails.

### 3.3 OAuth Flow

```
User clicks "Connect Gmail" on Setup page
  │
  ▼
GET https://accounts.google.com/o/oauth2/v2/auth
  ?client_id={GMAIL_CLIENT_ID}
  &redirect_uri=https://brilliantjobs.app/api/auth/gmail/callback
  &response_type=code
  &scope=https://www.googleapis.com/auth/gmail.readonly
  &access_type=offline        ← gets refresh token
  &prompt=consent             ← forces consent every time (ensures refresh token)
  &state={user_id}:{csrf_token}
  │
  ▼
User grants permission on Google consent screen
  │
  ▼
Redirect to callback with ?code=AUTH_CODE&state=...
  │
  ▼
gmail-auth Edge Function:
  1. Verify CSRF token from state param
  2. Exchange auth code for tokens:
     POST https://oauth2.googleapis.com/token
       grant_type=authorization_code
       code={AUTH_CODE}
       client_id={GMAIL_CLIENT_ID}
       client_secret={GMAIL_CLIENT_SECRET}
       redirect_uri={REDIRECT_URI}
  3. Store encrypted refresh_token in gmail_connections table
  4. Store access_token in memory (short-lived, 1 hour)
  5. Redirect user back to Setup page with success indicator
```

### 3.4 Token Management

```sql
CREATE TABLE gmail_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  gmail_address text NOT NULL,
  refresh_token_enc text NOT NULL,    -- encrypted with SUPABASE_JWT_SECRET
  token_expires_at timestamptz,
  last_sync_at timestamptz,
  sync_status text DEFAULT 'active'
    CHECK (sync_status IN ('active', 'paused', 'revoked', 'error')),
  error_message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

-- RLS: users can only see their own connection
ALTER TABLE gmail_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own gmail connection"
  ON gmail_connections FOR ALL USING (auth.uid() = user_id);
```

**Token refresh pattern** (in gmail-scan Edge Function):

```typescript
async function getAccessToken(connection: GmailConnection): Promise<string> {
  // Check if cached token is still valid
  if (connection.token_expires_at && new Date(connection.token_expires_at) > new Date()) {
    return decrypt(connection.cached_access_token);
  }

  // Refresh
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: decrypt(connection.refresh_token_enc),
      client_id: GMAIL_CLIENT_ID,
      client_secret: GMAIL_CLIENT_SECRET,
    }),
  });

  const tokens = await res.json();
  if (tokens.error) {
    // Token revoked or expired — mark connection
    await sb.from('gmail_connections')
      .update({ sync_status: 'revoked', error_message: tokens.error })
      .eq('id', connection.id);
    throw new Error(`Gmail token error: ${tokens.error}`);
  }

  // Update stored expiry
  await sb.from('gmail_connections')
    .update({
      token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', connection.id);

  return tokens.access_token;
}
```

---

## 4. Email Signal Scanning

### 4.1 gmail-scan Edge Function

**Schedule:** pg_cron every 6 hours
**Batch:** Process all users with active `gmail_connections`
**Rate limits:** Gmail API allows 250 quota units/second per user. `messages.list` = 5 units, `messages.get` = 5 units.

```typescript
// Core scanning logic per user
async function scanUserGmail(userId: string, accessToken: string) {
  // Get all companies in user's pipeline at 'applied' stage or later
  const { data: pipelineEntries } = await sb
    .from('user_pipeline')
    .select('id, company_slug, company_domain, applied_at, stage')
    .eq('user_id', userId)
    .in('stage', ['applied', 'responded', 'interview']);

  if (!pipelineEntries?.length) return;

  // For each company, search Gmail for messages from that domain
  for (const entry of pipelineEntries) {
    if (!entry.company_domain) continue;

    const query = `from:${entry.company_domain} after:${formatGmailDate(entry.applied_at)}`;

    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=5`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const data = await res.json();

    if (data.messages?.length) {
      // Fetch the most recent message to classify it
      const msg = await fetchMessage(accessToken, data.messages[0].id);
      const classification = classifyEmail(msg);

      await sb.from('email_signals').upsert({
        user_id: userId,
        pipeline_entry_id: entry.id,
        company_domain: entry.company_domain,
        last_email_at: msg.internalDate,
        email_count: data.messages.length,
        classification: classification,
        snippet: msg.snippet?.substring(0, 200),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id, pipeline_entry_id' });
    } else {
      // No email from this company — strong ghost signal
      await sb.from('email_signals').upsert({
        user_id: userId,
        pipeline_entry_id: entry.id,
        company_domain: entry.company_domain,
        last_email_at: null,
        email_count: 0,
        classification: 'silence',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id, pipeline_entry_id' });
    }
  }
}
```

### 4.2 Email Classification

```typescript
type EmailClassification =
  | 'response'        // Generic response from company
  | 'interview'       // Interview scheduling (calendar links, time slots)
  | 'rejection'       // Rejection notice
  | 'auto_reply'      // Automated acknowledgment ("We received your application")
  | 'scheduling'      // Scheduling link (Calendly, etc.)
  | 'silence';        // No emails found

function classifyEmail(msg: GmailMessage): EmailClassification {
  const subject = (msg.subject || '').toLowerCase();
  const body = (msg.snippet || '').toLowerCase();
  const combined = subject + ' ' + body;

  // Rejection signals
  const rejectPatterns = [
    'unfortunately', 'not moving forward', 'other candidates',
    'not a fit', 'decided not to', 'position has been filled',
    'we will not be', 'regret to inform', 'after careful consideration'
  ];
  if (rejectPatterns.some(p => combined.includes(p))) return 'rejection';

  // Interview / scheduling signals
  const interviewPatterns = [
    'interview', 'schedule a call', 'calendly.com', 'meet with',
    'available for a chat', 'phone screen', 'next steps',
    'goodtime.io', 'greenhouse.io/interviews', 'zoom.us/j/'
  ];
  if (interviewPatterns.some(p => combined.includes(p))) return 'interview';

  // Scheduling link patterns
  const schedPatterns = ['calendly.com', 'goodtime.io', 'schedule.', 'pick a time'];
  if (schedPatterns.some(p => combined.includes(p))) return 'scheduling';

  // Auto-reply signals
  const autoPatterns = [
    'we received your application', 'thank you for applying',
    'application received', 'we appreciate your interest',
    'do not reply', 'no-reply', 'noreply'
  ];
  if (autoPatterns.some(p => combined.includes(p))) return 'auto_reply';

  // If we got a real email, it's a response
  return 'response';
}
```

### 4.3 Email Signals Table

```sql
CREATE TABLE email_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  pipeline_entry_id uuid NOT NULL,
  company_domain text NOT NULL,
  last_email_at timestamptz,
  email_count int DEFAULT 0,
  classification text DEFAULT 'silence'
    CHECK (classification IN ('response', 'interview', 'rejection',
                              'auto_reply', 'scheduling', 'silence')),
  snippet text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, pipeline_entry_id)
);

CREATE INDEX idx_email_signals_user ON email_signals (user_id);
CREATE INDEX idx_email_signals_classification ON email_signals (classification);

ALTER TABLE email_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own signals"
  ON email_signals FOR ALL USING (auth.uid() = user_id);
```

---

## 5. Ghost Engine (Scoring)

### 5.1 Ghost Score Formula

The ghost score is 0–100, where 100 = definitely ghosted. It combines four weighted factors:

| Factor | Weight | Calculation |
|--------|--------|-------------|
| **Time elapsed** | 40% | `min(days_since_applied / (2 × avg_response_days), 1.0) × 100` |
| **Email silence** | 30% | `100` if no email from domain, `50` if only auto-reply, `0` if real response |
| **Listing status** | 15% | `100` if listing closed/removed, `50` if reposted, `0` if still open |
| **Company history** | 15% | Company's historical ghost rate across all BJ users (aggregate) |

```sql
CREATE OR REPLACE FUNCTION compute_ghost_score(
  p_days_since_applied int,
  p_avg_response_days int,
  p_email_classification text,
  p_listing_status text,
  p_company_ghost_rate numeric
)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_time_score numeric;
  v_email_score numeric;
  v_listing_score numeric;
  v_company_score numeric;
  v_total numeric;
  v_status text;
  v_confidence text;
BEGIN
  -- Time factor (40%)
  v_time_score := LEAST(p_days_since_applied::numeric / GREATEST(2 * p_avg_response_days, 14), 1.0) * 100;

  -- Email factor (30%)
  v_email_score := CASE p_email_classification
    WHEN 'silence' THEN 100
    WHEN 'auto_reply' THEN 50
    WHEN 'rejection' THEN 10   -- They responded, just negatively
    WHEN 'response' THEN 0
    WHEN 'interview' THEN 0
    WHEN 'scheduling' THEN 0
    ELSE 70  -- No Gmail connected = moderate assumption
  END;

  -- Listing factor (15%)
  v_listing_score := CASE p_listing_status
    WHEN 'closed' THEN 100
    WHEN 'removed' THEN 100
    WHEN 'reposted' THEN 50
    WHEN 'open' THEN 0
    ELSE 30
  END;

  -- Company history factor (15%)
  v_company_score := COALESCE(p_company_ghost_rate * 100, 50);

  -- Weighted total
  v_total := (v_time_score * 0.40) + (v_email_score * 0.30) +
             (v_listing_score * 0.15) + (v_company_score * 0.15);

  -- Status classification
  v_status := CASE
    WHEN v_total >= 80 THEN 'ghosted'
    WHEN v_total >= 50 THEN 'likely_ghosted'
    WHEN v_total >= 25 THEN 'waiting'
    ELSE 'active'
  END;

  -- Confidence based on data availability
  v_confidence := CASE
    WHEN p_email_classification IS NOT NULL AND p_email_classification != 'silence'
      THEN 'high'
    WHEN p_email_classification = 'silence'
      THEN 'medium'
    ELSE 'low'  -- No Gmail data
  END;

  RETURN jsonb_build_object(
    'score', round(v_total),
    'status', v_status,
    'confidence', v_confidence,
    'factors', jsonb_build_object(
      'time', round(v_time_score),
      'email', round(v_email_score),
      'listing', round(v_listing_score),
      'company_history', round(v_company_score)
    )
  );
END;
$$;
```

### 5.2 Ghost Status Enum

| Status | Score Range | Description | UI |
|--------|-----------|-------------|-----|
| `active` | 0–24 | Recently applied or response received | Green dot |
| `waiting` | 25–49 | Normal wait time, no red flags yet | Amber dot |
| `likely_ghosted` | 50–79 | Past average response time, no signal | Red dot, pulsing |
| `ghosted` | 80–100 | High confidence ghost — listing closed, email silence, past 2× avg | Red dot, solid, alert triggered |

### 5.3 User Pipeline Ghost View

```sql
CREATE OR REPLACE FUNCTION get_pipeline_ghost_status(p_user_id uuid)
RETURNS TABLE (
  pipeline_entry_id uuid,
  company_slug text,
  company_name text,
  job_title text,
  applied_at timestamptz,
  days_since_applied int,
  email_classification text,
  listing_status text,
  ghost_score int,
  ghost_status text,
  confidence text,
  recommended_action text
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.company_slug,
    COALESCE(c.company_name, p.company_slug),
    p.job_title,
    p.applied_at,
    EXTRACT(DAY FROM now() - p.applied_at)::int,
    COALESCE(es.classification, 'unknown'),
    COALESCE(j.status, 'unknown'),
    (compute_ghost_score(
      EXTRACT(DAY FROM now() - p.applied_at)::int,
      COALESCE(cg.avg_response_days, 7),
      es.classification,
      j.status,
      cg.ghost_rate
    )->>'score')::int,
    compute_ghost_score(
      EXTRACT(DAY FROM now() - p.applied_at)::int,
      COALESCE(cg.avg_response_days, 7),
      es.classification,
      j.status,
      cg.ghost_rate
    )->>'status',
    compute_ghost_score(
      EXTRACT(DAY FROM now() - p.applied_at)::int,
      COALESCE(cg.avg_response_days, 7),
      es.classification,
      j.status,
      cg.ghost_rate
    )->>'confidence',
    CASE
      WHEN (compute_ghost_score(...))->>'status' = 'ghosted'
        THEN 'Move on. Follow up one last time or archive.'
      WHEN (compute_ghost_score(...))->>'status' = 'likely_ghosted'
        THEN 'Send a polite follow-up email.'
      WHEN (compute_ghost_score(...))->>'status' = 'waiting'
        THEN 'Still within normal response window.'
      ELSE 'No action needed.'
    END
  FROM user_pipeline p
  LEFT JOIN email_signals es ON es.pipeline_entry_id = p.id AND es.user_id = p.user_id
  LEFT JOIN ats_jobs j ON j.greenhouse_id = p.job_id AND j.ats_source = p.ats_source
  LEFT JOIN ats_companies c ON c.slug = p.company_slug AND c.source = p.ats_source
  LEFT JOIN company_ghost_stats cg ON cg.company_slug = p.company_slug
  WHERE p.user_id = p_user_id
    AND p.stage = 'applied'
  ORDER BY applied_at ASC;
END;
$$;
```

---

## 6. Company Ghost Aggregate Stats

Track ghost rates per company across all BJ users to power the employer accountability features:

```sql
CREATE TABLE company_ghost_stats (
  company_slug text PRIMARY KEY,
  total_applications int DEFAULT 0,
  total_ghosted int DEFAULT 0,
  ghost_rate numeric GENERATED ALWAYS AS (
    CASE WHEN total_applications > 0
      THEN total_ghosted::numeric / total_applications
      ELSE 0
    END
  ) STORED,
  avg_response_days int DEFAULT 7,
  last_computed_at timestamptz DEFAULT now()
);

-- Nightly recomputation (pg_cron)
CREATE OR REPLACE FUNCTION recompute_company_ghost_stats()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO company_ghost_stats (company_slug, total_applications, total_ghosted, avg_response_days, last_computed_at)
  SELECT
    p.company_slug,
    count(*),
    count(*) FILTER (WHERE
      EXTRACT(DAY FROM now() - p.applied_at) > 21
      AND p.stage = 'applied'
      AND COALESCE(es.classification, 'silence') IN ('silence', 'auto_reply')
    ),
    COALESCE(
      AVG(EXTRACT(DAY FROM p.responded_at - p.applied_at))
        FILTER (WHERE p.responded_at IS NOT NULL),
      7
    )::int,
    now()
  FROM user_pipeline p
  LEFT JOIN email_signals es ON es.pipeline_entry_id = p.id
  WHERE p.stage IN ('applied', 'responded', 'interview', 'offer', 'rejected')
  GROUP BY p.company_slug
  ON CONFLICT (company_slug) DO UPDATE SET
    total_applications = EXCLUDED.total_applications,
    total_ghosted = EXCLUDED.total_ghosted,
    avg_response_days = EXCLUDED.avg_response_days,
    last_computed_at = now();
END;
$$;
```

---

## 7. Pipeline Auto-Update from Email

When gmail-scan detects a meaningful email signal, it can auto-advance the pipeline:

| Email Classification | Pipeline Action |
|---------------------|-----------------|
| `interview` | Move to `interview` stage, set `responded_at` if not set |
| `scheduling` | Move to `interview` stage, set `responded_at` if not set |
| `rejection` | Move to `rejected` stage |
| `response` | Move to `responded` stage (if currently `applied`) |
| `auto_reply` | No stage change (acknowledges receipt only) |
| `silence` | No stage change (ghost scoring handles this) |

```typescript
async function autoAdvancePipeline(
  userId: string,
  entryId: string,
  classification: EmailClassification
) {
  const stageMap: Record<string, string | null> = {
    interview: 'interview',
    scheduling: 'interview',
    rejection: 'rejected',
    response: 'responded',
    auto_reply: null,
    silence: null,
  };

  const newStage = stageMap[classification];
  if (!newStage) return;

  const { data: entry } = await sb
    .from('user_pipeline')
    .select('stage')
    .eq('id', entryId)
    .single();

  // Only advance forward, never backwards
  const stageOrder = ['saved', 'applied', 'responded', 'interview', 'offer', 'rejected'];
  const currentIdx = stageOrder.indexOf(entry?.stage || 'saved');
  const newIdx = stageOrder.indexOf(newStage);

  if (newIdx > currentIdx) {
    await sb
      .from('user_pipeline')
      .update({
        stage: newStage,
        [`${newStage}_at`]: new Date().toISOString(),
        auto_advanced: true,
        auto_advanced_source: 'gmail',
      })
      .eq('id', entryId);

    // Send notification about the stage change
    await sendNotification({
      user_id: userId,
      type: newStage === 'rejected' ? 'pipeline_rejection' : 'pipeline_response',
      payload: { entry_id: entryId, new_stage: newStage, source: 'gmail' },
    });
  }
}
```

---

## 8. Ghost Monitor Dashboard Page

The existing Ghost Monitor nav page becomes the primary UI for ghost data:

### 8.1 KPI Cards (top row)

| Metric | Source |
|--------|--------|
| Active Applications | `user_pipeline WHERE stage = 'applied'` count |
| Avg Days Waiting | `AVG(now() - applied_at)` for applied stage |
| Likely Ghosted | Count where ghost_status = 'likely_ghosted' |
| Confirmed Ghosted | Count where ghost_status = 'ghosted' |
| Gmail Connected | Boolean — shows "Connect Gmail" CTA if not |

### 8.2 Ghost Table

| Column | Source |
|--------|--------|
| Company | company_name from ats_companies |
| Role | job_title from pipeline |
| Applied | applied_at formatted |
| Days | days_since_applied |
| Email Signal | Icon: ✅ response, 📧 auto-reply, ❌ silence, 🔒 no Gmail |
| Ghost Score | 0–100 with color bar |
| Status | Badge: Active / Waiting / Likely Ghosted / Ghosted |
| Action | Button: "Follow Up" / "Archive" / "Move On" |

### 8.3 Ghost Score Distribution Chart (ECharts)

Stacked bar chart showing the user's applications by ghost status bucket. Helps visualize how many applications are in each stage.

---

## 9. Notifications

### 9.1 Ghost Alert (Individual)

Triggered by `job-intelligence` Edge Function when ghost_score crosses 80 for the first time:

**Email subject:** "No response from [Company] after [X] days"
**Body:** Ghost score breakdown, recommended action, one-click archive button.

### 9.2 Weekly Ghost Report

Part of the weekly summary email. Aggregates:
- New ghosts this week
- Companies past average response time
- Overall ghost rate across user's applications

### 9.3 Ghost Alert Dedup

```sql
-- Prevent duplicate ghost alerts for the same pipeline entry
CREATE TABLE ghost_alerts_sent (
  user_id uuid REFERENCES profiles(id),
  pipeline_entry_id uuid NOT NULL,
  ghost_status text NOT NULL,
  sent_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, pipeline_entry_id, ghost_status)
);
```

Only send a `ghost_alert` notification if no row exists in `ghost_alerts_sent` for that user + entry + status combination.

---

## 10. Build Order

### Phase 1: Foundation (no Gmail needed)

| # | Task | Depends On | Estimate |
|---|------|-----------|----------|
| 1.1 | Create `user_pipeline` table (migrate from localStorage) | — | 2h |
| 1.2 | Create `company_ghost_stats` table + nightly recompute RPC | 1.1 | 1h |
| 1.3 | Create `ghost_alerts_sent` dedup table | — | 30m |
| 1.4 | Implement `compute_ghost_score()` RPC (time + listing factors only, no email) | 1.1 | 1h |
| 1.5 | Update `job-intelligence` Edge Function to use new ghost scoring | 1.4 | 2h |
| 1.6 | Ghost Monitor page: KPI cards + table with time-only ghost scores | 1.4 | 3h |

### Phase 2: Gmail OAuth

| # | Task | Depends On | Estimate |
|---|------|-----------|----------|
| 2.1 | Enable Gmail API in GCP Console | — | 10m |
| 2.2 | Create OAuth Client ID + configure consent screen | 2.1 | 30m |
| 2.3 | Store GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET as Supabase secrets | 2.2 | 10m |
| 2.4 | Create `gmail_connections` table | — | 30m |
| 2.5 | Build `gmail-auth` Edge Function (OAuth callback handler) | 2.3, 2.4 | 3h |
| 2.6 | Setup page: "Connect Gmail" button + connection status display | 2.5 | 2h |
| 2.7 | Token refresh utility function | 2.5 | 1h |

### Phase 3: Email Scanning

| # | Task | Depends On | Estimate |
|---|------|-----------|----------|
| 3.1 | Create `email_signals` table | — | 30m |
| 3.2 | Build `gmail-scan` Edge Function | 2.7, 3.1 | 4h |
| 3.3 | Email classification logic | 3.2 | 2h |
| 3.4 | pg_cron schedule for gmail-scan (every 6h) | 3.2 | 15m |
| 3.5 | Pipeline auto-advance from email signals | 3.3 | 2h |

### Phase 4: Full Ghost Engine

| # | Task | Depends On | Estimate |
|---|------|-----------|----------|
| 4.1 | Update `compute_ghost_score()` to include email factor | 3.1 | 1h |
| 4.2 | `get_pipeline_ghost_status()` RPC | 4.1 | 2h |
| 4.3 | Ghost Monitor page: add email signal column, confidence indicator | 4.2 | 2h |
| 4.4 | Ghost score distribution chart (ECharts) | 4.2 | 1h |
| 4.5 | Company ghost rate in Company Browser | 1.2 | 1h |

### Phase 5: Polish & Verification

| # | Task | Depends On | Estimate |
|---|------|-----------|----------|
| 5.1 | Google OAuth verification application (restricted scope) | 2.6 tested | 2h paperwork |
| 5.2 | Privacy policy update (Gmail data usage disclosure) | 5.1 | 1h |
| 5.3 | Ghost alert email template (dark theme, matches existing 18 templates) | 4.1 | 1h |
| 5.4 | Weekly ghost report section in weekly-summary Edge Function | 4.2 | 1h |
| 5.5 | Admin console: ghost stats overview (aggregate ghost rates) | 1.2 | 2h |

---

## 11. Database Migration Summary

```sql
-- Run in order:
-- 1. gmail_connections
-- 2. email_signals
-- 3. company_ghost_stats
-- 4. ghost_alerts_sent
-- 5. compute_ghost_score() function
-- 6. get_pipeline_ghost_status() function
-- 7. recompute_company_ghost_stats() function
-- 8. pg_cron jobs:
--    - gmail-scan: every 6 hours
--    - recompute_company_ghost_stats: nightly at 3am UTC
```

---

## 12. Edge Functions Summary

| Function | Trigger | Purpose |
|----------|---------|---------|
| `gmail-auth` | HTTP (OAuth callback) | Exchange auth code for tokens, store connection |
| `gmail-scan` | pg_cron every 6h | Scan Gmail for pipeline company emails |
| `job-intelligence` | pg_cron daily (existing, updated) | Ghost scoring + alerts using new engine |
| `ghost-stats` | pg_cron nightly | Recompute company-level ghost rates |

---

## 13. Supabase Secrets Required

| Secret | Source |
|--------|--------|
| `GMAIL_CLIENT_ID` | GCP Console → OAuth Client |
| `GMAIL_CLIENT_SECRET` | GCP Console → OAuth Client |
| `GMAIL_REDIRECT_URI` | `https://brilliantjobs.app/api/auth/gmail/callback` |

```bash
supabase secrets set GMAIL_CLIENT_ID=xxx
supabase secrets set GMAIL_CLIENT_SECRET=xxx
supabase secrets set GMAIL_REDIRECT_URI=https://brilliantjobs.app/api/auth/gmail/callback
```

---

## 14. Privacy & Security

- **Minimal scope:** `gmail.readonly` only — we never send, modify, or delete emails
- **Encrypted storage:** Refresh tokens encrypted at rest in `gmail_connections`
- **No email content stored:** We only store classification, snippet (200 chars), and timestamp — never full email bodies
- **User control:** Users can disconnect Gmail at any time from the Setup page, which deletes all stored tokens and email signals
- **Data retention:** Email signals older than 90 days are purged automatically
- **Google verification:** Required before production launch (restricted scope). Includes security assessment.

---

## 15. Success Metrics

| Metric | Target |
|--------|--------|
| Gmail connection rate | >40% of active users connect Gmail |
| Ghost detection accuracy | >85% (validate against manual user reports) |
| Pipeline auto-advance accuracy | >90% correct stage classification |
| Ghost alert → user action rate | >60% archive or follow up within 48h |
| Avg ghost detection latency | <24h from email signal to pipeline update |
