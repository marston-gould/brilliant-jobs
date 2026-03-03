# Brilliant Jobs — pg_cron Job Inventory

> **56 scheduled jobs** across 9 categories.  
> Last updated: 2026-03-02

---

## Schedule Quick Reference

| Pattern | Meaning |
|:---|:---|
| `*/1 * * * *` | Every minute |
| `*/3 * * * *` | Every 3 minutes |
| `*/5 * * * *` | Every 5 minutes |
| `*/10 * * * *` | Every 10 minutes |
| `*/15 * * * *` | Every 15 minutes |
| `0 */2 * * *` | Every 2 hours (top of hour) |
| `0 */6 * * *` | Every 6 hours |
| `0 H * * *` | Daily at H:00 UTC |
| `0 H * * 0` | Weekly on Sunday at H:00 UTC |
| `0 H * * 1` | Weekly on Monday at H:00 UTC |
| `0 H 1 * *` | Monthly on the 1st at H:00 UTC |

**Type legend:** Edge Fn = Supabase Edge Function via `net.http_post` · SQL Fn = PostgreSQL function call · SQL = inline SQL statement

---

## 1. Job Refresh & Data Ingestion

| ID | Job Name | Schedule | Type | Target | Description |
|:---|:---|:---|:---|:---|:---|
| 25 | `refresh-jobs-tiered` | `*/3 * * * *` | Edge Fn | `refresh-jobs` | Primary job scraper. Tiered HOT/WARM/COLD refresh across all ATS platforms. ~50 boards per invocation. |
| 2 | `daily-job-refresh` | `0 4 * * *` | Edge Fn | `refresh-orchestrator` | Daily orchestrator for full refresh pass across all boards. 4 AM UTC. |
| 4 | `refresh-batch-00` | `0 4 * * *` | Edge Fn | `refresh-jobs?offset=0` | Legacy batch refresh at offset 0. Runs alongside orchestrator. |
| 20 | `refresh-usajobs` | `0 */6 * * *` | Edge Fn | `refresh-usajobs` | Fetches federal positions from USAJOBS API. Every 6 hours. |
| 55 | `discover-boards-6h` | `0 */6 * * *` | Edge Fn | `discover-boards` | Discovers new ATS boards via crawl/discovery. Every 6 hours. |
| 59 | `resolve-boards` | `*/15 * * * *` | Edge Fn | `resolve-boards` | Validates discovered board slugs, checks HTTP status. Every 15 min. |
| 57 | `match-companies` | `*/30 * * * *` | SQL Fn | `match_companies_to_boards()` | Matches ats_companies to ref_companies for enrichment. Every 30 min. |

## 2. AI Enrichment & Scoring

| ID | Job Name | Schedule | Type | Target | Description |
|:---|:---|:---|:---|:---|:---|
| 49 | `enrich-jd-ai-batch` | `*/2 * * * *` | Edge Fn | `enrich-jd-ai` | AI job description enrichment via Claude Haiku. Extracts skills, education, experience, salary. |
| 47 | `jd-extraction-ongoing` | `*/5 * * * *` | SQL Fn | `run_jd_extraction_ongoing()` | Queues new/updated jobs for JD text extraction. |
| 39 | `silent-enrich` | `*/10 * * * *` | Edge Fn | `silent-enrich` | Background company enrichment (industry, website, employee size). |
| 63 | `enrich-fcd-batch` | `0 3 * * 0` | Edge Fn | `enrich-fcd-batch` | Free Company Dataset industry classification. Weekly Sunday 3 AM. |
| 42 | `backfill-content-tsv` | `30 seconds` | SQL Fn | `backfill_content_tsv(1000)` | Backfills full-text search vectors. 1000 rows per invocation. Continuous. |

## 3. Fraud & Quality Detection

| ID | Job Name | Schedule | Type | Target | Description |
|:---|:---|:---|:---|:---|:---|
| 74 | `backfill-fraud-scores` | `*/1 * * * *` | Edge Fn | `score-job-fraud` | Backfills fraud/ghost scores. Every minute until caught up, then auto-disables. |
| 75 | `score-new-jobs` | `*/5 * * * *` | Edge Fn | `score-job-fraud` | Scores newly arrived jobs for fraud/ghost signals. |
| 76 | `check-fraud-backfill-done` | `*/5 * * * *` | SQL | DO block | Auto-unschedules fraud backfill at ≥99% completion. |
| 77 | `auto-check-fraud-backfill` | `*/10 * * * *` | SQL Fn | `auto_disable_fraud_backfill()` | Secondary auto-disable check for fraud backfill. |
| 86 | `backfill-ai-content-scores` | `*/1 * * * *` | Edge Fn | `score-ai-content` | Detects AI-generated JDs. Backfill mode, auto-disables when done. |
| 87 | `score-new-jds-ai` | `*/5 * * * *` | Edge Fn | `score-ai-content` | Scores new JDs for AI-generated content. |
| 88 | `check-ai-backfill-done` | `*/10 * * * *` | SQL | DO block | Auto-unschedules AI content backfill when complete. |
| 81 | `nightly-ai-jd-rate` | `0 3 * * *` | SQL | UPDATE | Computes per-company AI-generated JD rate. Nightly 3 AM. |
| 19 | `nightly-ghost-stats` | `0 3 * * *` | SQL Fn | `recompute_company_ghost_stats()` | Recomputes ghost job statistics per company. Nightly 3 AM. |

