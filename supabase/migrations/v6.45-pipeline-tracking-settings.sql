-- v6.45: Create pipeline_tracking_settings table
-- Fixes 406 error on dashboard load (table referenced but never created)

CREATE TABLE IF NOT EXISTS pipeline_tracking_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  smart_prompts_enabled BOOLEAN DEFAULT true,
  signal_detection_enabled BOOLEAN DEFAULT false,
  cadence_saved_days INTEGER DEFAULT 3,
  cadence_applied_days INTEGER DEFAULT 7,
  cadence_responded_days INTEGER DEFAULT 5,
  cadence_interview_days INTEGER DEFAULT 3,
  scan_frequency_minutes INTEGER DEFAULT 15,
  confidence_threshold NUMERIC(3,2) DEFAULT 0.60,
  email_thread_depth INTEGER DEFAULT 50,
  calendar_lookahead_days INTEGER DEFAULT 14,
  prompt_channels TEXT[] DEFAULT ARRAY['email', 'in_app'],
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE pipeline_tracking_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own settings" ON pipeline_tracking_settings
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own settings" ON pipeline_tracking_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own settings" ON pipeline_tracking_settings
  FOR UPDATE USING (auth.uid() = user_id);
