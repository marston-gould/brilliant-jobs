-- REM-S10/S11: Add gmail_scan_label column for custom label scope mode
ALTER TABLE pipeline_tracking_settings
  ADD COLUMN IF NOT EXISTS gmail_scan_label text DEFAULT '';