## 4. Notifications & User Engagement

| ID | Job Name | Schedule | Type | Target | Description |
|:---|:---|:---|:---|:---|:---|
| 6 | `daily-digest` | `0 13 * * *` | Edge Fn | `daily-digest` | Daily job digest email. 1 PM UTC (8 AM ET). |
| 7 | `weekly-summary` | `0 13 * * 1` | Edge Fn | `weekly-summary` | Weekly summary with job market insights. Mondays 1 PM UTC. |
| 15 | `escalation-reduced` | `30 */2 * * *` | Edge Fn | `escalation-checker` | Notification escalation (email → SMS). Every 2 hours at :30. |
| 64 | `onboarding-sequence` | `0 * * * *` | Edge Fn | `onboarding-sequence` | Drip onboarding emails for new users. Hourly. |
| 65 | `adoption-sequence` | `30 * * * *` | Edge Fn | `adoption-sequence` | Feature adoption nudge emails. Hourly at :30. |
| 73 | `reengagement-daily-check` | `0 16 * * *` | Edge Fn | `re-engagement` | Re-engagement emails for inactive users. Daily 4 PM UTC. |
| 72 | `billing-expiring-check` | `0 15 * * *` | Edge Fn | `billing-notifications` | Subscription expiration warnings. Daily 3 PM UTC. |

## 5. Pipeline & Application Management

| ID | Job Name | Schedule | Type | Target | Description |
|:---|:---|:---|:---|:---|:---|
| 60 | `auto-apply-trigger` | `*/10 * * * *` | Edge Fn | `auto-apply-trigger` | Evaluates auto-apply rules, queues matching jobs. Every 10 min. |
| 44 | `expire-pending-apps` | `*/15 * * * *` | SQL | UPDATE | Expires pending applications past TTL. Every 15 min. |
| 29 | `prompt-pipeline-hourly` | `30 * * * *` | Edge Fn | `prompt-pipeline-updates` | Prompts users to update stale pipeline entries. Hourly at :30. |
| 30 | `scan-pipeline-signals-15m` | `*/15 * * * *` | Edge Fn | `scan-pipeline-signals` | Scans for pipeline stage change signals (email, calendar). Every 15 min. |
| 66 | `interview-reminder-24h` | `*/15 * * * *` | Edge Fn | `interview-sequence` | 24-hour interview reminder emails. Every 15 min. |
| 67 | `interview-reminder-1h` | `*/10 * * * *` | Edge Fn | `interview-sequence` | 1-hour interview reminder emails. Every 10 min. |
| 50 | `referral-fraud-scan` | `*/15 * * * *` | Edge Fn | `referral-fraud-scan` | Scans for fraudulent referral activity. Every 15 min. |
| 51 | `refresh-referral-leaderboard` | `0 * * * *` | SQL Fn | `refresh_referral_leaderboard()` | Refreshes referral leaderboard materialized view. Hourly. |
| 52 | `distribute-weekly-leaderboard` | `0 0 * * 1` | SQL Fn | `distribute_leaderboard_rewards('weekly')` | Distributes weekly referral rewards. Mondays midnight. |
| 53 | `distribute-monthly-leaderboard` | `0 0 1 * *` | SQL Fn | `distribute_leaderboard_rewards('monthly')` | Distributes monthly referral rewards. 1st of month. |

## 6. Gmail & Calendar Integration

| ID | Job Name | Schedule | Type | Target | Description |
|:---|:---|:---|:---|:---|:---|
| 21 | `gmail-scan-6h` | `0 */6 * * *` | Edge Fn | `gmail-scan` | Scans Gmail for application responses, interview invites, rejections. Every 6 hours. |
| 22 | `purge-old-signals` | `0 4 * * 0` | SQL | DELETE | Purges email_signals older than 90 days. Sundays 4 AM. |
| 24 | `purge-old-email-signals` | `0 3 * * 0` | SQL | DELETE | Duplicate purge (same table, 90-day cutoff). Sundays 3 AM. ⚠️ Redundant with #22. |
| 33 | `decay-signal-patterns` | `0 5 * * 0` | SQL Fn | `decay_signal_patterns()` | Time decay on email signal pattern weights. Weekly Sundays. |
| 68 | `extension-heartbeat-check` | `0 */6 * * *` | Edge Fn | `extension-heartbeat` | Chrome extension connectivity check. Every 6 hours. |

