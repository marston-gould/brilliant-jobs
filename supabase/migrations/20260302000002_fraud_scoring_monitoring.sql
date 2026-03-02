-- Phase 5: Fraud scoring monitoring + pg_cron jobs
-- Backfill cron: backfill-fraud-scores (every 1 min, 500 jobs)
-- Auto-score cron: score-new-jobs (every 5 min, 100 unscored jobs)

CREATE OR REPLACE FUNCTION fraud_scoring_coverage()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'total_open', (SELECT count(*) FROM ats_jobs WHERE status = 'open'),
    'scored', (SELECT count(*) FROM job_fraud_scores),
    'unscored', (SELECT count(*) FROM ats_jobs WHERE status = 'open'
                 AND greenhouse_id NOT IN (SELECT job_id FROM job_fraud_scores)),
    'coverage_pct', round(100.0 * (SELECT count(*) FROM job_fraud_scores)
                    / NULLIF((SELECT count(*) FROM ats_jobs WHERE status = 'open'), 0), 2),
    'label_breakdown', (SELECT jsonb_object_agg(fraud_label, cnt)
                        FROM (SELECT fraud_label, count(*) as cnt
                              FROM job_fraud_scores GROUP BY fraud_label) sub),
    'avg_score', (SELECT round(avg(fraud_score), 3) FROM job_fraud_scores),
    'last_scored_at', (SELECT max(scored_at) FROM job_fraud_scores),
    'est_completion_minutes', CASE
      WHEN (SELECT count(*) FROM job_fraud_scores) <= 5 THEN NULL
      ELSE round(((SELECT count(*) FROM ats_jobs WHERE status = 'open'
                    AND greenhouse_id NOT IN (SELECT job_id FROM job_fraud_scores))::numeric / 500.0), 0)
    END
  );
$$;
