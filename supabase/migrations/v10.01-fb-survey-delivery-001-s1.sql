-- FB-SURVEY-DELIVERY-001 Session 1: Survey Delivery Foundation
-- survey_campaigns table, survey_links table, grant_survey_credits RPC
-- Seed data for all survey campaign types

-- ─── 1. survey_campaigns table ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS survey_campaigns (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  survey_version    text NOT NULL UNIQUE,
  survey_type       text NOT NULL CHECK (survey_type IN ('nps', 'periodic', 'micro', 'exit')),
  title             text NOT NULL,
  description       text,
  estimated_minutes smallint DEFAULT 2,
  credit_reward     smallint DEFAULT 0,
  priority          smallint DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),
  is_active         boolean DEFAULT true,
  channels          text[] DEFAULT '{overlay,merch,email}',
  target_audience   jsonb,            -- {plan: 'free', min_sessions: 3, cohort_id: null}
  frequency_days    smallint DEFAULT 14,
  created_at        timestamptz DEFAULT now(),
  expires_at        timestamptz,
  scar_meta         jsonb              -- S: future channel types, audience dimensions
);

CREATE INDEX IF NOT EXISTS idx_survey_campaigns_active
  ON survey_campaigns (is_active, priority) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_survey_campaigns_type
  ON survey_campaigns (survey_type);
CREATE INDEX IF NOT EXISTS idx_survey_campaigns_version
  ON survey_campaigns (survey_version);

ALTER TABLE survey_campaigns ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read active campaigns (needed for overlay eligibility check)
DROP POLICY IF EXISTS survey_campaigns_read ON survey_campaigns;
CREATE POLICY survey_campaigns_read ON survey_campaigns
  FOR SELECT TO authenticated USING (true);

-- Service role manages campaigns
DROP POLICY IF EXISTS survey_campaigns_service ON survey_campaigns;
CREATE POLICY survey_campaigns_service ON survey_campaigns
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE survey_campaigns IS 'Admin-managed survey campaign definitions. Controls delivery rules, priority, channels, and audience targeting.';
COMMENT ON COLUMN survey_campaigns.channels IS 'Valid values: overlay, merch, email, sms. Scar: new channel types added as array values, no schema change.';
COMMENT ON COLUMN survey_campaigns.target_audience IS 'Hook: schema-free JSONB — new targeting dimensions (geography, activity score) added without migration.';
COMMENT ON COLUMN survey_campaigns.scar_meta IS 'Evolvability scar: reserved for future extensibility without schema changes.';


-- ─── 2. survey_links table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS survey_links (
  token         char(6) PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  survey_version text NOT NULL,
  channel       text NOT NULL CHECK (channel IN ('email', 'sms')),
  created_at    timestamptz DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  used_at       timestamptz            -- set on first click
);

CREATE INDEX IF NOT EXISTS idx_survey_links_user
  ON survey_links (user_id);
CREATE INDEX IF NOT EXISTS idx_survey_links_expires
  ON survey_links (expires_at) WHERE used_at IS NULL;

ALTER TABLE survey_links ENABLE ROW LEVEL SECURITY;

-- Users can read their own links
DROP POLICY IF EXISTS survey_links_user_read ON survey_links;
CREATE POLICY survey_links_user_read ON survey_links
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Service role manages links
DROP POLICY IF EXISTS survey_links_service ON survey_links;
CREATE POLICY survey_links_service ON survey_links
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE survey_links IS 'Short URL tokens for email/SMS deep links. Token is 6-char alphanumeric. Scar: channel CHECK can be extended for push/whatsapp.';


-- ─── 3. grant_survey_credits RPC ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION grant_survey_credits(
  p_user_id uuid,
  p_amount smallint,
  p_survey_version text
) RETURNS smallint AS $$
DECLARE v_new_balance numeric;
BEGIN
  -- Idempotency: check if already rewarded for this survey version
  IF EXISTS (
    SELECT 1 FROM credit_transactions
    WHERE user_id = p_user_id
      AND source = 'survey_reward'
      AND feature = p_survey_version
  ) THEN
    SELECT credit_balance INTO v_new_balance FROM profiles WHERE id = p_user_id;
    RETURN COALESCE(v_new_balance, 0)::smallint;
  END IF;

  -- Grant credits
  UPDATE profiles SET credit_balance = credit_balance + p_amount
  WHERE id = p_user_id
  RETURNING credit_balance INTO v_new_balance;

  -- Log transaction
  INSERT INTO credit_transactions (user_id, amount, balance_after, source, feature)
  VALUES (p_user_id, p_amount, v_new_balance, 'survey_reward', p_survey_version);

  RETURN COALESCE(v_new_balance, 0)::smallint;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION grant_survey_credits(uuid, smallint, text) TO authenticated, service_role;

COMMENT ON FUNCTION grant_survey_credits IS 'Idempotent credit grant for survey completion. Uses credit_transactions.source=survey_reward + feature=survey_version for dedup.';


-- ─── 4. Seed survey campaigns ─────────────────────────────────────────────────
INSERT INTO survey_campaigns (survey_version, survey_type, title, description, estimated_minutes, credit_reward, priority, is_active, channels, target_audience, frequency_days)
VALUES
  -- NPS (P2 priority)
  ('nps_v1', 'nps', 'How are we doing?', 'Quick 30-second check-in on your experience', 1, 3, 2, true,
   '{overlay,merch,email}', '{"min_sessions": 3}'::jsonb, 30),

  -- Periodic (P3 priority)
  ('periodic_v2', 'periodic', 'Help shape Brilliant Jobs', 'Share your feedback and earn credits', 2, 5, 3, true,
   '{overlay,merch,email}', '{"min_sessions": 5}'::jsonb, 14),

  -- Micro: Paywall friction (P1 — highest priority)
  ('micro_paywall_v1', 'micro', 'Quick question about pricing', 'Help us understand pricing preferences', 1, 1, 1, true,
   '{overlay}', null, 7),

  -- Micro: Apply confidence (P4)
  ('micro_apply_confidence_v1', 'micro', 'How confident are you?', 'Quick pulse on your application confidence', 1, 1, 4, true,
   '{overlay}', null, 7),

  -- Micro: Search relevance (P5)
  ('micro_search_relevance_v1', 'micro', 'Are results relevant?', 'Help us improve job matching', 1, 1, 5, true,
   '{overlay}', null, 7),

  -- Micro: Data value (P6 — lowest)
  ('micro_data_value_v1', 'micro', 'Is the data useful?', 'Quick check on data quality perception', 1, 1, 6, true,
   '{overlay}', null, 7),

  -- Exit survey (no credits — user is leaving)
  ('exit_v1', 'exit', 'Before you go...', 'Help us understand what went wrong', 2, 0, 2, true,
   '{overlay}', null, 180)

ON CONFLICT (survey_version) DO NOTHING;