## 7. SEO, Content & Analytics

| ID | Job Name | Schedule | Type | Target | Description |
|:---|:---|:---|:---|:---|:---|
| 12 | `daily-seo-sync` | `0 6 * * *` | SQL Fn | `trigger_seo_sync()` | SEO sync with Google Search Console. Daily 6 AM. |
| 26 | `seo-cache-refresh` | `0 5 * * *` | SQL Fn | `compute_seo_cache_all()` | Recomputes all SEO page caches. Daily 5 AM. |
| 48 | `refresh-city-stats` | `0 */6 * * *` | Edge Fn | `refresh-city-stats` | Per-city job market stats for SEO landing pages. Every 6 hours. |
| 8 | `job-intelligence` | `0 5 * * *` | Edge Fn | `job-intelligence` | Job market intelligence (trends, salary, demand). Daily 5 AM. |
| 35 | `detect-editorial-insights` | `0 3 * * *` | Edge Fn | `detect-editorial-insights` | Detects trending topics for editorial content. Daily 3 AM. |
| 36 | `generate-editorial-content` | `30 3 * * *` | Edge Fn | `generate-editorial-content` | Generates editorial/blog content from insights. Daily 3:30 AM. |
| 70 | `trend-anomaly-detector` | `0 6 * * *` | Edge Fn | `trend-anomaly-detector` | Detects anomalies in job market trends. Daily 6 AM. |
| 38 | `ingest-economic-data` | `30 1 * * *` | Edge Fn | `ingest-economic-data` | Ingests BLS, FRED, BEA, Census data. Daily 1:30 AM. |
| 40 | `compute-correlations-weekly` | `0 4 * * 0` | SQL Fn | `compute_correlations()` | Economic-to-job-market correlations. Weekly Sundays. |

## 8. Surveys & Feedback

| ID | Job Name | Schedule | Type | Target | Description |
|:---|:---|:---|:---|:---|:---|
| 27 | `nps-pulse-monthly` | `0 15 1 * *` | Edge Fn | `nps-pulse` | Monthly NPS survey. 1st of month 3 PM UTC. |
| 28 | `periodic-survey-pulse` | `0 15 15 * *` | Edge Fn | `periodic-survey-pulse` | Mid-month product survey. 15th at 3 PM UTC. |
| 69 | `monthly-report` | `0 13 1 * *` | Edge Fn | `monthly-report` | Monthly activity report to users. 1st at 1 PM UTC. |
| 71 | `monthly-product-update` | `0 14 1 * *` | Edge Fn | `community-feedback` | Monthly product update/changelog. 1st at 2 PM UTC. |

## 9. Data Maintenance & Infrastructure

| ID | Job Name | Schedule | Type | Target | Description |
|:---|:---|:---|:---|:---|:---|
| 14 | `mv-refresh-reduced` | `0 */2 * * *` | SQL Fn | `refresh_materialized_views()` | Refreshes all materialized views. Every 2 hours. |
| 16 | `weekly-data-hygiene` | `0 3 * * 0` | SQL Fn | `run_data_hygiene()` | Cleans stale data, removes orphans, normalizes fields. Weekly Sundays 3 AM. |
| 17 | `daily-table-backup` | `0 2 * * *` | SQL Fn | `run_daily_backup()` | Backs up critical tables to storage. Daily 2 AM. |
| 18 | `feed-health-snapshot` | `0 6 * * *` | SQL Fn | `snapshot_feed_health()` | Daily feed health metrics (jobs by source, refresh lag, errors). |
| 37 | `capture-daily-snapshots` | `30 2 * * *` | SQL Fn | `capture_daily_snapshots()` | Daily platform snapshots (users, jobs, engagement). 2:30 AM. |
| 32 | `expire-archived-resumes` | `0 3 * * *` | SQL Fn | `expire_archived_resumes()` | Deletes resumes past retention period. Daily 3 AM. |
| 34 | `check-feature-readiness` | `0 2 * * *` | Edge Fn | `check-feature-readiness` | Feature flag readiness for gradual rollouts. Daily 2 AM. |
| 54 | `clearance-quarterly-check` | `0 0 1 1,4,7,10 *` | SQL Fn | `check_clearance_retention()` | Security clearance data retention compliance. Quarterly. |
| 78 | `test-ping-123` | `0 0 31 2 *` | SQL | `SELECT 1` | Dead test job. Feb 31 = never runs. Can be removed. |

---

## Notes

- **Redundancy:** Jobs #22 and #24 both purge `email_signals` older than 90 days on Sundays. Consider removing one.
- **Backfill jobs** (#74, #86) auto-disable via companion checker jobs (#76/#77, #88) once coverage reaches 99%+.
- **Job #78** (`test-ping-123`) is a no-op scheduled for an impossible date. Safe to delete.
- All times are UTC. Daily notification jobs are timed for US morning delivery (1 PM UTC = 8 AM ET).
