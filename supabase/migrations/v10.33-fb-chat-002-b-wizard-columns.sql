-- FB-CHAT-002-B: Add source and wizard_answers columns to saved_prompts
-- Supports guided intake wizard prompts alongside freeform chat prompts

ALTER TABLE saved_prompts ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'chat';
ALTER TABLE saved_prompts ADD COLUMN IF NOT EXISTS wizard_answers jsonb;

-- Comment for documentation
COMMENT ON COLUMN saved_prompts.source IS 'chat (freeform) or wizard (guided intake)';
COMMENT ON COLUMN saved_prompts.wizard_answers IS 'Structured answers from wizard steps, keyed by step number. NULL for freeform.';
