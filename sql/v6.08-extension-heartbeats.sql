-- ============================================================
-- v6.08 Migration: Extension Heartbeats + Cron Check
-- Session 7: Extension Notifications + Heartbeat Monitoring
-- ============================================================

-- 1. Create extension_heartbeats table
CREATE TABLE IF NOT EXISTS extension_heartbeats (
  user_id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  extension_id text,
  extension_version text,
  last_heartbeat_at timestamptz DEFAULT now(),
  status text DEFAULT 'active' CHECK (status IN ('active', 'silent', 'disconnected')),
  silent_since timestamptz,
  disconnect_notified_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_extension_heartbeats_status ON extension_heartbeats(status);
CREATE INDEX IF NOT EXISTS idx_extension_heartbeats_last_heartbeat ON extension_heartbeats(last_heartbeat_at);

-- 3. RLS
ALTER TABLE extension_heartbeats ENABLE ROW LEVEL SECURITY;

-- Users can read/update their own row
DROP POLICY IF EXISTS "Users can view own heartbeat" ON extension_heartbeats;
CREATE POLICY "Users can view own heartbeat"
  ON extension_heartbeats FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can upsert own heartbeat" ON extension_heartbeats;
CREATE POLICY "Users can upsert own heartbeat"
  ON extension_heartbeats FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own heartbeat" ON extension_heartbeats;
CREATE POLICY "Users can update own heartbeat"
  ON extension_heartbeats FOR UPDATE
  USING (auth.uid() = user_id);

-- Service role bypasses RLS for cron operations
DROP POLICY IF EXISTS "Service role full access" ON extension_heartbeats;
CREATE POLICY "Service role full access"
  ON extension_heartbeats FOR ALL
  USING (auth.role() = 'service_role');

-- 4. Insert extension notification templates
INSERT INTO notification_templates (
  notification_type, channel, cohort_id, is_production,
  subject_line, preheader, html_body, plaintext_body,
  theme, version, status, created_at, updated_at
) VALUES
(
  'extension_update', 'email', 'default', true,
  'Brilliant Jobs Extension — New Update Available',
  'New features and improvements are ready for your Brilliant Jobs Chrome extension.',
  E'<p>Hi {{first_name}},</p><p>We just shipped version {{extension_version}} of the Brilliant Jobs Chrome extension — and it''s a good one.</p><p><strong>What''s New:</strong></p><ul><li>{{changelog_item_1}}</li><li>{{changelog_item_2}}</li><li>{{changelog_item_3}}</li></ul>{{#if breaking_changes}}<p>⚠️ <strong>Breaking Changes:</strong></p><p>{{breaking_changes_summary}}</p>{{/if}}<p>If you have auto-update enabled, you''re already on the latest version. Otherwise, click below to update manually.</p><p><a href="{{update_url}}" style="display:inline-block;padding:12px 24px;background:#2563EB;color:#fff;border-radius:6px;text-decoration:none;">Update Now →</a></p><p><a href="{{changelog_url}}">View Full Changelog</a></p><p>Questions or issues after updating? Reply to this email — we read every one.</p><p>— The Brilliant Jobs Team</p>',
  E'Hi {{first_name}}, we just shipped v{{extension_version}} of the Brilliant Jobs Chrome extension. What''s new: {{changelog_summary_plain}}. {{#if breaking_changes}}Breaking changes: {{breaking_changes_summary}}.{{/if}} Update now: {{update_url}} | Full changelog: {{changelog_url}}',
  'white', '1.0.0', 'production', now(), now()
),
(
  'extension_disconnected', 'email', 'default', true,
  'Your Brilliant Jobs Extension Needs Attention',
  'Your Chrome extension appears disconnected. Here''s how to get it running again in under a minute.',
  E'<p>Hi {{first_name}},</p><p>We noticed your Brilliant Jobs Chrome extension hasn''t checked in for {{days_silent}} days. This means you might be missing out on:</p><ul><li>LinkedIn connection syncing</li><li>Company profile enrichment while you browse</li><li>One-click job saving from LinkedIn and company pages</li></ul><p><strong>Quick Fixes (usually takes under 60 seconds):</strong></p><ol><li><strong>Check if it''s enabled:</strong> Open chrome://extensions and make sure Brilliant Jobs is toggled on.</li><li><strong>Try a quick refresh:</strong> Click the extension icon in your toolbar, then click "Reconnect."</li><li><strong>Reinstall if needed:</strong> Remove the extension and reinstall from the Chrome Web Store.</li></ol><p>If none of that works, we''re here to help — just reply to this email.</p><p><a href="{{reconnect_url}}" style="display:inline-block;padding:12px 24px;background:#2563EB;color:#fff;border-radius:6px;text-decoration:none;">Reconnect Extension →</a></p><p><a href="{{troubleshoot_url}}">Troubleshooting Guide</a></p><p>— The Brilliant Jobs Team</p>',
  E'Hi {{first_name}}, your Brilliant Jobs Chrome extension hasn''t checked in for {{days_silent}} days. Quick fixes: 1) Check chrome://extensions — make sure it''s enabled. 2) Click the extension icon and hit Reconnect. 3) Reinstall from Chrome Web Store. Need help? Reply to this email. Reconnect: {{reconnect_url}} | Troubleshooting: {{troubleshoot_url}}',
  'white', '1.0.0', 'production', now(), now()
)
ON CONFLICT DO NOTHING;

-- 5. Insert admin notification config for extension types
INSERT INTO admin_notification_config (
  notification_type, cohort_id, enabled, channel_override,
  created_at, updated_at
) VALUES
('extension_update', 'all', true, 'email', now(), now()),
('extension_disconnected', 'all', true, 'email', now(), now())
ON CONFLICT DO NOTHING;

-- 6. pg_cron: extension heartbeat check every 6 hours
SELECT cron.schedule(
  'extension-heartbeat-check',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://qojhagupdnbtomfoxnsf.supabase.co/functions/v1/extension-heartbeat',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{"action": "cron_check"}'::jsonb
  );
  $$
);
