-- FA-001: Seed feed_content_search feature flag
-- Controls whether What pills search content_tsv alongside title ilike.
-- Starts enabled — content search is the desired behavior.
-- Toggle OFF to revert to title-only search instantly.

INSERT INTO public.feature_flags (id, key, name, description, type, status, rollout_percentage, category, updated_at)
VALUES (
  'feed_content_search',
  'feed_content_search',
  'Feed Content Search',
  'FA-001: Expand What pills to search job description content (content_tsv) alongside title. Positive AND negative pills both use content. Toggle OFF to revert to title-only.',
  'boolean',
  'active',
  100,
  'ops',
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  status = 'active',
  description = EXCLUDED.description,
  updated_at = NOW();
