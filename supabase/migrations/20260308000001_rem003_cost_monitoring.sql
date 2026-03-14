-- =============================================================
-- REM-003: AI Cost Monitoring — Aggregation Views + Budget Alerts
-- Date: 2026-03-08
-- SKIPPED: ai_usage_log table schema does not have the expected
-- columns (function_name, model, input_tokens, output_tokens,
-- total_tokens, estimated_cost_usd, duration_ms).
-- Actual columns: id, user_id, usage_date, feature, created_at.
-- This migration will be rewritten when cost_tracking is enriched.
-- =============================================================

-- No-op: record as applied
SELECT 1;
