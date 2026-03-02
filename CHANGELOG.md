## v6.18 — Pod 2 Session 14: Billing + Payments Notifications (2026-03-01)

### Edge Functions — Updated (1 function)

**stripe-webhook** — Billing notification integration (v2)
- Wired all 9 billing notification types through send-notification pipeline
- subscription_confirm: fires on new subscription + renewal (required transactional)
- credit_purchase_receipt: fires on credit pack purchase + auto-refill (required transactional)
- payment_failed: dunning sequence with 4 escalation steps (update_payment → access_warning → last_chance → downgraded) (required transactional)
- payment_recovered: fires when past_due subscription gets successful payment (required transactional)
- plan_change_confirm: fires on tier upgrade/downgrade with features gained/lost (required transactional)
- subscription_cancelled: fires on cancel_at_period_end or immediate deletion (required transactional)
- invoice_generated: fires on new subscription + renewal invoices with PDF link (required transactional)
- refund_processed: new charge.refunded handler (required transactional)
- Auto-downgrade to free tier after final dunning step (attempt_count >= 4)

### Edge Functions — New (1 function)

**billing-notifications** — Subscription expiring reminders
- Cron-triggered daily at 10:00 AM ET (15:00 UTC)
- 7-day reminder: notifies users whose cancelled subscriptions expire in ~7 days
- 1-day reminder: notifies users whose cancelled subscriptions expire in ~1 day
- Dedup: checks notification_log to prevent duplicate reminders within 24h/12h windows
- subscription_expiring classified as configurable transactional (user can adjust cadence)

### Database — Cron Schedule

**billing-expiring-check** — Daily at 15:00 UTC
- Calls billing-notifications Edge Function to check for expiring subscriptions

### Classification Map (no changes)
- All 9 billing types already correctly classified in send-notification:
  - Required transactional: subscription_confirm, credit_purchase_receipt, payment_failed, payment_recovered, plan_change_confirm, subscription_cancelled, invoice_generated, refund_processed
  - Configurable transactional: subscription_expiring

### Supabase — Deployed
- stripe-webhook Edge Function updated (v2 with notification calls)
- billing-notifications Edge Function deployed
- 1 pg_cron schedule (billing-expiring-check: daily 15:00 UTC)
- 9 notification_templates already seeded (Pod 1 v6.11 delivery)
- 9 admin_notification_config rows already seeded (Pod 1 v6.11 delivery)

### Version Bump
- `js/version.js`: v6.17 → v6.18
- `dashboard.html`: version comment v6.18
- `index.html`: version comment v6.18
- Browser console: `[BJ] Dashboard v6.18 loaded`

### Notification System Progress
- Pod 2 Sessions 1-13: ✅ Complete (v6.01–v6.17)
- Pod 2 Session 14 (Billing/Payments): ✅ Complete (v6.18)
- Pod 2 Session 15: Remaining (Re-engagement/Escalation Chain Hardening)
- Pod 1: ✅ ALL COMPLETE (v6.01–v6.14)

## v6.17 — Pod 2 Session 13: Community, Feedback + Canny Integration (2026-03-01)

### Edge Functions — New (1 function)

**community-feedback** — Community, Feedback + Canny Integration
- Canny webhook handler: maps webhook events to notification types (bug_report_thankyou, bug_resolved, feature_request_thankyou, feature_request_accepted, feature_request_shipped)
- Monthly product update cron (1st of month 9:00 AM ET): sends curated monthly digest to marketing-opted-in users
- Bug bounty entitlement system: auto-grants tiered rewards (minor: 10 credits, major: 50 credits + 7-day Pro trial, critical: 1 month Pro access)
- Dedup: 1h window prevents duplicate notifications for same Canny event
- Calls send-notification for all 6 community notification types

### Edge Functions — Updated (1 function)

**send-notification** — Classification map update
- Added `monthly_product_update` to MARKETING classification (requires marketing opt-in, unsubscribe link)

### Database Schema — New (1 table)

**entitlement_grants** — Bug bounty entitlement tracking
- Columns: user_id, grant_type, source_type, severity (minor/major/critical), credits_granted, trial_days_granted, pro_months_granted, canny_post_id, admin_approved, status (pending/approved/applied/expired/revoked)
- RLS: users see own grants, service role manages all
- Indexes: user_id + status, source_type + source_id

### SQL Seeds

**v6.17-community-feedback-edge-function.sql**
- 1 pg_cron schedule (monthly-product-update: 1st of month 14:00 UTC / 9:00 AM ET)

### Supabase — Deployed
- community-feedback Edge Function deployed
- entitlement_grants table created
- send-notification updated with monthly_product_update in MARKETING classification
- 6 notification_templates already seeded (Pod 1 v6.13 delivery)
- 6 admin_notification_config rows already seeded (Pod 1 v6.13 delivery)

### Version Bump
- `js/version.js`: v6.16 → v6.17
- `dashboard.html`: version comment v6.17
- `index.html`: version comment v6.17
- Browser console: `[BJ] Dashboard v6.17 loaded`

### Notification System Progress
- Pod 2 Sessions 1-12: ✅ Complete (v6.01–v6.16)
- Pod 2 Session 13 (Community/Feedback/Canny): ✅ Complete (v6.17)
- Pod 2 Sessions 14-15: Remaining (Billing + Payments, Re-engagement/Escalation)
- Pod 1: ✅ ALL COMPLETE (v6.01–v6.14)

## v6.16 — Pod 2 Sessions 11-12: Referral System + Marketing/Credit Intelligence (2026-03-01)

### Edge Functions — New (2 functions)

**referral-lifecycle** — Full referral notification lifecycle
- Event handlers: invite_sent, link_clicked, referee_signup, referee_activated, reward_applied
- Cron handlers: nudge_check (daily 10AM ET), expiring_check (daily 9AM ET), periodic_summary (1st of month)
- Milestone detection with configurable thresholds (3/5/10/25/50 referrals)
- Suppression: max 2 nudges per referral, dedup on expiring reward + days_out combos
- Calls send-notification for all 9 referral notification types

**marketing-campaign** — Marketing, upgrade prompts, and credit intelligence
- Admin-triggered campaigns: promo_trial, promo_feature_preview with cohort targeting + marketing opt-in enforcement
- Usage limit detection: usage_upgrade_prompt at 80% free tier threshold, 1/week frequency cap
- Credit intelligence: credit_burn_rate_alert (daily cron), credit_low_balance, credit_exhausted (event-driven)
- Monthly crons: upgrade_roi_summary (60+ day free/starter accounts), credit_cost_comparison (spend > next tier)
- Price lock: 3-email sequence (14/7/1 day before increase), separate marketing subdomain enforcement

### SQL Seeds

**v6.15-referral-notification-system.sql**
- 9 admin_notification_config rows (referral lifecycle types)
- 9 notification_templates rows (referral email templates, white theme, production status)
- 3 pg_cron schedules (nudge check, expiring check, periodic summary)

**v6.16-marketing-credit-intelligence.sql**
- 9 admin_notification_config rows (upgrade/credit/promo types)
- 9 notification_templates rows (marketing/credit templates, white + dark themes)
- 3 pg_cron schedules (ROI summary, credit comparison, credit burn check)

### Supabase — Deployed
- 18 admin_notification_config rows seeded
- 18 notification_templates rows seeded (all production status)
- referral-lifecycle Edge Function deployed
- marketing-campaign Edge Function deployed

### Version Bump
- `js/version.js`: v6.14 → v6.16
- `dashboard.html`: version comment v6.16
- `index.html`: version comment v6.16
- Browser console: `[BJ] Dashboard v6.16 loaded`

### Notification System Progress
- Pod 2 Sessions 1-10: ✅ Complete (v6.01–v6.10)
- Pod 2 Session 11 (Referral System): ✅ Complete (v6.16)
- Pod 2 Session 12 (Marketing/Upgrade/Credit): ✅ Complete (v6.16)
- Pod 2 Sessions 13-15: Remaining (Community/Feedback, Billing, Re-engagement/Escalation)
- Pod 1: ✅ ALL COMPLETE (v6.01–v6.14)

## v6.14 — Pod 1 Session 15: Re-engagement / Escalation Copy Delivery (2026-03-01)

### Email Templates — New (3 functions)

**Re-engagement Sequence (3 templates — White theme, Marketing classification)**
- `reengagement14dEmail`: 14-day inactivity nudge with missed job count, top hiring companies, saved filter context
- `reengagement30dEmail`: 30-day escalation with missed + closed job counts, avg salary range, time-sensitivity framing, urgency callout
- `reengagement60dEmail`: 60-day terminal check-in with 60-day snapshot (matched/closed/new companies/market trend), explicit "last email" messaging

### SQL Seed (sql/v6.14-reengagement-templates.sql)
- 3 notification_templates rows (14d/30d/60d re-engagement variants)
- 3 admin_notification_config rows with sequence frequency caps
- 18 notification_preference_defaults rows (3 types × 3 tiers × 2 regions)
- All marketing classification: US defaults ON, EU defaults OFF (GDPR double opt-in required)
- Suppression: entire sequence stops immediately on any login event

### Pod 1 Product Decisions Delivered
- **Re-engagement escalation ladder**: 14d (gentle nudge + FOMO) → 30d (urgency + closed listings) → 60d (final check-in, explicit terminal)
- **Suppression model**: Any auth session event (login, token refresh) immediately cancels the re-engagement sequence
- **Tone progression**: Warm/helpful at 14d, concerned/data-driven at 30d, respectful/final at 60d — never guilt-tripping
- **Marketing classification**: All 3 variants require unsubscribe link per CAN-SPAM/GDPR
- **Terminal boundary**: 60d is the last re-engagement email — no further automated outreach after this
- **Email-only**: No SMS for re-engagement (per SMS scope decision — re-engagement is "NEVER via SMS")
- **Escalation chain hardening**: Apply-on-notification flow documented for Pod 2 (email → timeout → SMS escalation → missed)

### Version Bump
- `js/version.js`: v6.13 → v6.14
- `dashboard.html`: version comment v6.14
- `index.html`: version comment v6.14
- Browser console: `[BJ] Dashboard v6.14 loaded`

### Changed
- `js/version.js`: v6.13 → v6.14
- `dashboard.html`: version comment v6.14
- `index.html`: version comment v6.14
- `supabase/functions/_shared/email-templates.ts`: +170 lines — 3 new re-engagement template functions
- `sql/v6.14-reengagement-templates.sql`: NEW — template seeds, admin config, preference defaults

### Notification System Progress — COMPLETE
- Sessions 1-10: ✅ Complete (v6.01–v6.10)
- Pod 1 Batch 8 (Referral copy): ✅ Complete (v6.11)
- Pod 1 Batch 9 (Billing copy): ✅ Complete (v6.11)
- Pod 1 Batch 10a (Marketing/Upgrade copy): ✅ Complete (v6.12)
- Pod 1 Batch 10b (Community/Feedback copy): ✅ Complete (v6.13)
- Pod 1 Re-engagement/Escalation copy: ✅ Complete (v6.14) — ALL POD 1 NOTIFICATION WORK DONE
- Pod 2 Sessions 11-14: Ready (unblocked by v6.11–v6.13)
- Pod 2 Session 15: ✅ Now unblocked — final notification system engineering session


## v6.13 — Pod 1 Session: Community & Feedback Copy Delivery (2026-03-01)

### Email Templates — New (6 functions)

**Batch 10b: Community & Feedback (6 templates — White theme)**
- `bugReportThankyouEmail`: Confirmed bug notification with severity badge + tiered reward (10 credits / 50 credits + 7d Pro / 1mo Pro)
- `bugResolvedEmail`: Bug fixed notification with fix summary + release reference
- `featureRequestThankyouEmail`: Feature request acknowledgment with 3-step lifecycle tracker + Canny upvote CTA
- `featureRequestAcceptedEmail`: Roadmap acceptance notification with estimated timeline
- `featureRequestShippedEmail`: Feature shipped celebration with access instructions + changelog link
- `monthlyProductUpdateEmail`: Monthly editorial digest with features shipped, bugs fixed, platform stats, roadmap preview

### SQL Seed (sql/v6.13-community-feedback-templates.sql)
- 6 notification_templates rows (5 community lifecycle + 1 monthly editorial)
- 6 admin_notification_config rows with Canny webhook descriptions
- 36 notification_preference_defaults rows (6 types × 3 tiers × 2 regions)
- Bug/feature lifecycle: Product classification — all tiers/regions default ON
- monthly_product_update: Marketing classification — US defaults ON, EU defaults OFF (GDPR)

### Pod 1 Product Decisions Delivered
- **Bug bounty reward tiers**: Minor = 10 credits (auto-grant), Major = 50 credits + 7d Pro (auto-grant), Critical = 1mo Pro (manual admin grant)
- **Feature request lifecycle**: 3-stage tracking (submitted → accepted → shipped) with Canny integration
- **Monthly product update**: Marketing classification, monthly frequency cap, unsubscribe required, editorial curated via admin console
- **Canny integration pattern**: All community templates reference Canny board URLs for cross-platform tracking
- **Community tone**: Celebratory on shipped features, transparent on timelines, grateful for bug reports

### Version Bump
- `js/version.js`: v6.12 → v6.13
- `dashboard.html`: version comment v6.13
- `index.html`: version comment v6.13
- Browser console: `[BJ] Dashboard v6.13 loaded`

### Changed
- `js/version.js`: v6.12 → v6.13
- `dashboard.html`: version comment v6.13
- `index.html`: version comment v6.13
- `supabase/functions/_shared/email-templates.ts`: +297 lines — 6 new template functions
- `sql/v6.13-community-feedback-templates.sql`: NEW — template seeds, admin config, preference defaults

### Notification System Progress
- Sessions 1-10: ✅ Complete (v6.01–v6.10)
- Pod 1 Batch 8 (Referral copy): ✅ Complete (v6.11)
- Pod 1 Batch 9 (Billing copy): ✅ Complete (v6.11)
- Pod 1 Batch 10a (Marketing/Upgrade copy): ✅ Complete (v6.12)
- Pod 1 Batch 10b (Community/Feedback copy): ✅ Complete — unblocks Pod 2 Session 13
- Sessions 11-15: Partially unblocked (11 + 12 + 13 + 14 ready, 15 pending Pod 1 re-engagement copy)


## v6.12 — Pod 1 Session: Marketing / Upgrade / Promotional Copy Delivery (2026-03-01)

### Email Templates — New (5 functions)

**Batch 10a: Marketing/Upgrade (3 templates — White theme, Marketing classification)**
- `usageUpgradePromptEmail`: Plan limit warning with feature breakdown + upgrade CTA
- `creditBurnRateAlertEmail`: Credit burn rate intelligence with projected exhaust date + urgency badges
- `priceLockWarningEmail`: 3-variant price lock sequence (14d info → 7d warning → 1d urgency) with savings math

**Batch 10a: Promotional (2 templates — White theme, Marketing classification)**
- `promoTrialEmail`: Trial offer with feature list, configurable duration, no-card-required messaging
- `promoFeaturePreviewEmail`: Early access feature preview with time-limited access + permanent upgrade CTA

### SQL Seed (sql/v6.12-marketing-upgrade-templates.sql)
- 5 notification_templates rows (3 upgrade + 2 promotional)
- 5 admin_notification_config rows with frequency caps and classification
- 30 notification_preference_defaults rows (5 types × 3 tiers × 2 regions)
- All marketing classification: US defaults ON, EU defaults OFF (GDPR double opt-in required)
- Pro tier excluded from usage_upgrade_prompt (already on highest tier)
- Free tier excluded from credit_burn_rate_alert (no credits on free)

### Pod 1 Product Decisions Delivered
- **Upgrade messaging tone**: Helpful, not pushy — show value gap, not paywall
- **Price lock sequence**: 3 escalating variants with increasing urgency (blue info → yellow warning → red urgency)
- **Promo trial terms**: No credit card required, auto-expires, configurable duration per cohort
- **Feature preview access**: Time-limited, converts to permanent with upgrade
- **Marketing unsubscribe**: Every marketing email includes unsubscribe link per CAN-SPAM/GDPR
- **Frequency caps**: Weekly for upgrade prompts, monthly for promos, 3/month for price lock sequences

### Version Bump
- `js/version.js`: v6.11 → v6.12
- `dashboard.html`: version comment v6.12
- `index.html`: version comment v6.12
- Browser console: `[BJ] Dashboard v6.12 loaded`

### Changed
- `js/version.js`: v6.11 → v6.12
- `dashboard.html`: version comment v6.12
- `index.html`: version comment v6.12
- `supabase/functions/_shared/email-templates.ts`: +296 lines — 5 new template functions
- `sql/v6.12-marketing-upgrade-templates.sql`: NEW — template seeds, admin config, preference defaults

### Notification System Progress
- Sessions 1-10: ✅ Complete (v6.01–v6.10)
- Pod 1 Batch 8 (Referral copy): ✅ Complete (v6.11)
- Pod 1 Batch 9 (Billing copy): ✅ Complete (v6.11)
- Pod 1 Batch 10a (Marketing/Upgrade copy): ✅ Complete — unblocks Pod 2 Session 12
- Sessions 11-15: Partially unblocked (11 + 12 + 14 ready, 13/15 pending Pod 1 batches)


## v6.11 — Pod 1 Session: Billing + Referral Copy Delivery (2026-03-01)

### Email Templates — New (17 functions)

**Batch 8: Referral (9 templates — White theme, Product classification)**
- `referralInviteEmail`: Shareable link with dual-reward presentation (referrer + referee)
- `referralSentConfirmationEmail`: Invite sent confirmation with tracking stats
- `referralStatusUpdateEmail`: Status badges (clicked → signed up → activated) with progress
- `referralNudgeRefereeEmail`: Marketing email to referee with value prop + reward offer
- `referralConversionEmail`: Reward earned notification with lifetime earnings
- `referralRewardEarnedEmail`: Credit/trial applied confirmation with balance update
- `referralExpiringRewardEmail`: Expiry countdown with usage summary
- `referralMilestoneEmail`: Milestone celebration (3/5/10/25) with leaderboard position
- `referralPeriodicSummaryEmail`: Monthly funnel recap (sent → clicked → signed up → activated)

**Batch 9: Billing (8 templates — White theme, Required Transactional)**
- `subscriptionConfirmEmail`: New sub + renewal variants, receipt detail, quickstart CTA
- `creditPurchaseReceiptEmail`: Credit purchase receipt with balance and per-credit cost
- `paymentFailedEmail`: 4-stage dunning escalation (friendly → concerned → urgent → final)
- `paymentRecoveredEmail`: Payment recovered confirmation with account status
- `planChangeConfirmEmail`: Upgrade/downgrade with features gained/lost breakdown
- `subscriptionCancelledEmail`: Cancellation with win-back discount offer + exit survey
- `invoiceGeneratedEmail`: Itemized invoice with line items and PDF download
- `refundProcessedEmail`: Refund confirmation with timeline and amount

### SQL Seed (sql/v6.11-billing-referral-templates.sql)
- 17 notification_templates rows (9 referral + 8 billing)
- 17 admin_notification_config rows with frequency caps and classification
- 54 notification_preference_defaults rows (9 referral types × 3 tiers × 2 regions)
- Billing templates: required_transactional (bypass user preferences, ALWAYS ON)
- Referral nudge_referee: marketing classification (EU defaults OFF per GDPR)

### Pod 1 Product Decisions Delivered
- **Referral reward structure**: Referrer gets 50 credits on conversion, referee gets 7-day Pro trial
- **Milestone thresholds**: 3/5/10/25 referrals with escalating bonus rewards
- **Reward expiry**: Time-limited rewards with 7-day and 1-day expiry warnings
- **Dunning sequence**: 4-attempt escalation (Day 1 friendly → Day 3 warning → Day 7 urgent → Day 14 final)
- **Win-back discount**: Offered post-cancellation with 14-day reactivation window
- **Notification preference defaults**: Full tier × region matrix for all 17 new types

### Version Bump
- `js/version.js`: v6.10 → v6.11
- `dashboard.html`: version comment v6.11
- `index.html`: version comment v6.11
- Browser console: `[BJ] Dashboard v6.11 loaded`

### Changed
- `js/version.js`: v6.10 → v6.11
- `dashboard.html`: version comment v6.11
- `index.html`: version comment v6.11
- `supabase/functions/_shared/email-templates.ts`: +709 lines — 17 new template functions
- `sql/v6.11-billing-referral-templates.sql`: NEW — template seeds, admin config, preference defaults

### Notification System Progress
- Sessions 1-10: ✅ Complete (v6.01–v6.10)
- Pod 1 Batch 8 (Referral copy): ✅ Complete — unblocks Pod 2 Session 11
- Pod 1 Batch 9 (Billing copy): ✅ Complete — unblocks Pod 2 Session 14
- Sessions 11-15: Partially unblocked (11 + 14 ready, 12/13/15 pending Pod 1 batches)


## v6.10 — Session 10: Data Aggregation Edge Functions + Pipeline Verification (2026-03-01)

### Edge Functions — Extended
- **`weekly-summary` (EXTENDED)**: Now sends 4 emails per user on Monday mornings: weekly summary (existing), market pulse (new jobs, remote %, board count, top hiring companies), filter trends (per-filter job counts, median salary, WoW delta), and ghost report weekly (ghosted apps, worst wait, resolved count, market benchmark). Wall-time safety at 110s. Dedup via notification_channels.
  
### Edge Functions — New
- **`monthly-report` (NEW)**: Runs 1st of month via pg_cron. Sends 5 emails per user: monthly pipeline report (MoM comparison, response rate, interview conversion, ghost rate, top responders), pipeline benchmark (user vs community percentiles), upgrade ROI summary (free=missed opportunities, pro=value delivered), credit cost comparison (usage breakdown, plan comparison, projections), rewrite batch summary (per-batch score results).
- **`trend-anomaly-detector` (NEW)**: Runs daily at 6am UTC via pg_cron. Compares current week job volume per saved filter against 4-week rolling average. Fires trend_anomaly notification if deviation >25%. Dedup: max 1 anomaly per filter per week. Minimum baseline of 5 jobs to avoid noise.

### Database Migration (sql/v6.10-data-aggregation-crons.sql)
- **saved_filters table**: user_id, name, config (jsonb). RLS: users manage own. Used by filter trends + anomaly detector.
- **credit_transactions table**: user_id, feature, credits_used, metadata. RLS: users read own. Used by credit cost comparison.
- **resume_rewrites table**: user_id, batch_id, filter_name, scores, status. RLS: users read own. Used by rewrite batch summary.
- **profiles.credits_remaining**: New column (int, default 0). Used by credit report.
- **pg_cron: monthly-report**: `0 13 1 * *` (1st of month, 8am ET / 1pm UTC).
- **pg_cron: trend-anomaly-detector**: `0 6 * * *` (daily 6am UTC).
- **notification_templates**: 9 new types seeded (monthly_pipeline_report, pipeline_benchmark, market_stats, trend_anomaly, filter_trend, ghost_report, upgrade_roi_summary, credit_cost_comparison, rewrite_batch_summary).
- **admin_notification_config**: 9 new types with 50/50 A/B weights.

### Version Bump
- `js/version.js`: v6.09 → v6.10
- `dashboard.html`: version comment v6.10
- `index.html`: version comment v6.10
- Browser console: `[BJ] Dashboard v6.10 loaded`

### Changed
- `js/version.js`: v6.09 → v6.10
- `dashboard.html`: version comment v6.10
- `index.html`: version comment v6.10
- `supabase/functions/weekly-summary/index.ts`: +250 lines — market pulse, filter trends, ghost report aggregation
- `supabase/functions/monthly-report/index.ts`: NEW — 450 lines — pipeline report, benchmark, ROI, credits, rewrites
- `supabase/functions/trend-anomaly-detector/index.ts`: NEW — 230 lines — 4-week rolling avg anomaly detection
- `sql/v6.10-data-aggregation-crons.sql`: NEW — tables, pg_cron, template seeds

### Notification System Progress
- Sessions 1-9: ✅ Complete (v6.01–v6.09+)
- Session 10 (Data Aggregation EFs): ✅ Complete — all 10 Batch 6 templates now have data feeds
- Sessions 11-15: Pending Pod 1 Batches 7-10


## v6.09 — Stats Charts: Compare Mode + ATS Source Breakdown (2026-03-01)

### Stats Page — Compare Mode
- **Compare toggle enabled**: Select dropdown switches between Aggregate (union of all selected filters) and Compare (dual-series side-by-side). Previously disabled with "coming soon" label.
- **Dual-series charts**: When Compare mode is active with exactly 2 filters selected, Timeline, Salary Distribution, Work Arrangement, and Top Companies charts render two color-coded series with legend. Filter colors match the saved filter palette.
- **Compare stat cards**: Summary cards show "X vs Y" format (e.g., "1,234 vs 567" for job counts).
- **Validation**: Shows warning if fewer or more than 2 individual filters are selected, or if "All" is selected in compare mode.

### Stats Page — New Charts
- **ATS Source Breakdown (donut)**: New chart showing job distribution across Greenhouse, Lever, Ashby, Workable, Recruitee, USAJobs. Color-coded per platform.
- **Industry Detail (horizontal bars)**: Dedicated industry breakdown chart (`#chart-industry`). Renders top 10 industries with coverage threshold check. Previously existed as function but was not wired to a container.
- **Industry Treemap relabeled**: Existing treemap chart on `#chart-companies` now properly labeled as "Jobs by Industry" (was already rendering industry data).

### Data Layer
- **sourceCounts aggregation**: Added `ats_source` counting to `aggregateStats()` function. Feeds the new ATS Source donut chart.
- **Compare data fetching**: New `fetchAndRenderCompare()` function fetches both filters independently, aggregates separately, and passes paired stats to compare renderers.

### Version Bump
- `js/version.js`: v6.08 → v6.09
- `dashboard.html`: version comment v6.09
- `index.html`: version comment v6.09
- Browser console: `[BJ] Dashboard v6.09 loaded`

### Changed
- `js/version.js`: v6.08 → v6.09
- `js/stats.js`: +130 lines — compare mode state, toggle init, compare renderers (5 functions), ATS source chart, wired industry bars
- `dashboard.html`: version comment v6.09, compare toggle enabled, ATS Source + Industry Detail chart containers added, compare warning div
- `index.html`: version comment v6.09

### Notification System Progress
- Sessions 1-7: ✅ Complete (v6.01–v6.08)
- Session 8 (Stats, Trends + Market Intel): Pending Pod 1 Batch 6 copy
- v6.09: Unblocked stats chart work (compare mode + ATS source) shipped while Session 8 blocked


## v6.08 — Session 7: Extension Notifications + Heartbeat Monitoring (2026-03-01)

### Database Migration
- **extension_heartbeats table**: New table tracking Chrome extension connectivity per user. Columns: user_id (PK), extension_id, extension_version, last_heartbeat_at, status (active/silent/disconnected), silent_since, disconnect_notified_at. RLS: users read/update own row, service role for cron operations.
- **Indexes**: status + last_heartbeat_at for efficient cron scans.
- **pg_cron**: `extension-heartbeat-check` runs every 6 hours — scans for silent extensions past configurable threshold (default 7 days), sends disconnect notification via send-notification.

### Edge Functions
- **`extension-heartbeat` (NEW)**: Dual-mode endpoint. Mode 1 (user JWT): Chrome extension pings every 4 hours with version info, upserts heartbeat row, resets status to active. Mode 2 (cron): Scans for overdue heartbeats, marks active→silent→disconnected, dispatches extension_disconnected notifications through send-notification.

### Email Templates
- **extension_update**: White theme. Changelog summary with breaking changes conditional block. Subject A/B: "Brilliant Jobs Extension — New Update Available" / "🔧 Your Extension Just Got Better". Admin-triggered per release.
- **extension_disconnected**: White theme. Troubleshooting steps (enable, reconnect, reinstall). Subject A/B: "Your Brilliant Jobs Extension Needs Attention" / "We Haven't Heard from Your Extension in {{days_silent}} Days". Auto-triggered by heartbeat cron, once per disconnect event.

### Chrome Extension
- **Heartbeat alarm**: New `heartbeat` alarm fires every 4 hours in background.js. Calls extension-heartbeat Edge Function with extension_id and version from manifest. Fire-and-forget (non-blocking).
- **Startup/install ping**: Immediate heartbeat sent on chrome.runtime.onInstalled and onStartup events.

### Version Bump
- `js/version.js`: v6.07 → v6.08
- `dashboard.html`: version comment v6.08
- `index.html`: version comment v6.08
- Browser console: `[BJ] Dashboard v6.08 loaded`
- Git tag: v6.08

### Changed
- `js/version.js`: v6.07 → v6.08
- `dashboard.html`: version comment v6.08
- `index.html`: version comment v6.08
- `extension/background.js`: +50 lines — heartbeat function, alarm setup, startup/install triggers
- `sql/v6.08-extension-heartbeats.sql`: NEW — table + RLS + templates + admin config + pg_cron
- `supabase/functions/extension-heartbeat/index.ts`: NEW — heartbeat endpoint + cron check logic

### Notification System Progress
- Sessions 1-7: ✅ Complete (v6.01–v6.08)
- Session 8 (Stats, Trends + Market Intel): Pending Pod 1 Batch 6 copy


## v6.07 — Session 6 (cont'd): Interview Cron Jobs + Rewrite Callback (2026-03-01)

### pg_cron: Interview Reminder Schedules
- **interview-reminder-24h**: pg_cron every 15 minutes. Queries `user_pipeline` for entries where stage='interview' and interview_date within 24h window (but >1h away). Calls `interview-sequence` Edge Function with type `interview_reminder_24h`. Dedup via `notification_log` metadata dedup_key matching pipeline_entry_id. Respects quiet hours (10pm-7am user timezone).
- **interview-reminder-1h**: pg_cron every 10 minutes. Queries `user_pipeline` for entries where stage='interview' and interview_date within 1h window. Calls `interview-sequence` Edge Function with type `interview_reminder_1h`. Dedup via `notification_log`. **Overrides quiet hours by design** — users always get the 1h reminder.
- Both crons use `net.http_post` to invoke the Edge Function server-side with service role auth.
- Rollback SQL included in migration file.

### Rewrite-Resume-Execute → Interview-Sequence Callback
- **`rewrite-resume-execute` wired to `interview-sequence`**: After persisting completed rewrite results, fires a non-blocking POST to `interview-sequence` with type `resume_rewrite_ready`. Passes companyName, jobTitle, originalScore, newScore, keywordsAdded count, sectionsChanged count, rewriteJobId (for dedup).
- Fire-and-forget pattern: notification failure does not block the rewrite response. Errors logged with `[execute]` prefix.

### Version Bump
- `js/version.js`: v6.06 → v6.07
- `dashboard.html`: version comment v6.07
- `index.html`: version comment v6.07
- Browser console: `[BJ] Dashboard v6.07 loaded`

### Changed
- `js/version.js`: v6.06 → v6.07
- `dashboard.html`: version comment v6.07
- `index.html`: version comment v6.07
- `supabase/functions/rewrite-resume-execute/index.ts`: +30 lines — resume_rewrite_ready notification callback
- `sql/v6.07-interview-reminder-crons.sql`: NEW — pg_cron migration for 24h + 1h interview reminders


## v6.06 — Session 6: Interview Reminders + Resume Rewrite Templates (2026-03-01)

### Pod 1 Batch 4 Copy — Delivered & Consumed
- **4 interview/rewrite email templates delivered**: interview_scheduled (white theme, full prep checklist), interview_reminder_24h (last-minute prep with active listings context), interview_reminder_1h (quick reference with strengths/gaps), resume_rewrite_ready (score diff + keyword/section stats).
- Templates use white theme (`whiteBaseLayout`) matching existing design system. Interview templates include SMS copy.

### Edge Functions
- **`interview-sequence` Edge Function (NEW)**: Handles 4 notification types routed through a single function. Accepts type discriminator (interview_scheduled, interview_reminder_24h, interview_reminder_1h, resume_rewrite_ready). Server-side suppression: dedup on pipeline_entry_id+type via notification_log, email preference check, quiet hours (1h reminder overrides quiet hours by design). Routes all sends through send-notification.

### Email Templates
- `supabase/functions/_shared/email-templates.ts`: Added `interviewScheduledWhiteEmail()`, `interviewReminder24hEmail()`, `interviewReminder1hEmail()`, `resumeRewriteReadyEmail()` — 4 exported functions following Batch 1-3 white theme pattern. Each template personalizes on user first name, company, job title, interview details, match score, and context-specific data (active listings, strengths/gaps, score diffs).

### Cron Jobs (Pending v6.07)
- **interview-reminder-24h**: pg_cron every 15min, queries interviews in 24h window not yet notified.
- **interview-reminder-1h**: pg_cron every 10min, queries interviews in 1h window not yet notified.
- Both use dedup pattern from escalation-checker: write notification_log on send, skip if entry exists.

### Database
- notification_channels seed: Default rows for interview_scheduled, interview_reminder_24h, interview_reminder_1h, resume_rewrite_ready (email=true, sms=true for interview types, sms=false for rewrite).

### Changed
- `js/version.js`: v6.05 → v6.06, session 6 template deployment
- `supabase/functions/_shared/email-templates.ts`: +interviewScheduledWhiteEmail, +interviewReminder24hEmail, +interviewReminder1hEmail, +resumeRewriteReadyEmail
- `supabase/functions/interview-sequence/index.ts`: NEW — Interview & rewrite notification Edge Function
- `dashboard.html`: version comment v6.06
- `index.html`: version comment v6.06

## v6.05 — Session 5: CV Score Notification Flow (2026-03-01)

### Pod 1 Batch 3 Copy — Delivered & Consumed
- **3 CV score email templates delivered**: score_high_match (≥80%), score_medium_match (50-79%), score_low_match (<50%). Each template personalizes on user first name, score value, job title, company name, and tier-specific recommendations.
- Templates use white theme (`whiteBaseLayout`) matching onboarding/adoption email design system.

### Edge Functions
- **`score-sequence` Edge Function (NEW)**: Event-driven CV score notification flow. Receives userId, jobId, score, and analysisSummary from the client-side scoring pipeline. Determines tier (high/medium/low), renders the appropriate email template, and routes through send-notification. Server-side suppression: max 3 score emails per user per 24 hours, dedup on job+user combo via notification_log, respects email preference toggles and quiet hours.
- **`email-templates.ts` updated**: Added `scoreHighMatchEmail()`, `scoreMediumMatchEmail()`, `scoreLowMatchEmail()` — 3 exported functions following existing Batch 1-2 pattern. Strengths list for high matches, gap analysis for medium, missing skills + better match count for low.

### Frontend — Score Notification Integration
- **`js/version.js`**: v6.04 → v6.05. Added `window.triggerScoreNotification()` global function — fires POST to score-sequence Edge Function with userId, jobId, score, analysisSummary, jobTitle, companyName. Silent failure with console logging.
- **`js/keywords.js`**: After `runReadinessAnalysis()` completes and caches results, fires `triggerScoreNotification()` for each scored resume. Extracts job context from jdCache and analysis data from filter scores. Async/non-blocking — does not delay scoring UI.

### Database
- **notification_channels seed**: Default rows for score_high_match, score_medium_match, score_low_match (email=true, sms=false, frequency=realtime). No new tables required — existing notification_log handles dedup and daily count queries.

### Suppression Rules (Server-Side)
- Max 3 score emails per user per 24-hour window
- Skip if user has email disabled for score_* types in notification_channels
- Skip if same job+user combination already received a score email (dedup via notification_log)
- Quiet hours respected via send-notification passthrough

### Changed
- `js/version.js`: v6.04 → v6.05, +triggerScoreNotification() global function
- `js/keywords.js`: +score notification trigger after readiness analysis
- `supabase/functions/_shared/email-templates.ts`: +scoreHighMatchEmail, +scoreMediumMatchEmail, +scoreLowMatchEmail
- `supabase/functions/score-sequence/index.ts`: NEW — CV score notification Edge Function
- `dashboard.html`: version comment v6.05
- `index.html`: version comment v6.05
- `CHANGELOG.md`: +v6.05 entry

## v6.04 — Milestone Detection Hooks + Sessions 3-4 Live Activation (2026-03-01)

### Frontend — Milestone Hooks
- **`markOnboardingMilestone()` global function** in version.js: Updates `onboarding_milestones` table in real-time when user completes resume upload, filter creation, or extension connect. Suppresses future nudge emails immediately.
- **`markIntegrationConnected()` global function** in version.js: Updates `integration_adoption_state` table when user connects Gmail, Calendar, Drive, or Extension. Auto-suppresses adoption nudges for that integration.
- **resumes.js hook**: Calls `markOnboardingMilestone('resume')` after successful `resume_archive` insert.
- **app.js hooks**: Calls `markOnboardingMilestone('filter')` after `createFilterFromProfile()`. Calls `markIntegrationConnected('gmail')` on Gmail OAuth redirect success.
- **applications.js hook**: Calls `markIntegrationConnected('gmail')` when Gmail connection status detected as active.

### Edge Functions — Live Activation
- **onboarding-sequence v2**: Now imports and renders production email templates (`onboardWelcomeEmail`, `onboardResumeNudgeEmail`, `onboardFilterNudgeEmail`, `onboardExtensionNudgeEmail`) and passes rendered subject+html to send-notification. Previously relied on DB template resolution which had no entries. Also fetches user's `full_name` for personalized greeting.
- **gmail-auth update**: Now updates `profiles.gmail_connected_at` on successful Gmail OAuth, enabling adoption-sequence auto-suppress detection.

### Changed
- `js/version.js`: v6.03 → v6.04, +milestone hooks (+60 lines)
- `js/resumes.js`: +milestone hook after resume insert
- `js/app.js`: +milestone hook after filter creation, +Gmail connected hook
- `js/applications.js`: +Gmail integration connected hook
- `supabase/functions/onboarding-sequence/index.ts`: v2 — imports email-templates, renders production HTML, passes to send-notification
- `supabase/functions/gmail-auth/index.ts`: +profiles.gmail_connected_at update
- `dashboard.html`: version comment + cache-bust v6.04
- `index.html`: version comment v6.04

## v6.03 — Session 4: Integration Adoption System (2026-03-01)

### Database
- **`integration_adoption_state` table created**: Tracks per-user, per-integration nudge state. Columns for extension, Gmail, Calendar, Drive, and combo recap. Includes nudge counts, sent timestamps, connected timestamps, and permanent suppress flags. RLS policies for user self-read/update and service role full access.
- **Profile columns added**: `gmail_connected_at`, `calendar_connected_at`, `drive_connected_at` on profiles table for integration connection tracking.

### Edge Functions
- **`adoption-sequence` Edge Function**: Cron-triggered (hourly at :30). Processes all users who completed onboarding. Per-integration nudge logic with 7-day cooldown, max 3 nudges per integration, auto-suppress on connect, global suppress when all connected. Combo recap email at 30-day mark. Sends rendered templates via send-notification with subject+html passthrough.

### Infrastructure
- **pg_cron: onboarding-sequence**: Hourly schedule (`0 * * * *`) wired via `net.http_post` to Edge Function.
- **pg_cron: adoption-sequence**: Hourly at :30 (`30 * * * *`) wired via `net.http_post` to Edge Function.

### Changed
- `js/version.js`: v6.02 → v6.03
- `dashboard.html`: version comment + cache-bust parameters updated
- `index.html`: version comment updated
- `CHANGELOG.md`: +v6.03 entry

## v6.02 — Pod 1 Batch 1-2 Copy Delivery + White Theme Approval (2026-03-01)

### Pod 1 Deliverables (Copy & Design)
- **Batch 1 copy delivered (4 onboarding templates)**: Production subject lines and body copy injected into `onboardWelcomeEmail()`, `onboardResumeNudgeEmail()`, `onboardFilterNudgeEmail()`, `onboardExtensionNudgeEmail()`. All [POD1_COPY] markers removed. Copy follows Fiorelli AI Content Framework — persona-aligned for mid-to-senior professionals (28-45), scannable structure, benefit-first messaging, clear single CTA per email.
- **Batch 2 copy delivered (5 integration adoption templates)**: Production copy injected into `adoptExtensionReminderEmail()`, `adoptGmailEmail()`, `adoptCalendarEmail()`, `adoptDriveEmail()`, `adoptIntegrationComboEmail()`. Privacy-forward messaging for Gmail/Calendar. Context-sensitive copy with dynamic variable support.
- **White theme design approved**: `whiteBaseLayout()` reviewed and approved — light background (#f8fafc), white cards with subtle shadows, blue accent buttons (#3b82f6), step indicators, highlight blocks. Brand-consistent. Ready for all onboarding and integration adoption emails.

### Copy Strategy Notes
- Subject lines optimized for inbox preview: benefit-first, under 60 characters where possible, no clickbait.
- Onboarding sequence: progressive value disclosure — each email introduces one action with clear rationale, not a feature dump.
- Integration adoption: trigger-contextual — Gmail email mentions active pipeline, Calendar mentions interviews, Drive mentions uploaded resume. Extension reminder supports dynamic context injection.
- Integration combo (30-day recap): warning amber indicators for missing integrations replace neutral gray dashes — creates appropriate urgency without guilt-tripping.
- Division of zero guard added to `adoptIntegrationComboEmail()` for edge case where both arrays are empty.

### Changed
- `_shared/email-templates.ts`: 10 template functions updated from placeholder to production copy. All [POD1_COPY] markers removed. Header comments updated to reflect production status.
- Version bump to v6.02 across version.js, dashboard.html (comment + cache-bust), index.html (comment), CHANGELOG.md.

### Unblocked
- **Pod 2 Session 3**: Onboarding sequence can go fully live — Edge Function skeleton already deployed (v6.01), now has production templates.
- **Pod 2 Session 4**: Integration adoption system can proceed — template copy is ready, Pod 2 builds `integration_adoption_state` table + adoption Edge Function + frequency caps.
- **Sessions 3-4 combined activation**: Pod 2 can turn both sessions from skeleton to live in a single session.

### Infrastructure
- All version increments follow VERSION_METHODOLOGY.docx in the repository.

## v6.01 — Onboarding Sequence Skeleton + White Theme Templates (2026-03-01)

### Added
- **onboarding-sequence Edge Function**: Session 3 skeleton — 4-email drip sequence triggered by signup milestones (welcome → resume nudge at 24h → filter nudge at 48h → extension nudge at 72h). Each email suppresses if user has already completed the action. Cron mode processes all incomplete users; direct mode for single user. Respects admin config per cohort, double opt-in gating, and one-email-per-run-per-user pacing.
- **onboarding_milestones table**: Tracks per-user onboarding email sent/completed state with auto-complete trigger (sequence_completed flips true when all three milestones hit). RLS policies, partial index for cron efficiency. Existing users seeded as complete.
- **White theme email base layout**: `whiteBaseLayout()` in `_shared/email-templates.ts` — light background (#f8fafc), white cards, blue accents, step indicators, highlight blocks. Used by onboarding and integration adoption emails.
- **Onboarding email templates (4)**: `onboardWelcomeEmail()`, `onboardResumeNudgeEmail()`, `onboardFilterNudgeEmail()`, `onboardExtensionNudgeEmail()` — white theme, placeholder content marked with [POD1_COPY] for Pod 1 copy injection.
- **Integration adoption email templates (6)**: `adoptExtensionReminderEmail()`, `adoptGmailEmail()`, `adoptCalendarEmail()`, `adoptDriveEmail()`, `adoptIntegrationComboEmail()` — white theme, placeholder content for Pod 1.
- **Migration file**: `v6.01-onboarding-milestones.sql` committed to `supabase/migrations/`.

### Infrastructure
- Email templates file expanded from 42KB to ~52KB with white theme additions.
- Version bump to v6.01 across version.js, dashboard.html (comment + cache-bust), index.html (comment), CHANGELOG.md.
- All version increments follow VERSION_METHODOLOGY.docx in the repository.

### Pod 1 Blockers (unchanged)
- Sessions 3-15 still blocked on Pod 1 copy deliverables.
- Edge Function skeletons and suppression logic built with placeholder templates per session plan workaround.
- Template content injection is the last step — Pod 1 delivers copy, Pod 2 swaps placeholders.

## v6.00 — Notification Log Wiring + Branch Sync (2026-03-01)

### Added
- **Notification log loading**: `ncLoadNotificationLog()` queries `notification_log` table via Supabase client with RLS (users see own rows). Renders timestamped entries with type labels, channel icons (✉️/💬/🔔), status colors (green=sent/delivered, red=failed, yellow=held), and company/job context.
- **Notification log filtering**: Type, channel, and status dropdowns on standalone Notification Center page now filter live queries. Filters compose (AND logic) and reset pagination to page 1 on change.
- **Notification log pagination**: 20 rows per page with Prev/Next controls and "Page X of Y (N total)" display. Uses Supabase `.range()` for efficient server-side pagination.
- **CSV export**: Export button downloads current filtered log page as `notification-log-YYYY-MM-DD.csv` with headers: Timestamp, Type, Channel, Status, Company/Job, Subject, Classification, Decision. Client-side Blob generation.

### Changed
- notification-center.js version header updated to v6.00.
- Console log version updated to v6.00.
- Standalone page log filters wired to `ncLoadNotificationLog()` instead of placeholder console.log stubs.
- CSV export button wired to `ncExportLogCSV()` instead of placeholder toast.
- Initial log load triggered on DOMContentLoaded when standalone page detected.

### Infrastructure
- **Branch sync**: dev and staging branches fast-forwarded to main HEAD (v5.99 → v6.00). All three branches now in sync.
- Version bump to v6.00 across version.js, dashboard.html (comment + cache-bust), index.html (comment), notification-center.js, CHANGELOG.md.
- All version increments follow VERSION_METHODOLOGY.docx in the repository.

## v5.99 — Standalone Notification Center Page (2026-03-01)

### Added
- **Standalone Notification Center page**: Moved notification preferences from Applications tab to dedicated page at `/notifications` nav route. Full-page layout with all notification management sections (preferences matrix, phone verification, escalation rules, filter overrides, notification log).
- **New nav item**: "Notifications" bell icon added to Tracking section in sidebar navigation, positioned after Applications and before Intelligence.
- **Email confirmation banner**: Conditional banner on standalone page for unverified users with resend confirmation button.
- **Applications tab redirect**: "Notifications ↗" tab in Applications now redirects to standalone Notification Center page with visual redirect prompt (bell icon, "Notification Center has moved" message, redirect button).

### Changed
- notification-center.js updated for standalone page: `initNotificationCenter()` now wires email banner (`nc-email-banner`), resend button (`nc-resend-confirm-btn`), standalone save button, log filters, and CSV export on the new page.
- All Notification Log IDs prefixed with `nc-` on standalone page to avoid conflicts (e.g., `nc-notif-log-body`, `nc-nlog-filter-type`).
- DOMContentLoaded hook now binds event listeners for both Applications panel and standalone page elements.
- Version bump to v5.99 across version.js, dashboard.html, index.html, notification-center.js.
- Cache-bust params updated to `?v=5.99`.

### Removed
- 367 lines of notification panel content removed from Applications tab (replaced with redirect message).

## v5.98 — Marketing DNS + Required Transactional Lock Icons (2026-03-01)

### Added
- **Marketing subdomain DNS**: Created `marketing.brilliantjobs.app` DNS records in Cloudflare — MX (SES bounce handling), SPF (amazonses.com), DMARC (monitoring mode), DKIM (Resend domain key). Separates marketing email reputation from transactional. Ready for Resend domain configuration in Pod 1.
- **Required transactional lock icons**: 5 required_transactional notification types (payment confirmations, payment failed, plan changes, invoices/receipts, refund confirmations) now appear in the notification preference matrix with lock icons, disabled toggles, and "Always" frequency label. Users can see these notifications exist but cannot disable them.
- **Lock enforcement in notification-center.js**: `ncEnforceLockIcons()` function runs on init, forces required_transactional rows to checked+disabled state regardless of DOM state. Prevents any client-side bypass of required notification toggles.
- **CSS for locked notification rows**: `.notif-locked` and `.notif-lock-icon` styles — dimmed opacity, disabled pointer-events, visual lock SVG inline icon.

### Changed
- notification-center.js version header updated to v5.98
- Cache-bust params updated to ?v=5.98 on dashboard.html

### Infrastructure
- Cloudflare DNS records created (4 records for marketing.brilliantjobs.app)

## v5.97 — Notification Session 2 Unblocked Items (2026-03-01)

### Added
- **confirm-email rate limiting**: IP-based sliding window (5 attempts per 15 min per IP) prevents token brute-force attacks. UUID format validation rejects malformed tokens early. Periodic memory cleanup prevents leaks on long-running instances.
- **resend-confirmation Edge Function**: Token regeneration flow for expired confirmation links. Requires valid auth JWT, generates new token with 24h expiry, sends confirmation email via Resend. Rate limited to 3 resends per hour per user via notification_log count.
- **Quiet hours hold queue**: send-notification v3 now queues SMS notifications blocked by quiet hours into held_notifications table instead of silently dropping them. Held messages include deliver_at timestamp for when quiet hours end. Logged as "held" instead of "blocked" in notification_log.
- **held_notifications table**: New DB table with RLS policies + indexes for efficient delivery scheduling. Escalation-checker (runs every 15 min) can pick up held notifications for retry.
- **Per-type SMS opt-in enforcement**: notification-center.js now wires individual SMS toggles per notification type. Only 7 SMS-allowed types show active toggles. Non-SMS types disabled with tooltip. Phone verification required.
- **Resend confirmation UI**: "Resend confirmation email" button appears in notification section when email is unverified. Calls resend-confirmation Edge Function.

### Changed
- notification-center.js version header updated to v5.97
- send-notification promoted to v3 with hold queue support
- confirm-email promoted to v2 with rate limiting

### Migration
- `v5.97-notification-session2-unblocked.sql` — held_notifications table with RLS + indexes

## v5.96 — Notification Session 2 Completion + Backfill (2026-03-01)

- **initNotificationCenter() wired into app.js**: Notification Center now initializes after auth resolves — loads user_notification_state, user_notification_preferences, checks opt-in modal trigger, and detects email confirmation. This was the last integration step to activate Session 2 features in the dashboard.
- **Existing user backfill**: All 3 existing users seeded into user_notification_state (with email_verified status inferred from account age) and user_notification_preferences (79 types per user, 235 rows total). Verified users marked preferences_completed.
- **Cache-bust fix**: dashboard.html CSS/JS cache-bust params corrected from ?v=5.92 → ?v=5.96 (were stale since v5.92).
- **Version surfaces**: version.js v5.96, index.html v5.96, dashboard.html v5.96 (comment + cache-bust), CHANGELOG.md updated.
- All version increments follow VERSION_METHODOLOGY.docx in the repository.

## v5.95 — Notification System Session 2: Double Opt-In + Preferences + Classification (2026-03-01)

- **Session 2 of 15 complete (Pod 2)**: Built compliance layer, user preference system, and message classification enforcement for the notification system.
- **Database migration** (v5.95-notification-session2.sql): user_notification_state table (email/SMS verification, double opt-in tokens, quiet hours, timezone, daily caps), user_notification_preferences table (per-type email/SMS/in-app toggles + frequency), notification_log expansion. RLS policies, indexes, and update triggers on both tables.
- **confirm-email Edge Function**: Double opt-in token validation with 24h expiry, single-use enforcement, redirect to dashboard with toast confirmation. Code committed to repo.
- **send-notification v2**: Full rewrite with 9-step canSendNotification() gate — classification check, opt-in verification, preference lookup, frequency cap enforcement, quiet hours, SMS restriction (7 allowed types only), template resolution. Code committed to repo.
- **notification-center.js** (18.4KB): Bridges Session 2 tables with existing panel-notifications UI. Opt-in modal (6 category toggles, geo-aware marketing default), dual-write sync, toast system, email confirmation detection.
- **Message classification enforcement**: 79 notification types mapped to 4 classifications (required_transactional, configurable_transactional, product, marketing). SMS restricted to 7 application-related types only.
- **Version surfaces**: version.js v5.95, index.html v5.95, dashboard.html v5.95 (comment), CHANGELOG.md updated.
- All version increments follow VERSION_METHODOLOGY.docx in the repository.

## v5.90 — Industry Detail Pages (#16) (2026-03-01)

- **Item #16 complete (Pod 2)**: Created 15 industry detail pages with live data from per-industry Supabase RPCs. Each page features: salary distribution chart, top 15 employers, department distribution donut, seniority breakdown, remote/on-site/hybrid donut, 5 stat cards, FAQ schema, AI-friendly content blocks, cross-linking to all other industry pages, and tier-aligned CTAs.
- **Industries covered**: Technology, Healthcare, Finance, Consulting and Services, Retail and Consumer, Media and Marketing, Manufacturing, Real Estate and Construction, Energy, Education, Logistics and Transport, Telecom, Government, Legal, Non-Profit.
- **New RPCs (5)**: get_industry_detail(text), get_industry_top_companies(text), get_industry_departments(text), get_industry_salary_distribution(text), get_industry_seniority(text) — all parameterized by industry sector name, anon-accessible.
- **SEO**: Per-page Article + FAQPage structured data, canonical URLs, breadcrumb navigation, methodology footer, unique meta descriptions.
- **Data**: Client-side caching (24h TTL), ECharts 5 for all charts, responsive at 640px/900px breakpoints, dark theme consistent with Data Lab pages.
- **Version surfaces**: version.js v5.90, index.html v5.90, dashboard.html v5.90 (comment + cache-bust ?v=5.90), CHANGELOG.md updated.
- All version increments follow VERSION_METHODOLOGY.docx in the repository.

## v5.89 — Approval Gates for Editorial Pipeline (2026-02-28)

- **Item #15 complete (Pod 2)**: Implemented approval gates for the Content Engine editorial pipeline. Content no longer goes straight to `published` — all generated stories must pass validation then editorial review.
- **Validation gate**: 6-layer deterministic validation per CONTENT_ENGINE_MULTI_MODEL_VALIDATION.md spec — structure, data fidelity (DF-1 through DF-6), voice, volumetrics, entity density, dedup. Runs in-line after model output.
- **Status flow change**: `pending` → generate → validate → `pending_review` (pass) or `validation_failed` (fail, retry up to 2×) → editorial review → `published` or `rejected`.
- **Retry logic**: Failed content gets up to 2 retries with rejection reasons appended to the generation prompt. After 2 failures: `validation_failed_final` (requires manual editorial review).
- **New Edge Function**: `approve-content` — supports `list` (review queue), `approve` (→ published), `reject` (→ rejected). Requires authenticated user.
- **DB migration**: Added 8 columns to `content_stories`: `validation_score`, `validation_result` (jsonb), `retry_count`, `model_used`, `generation_latency_ms`, `reviewed_by`, `reviewed_at`, `review_notes`. Plus 2 partial indexes for review queue and retry queue.
- **Edge Function deploys**: `generate-editorial-content` (updated), `approve-content` (new).
- **Version surfaces**: version.js v5.89, index.html v5.89, dashboard.html v5.89 (comment + cache-bust ?v=5.89), CHANGELOG.md updated.
- All version increments follow VERSION_METHODOLOGY.docx in the repository.

## v5.87 — Version Discipline Sync (2026-02-28)

- **Pod 1 version discipline pass**: Synchronized all version surfaces per DEPLOYMENT_PROCESS.md requirements.
- **version.js**: v5.83 → v5.87 (single source of truth).
- **index.html HTML comment**: v5.81 → v5.87.
- **dashboard.html HTML comment**: v5.80 → v5.87.
- **dashboard.html cache-bust params**: ?v=5.78 → ?v=5.87 (JS bundle + CSS).
- **CHANGELOG.md**: Added v5.84–v5.87 entries to close version gap.
- All 6 Data Lab + pricing + roadmap pages use .bj-version / #rm-version (auto-populated by version.js) — no manual update needed.
- All version increments follow VERSION_METHODOLOGY.docx in the repository.

## v5.86 — AI-Friendly Content Blocks (2026-02-28)

- **Item #13 complete**: Added 10 AI-friendly content blocks across all 6 Data Lab pages + hub page. Semantic `<section class="ai-block">` wrappers with `data-ai-*` attributes (topic, summary, source, updated, metric, scope) for LLM extraction, search enrichment, and freshness signals. Zero visual impact via invisible pseudo-elements.
- **AI blocks by page**: salary-data (2), hiring-trends (2), career-level-data (1), jobs-by-industry (2), market-dynamics (2), data-lab hub (1).
- **Version surfaces**: version.js v5.86, CHANGELOG.md updated.

## v5.85 — Quotable Insight Statements (2026-02-28)

- **Item #11 complete**: Added 10 quotable insight statements across all 6 Data Lab pages + hub page. Semantically marked up `<figure>`/`<blockquote>`/`<figcaption>` elements for AI/LLM citation, social sharing, and featured snippets.
- **Version surfaces**: version.js v5.85, CHANGELOG.md updated.

## v5.84 — Client-Side Aggregation Confirmation (2026-02-28)

- **Item #10 confirmed**: Client-side aggregation on Data Lab pages verified as already complete. No additional implementation needed.
- **Version surfaces**: version.js v5.84, CHANGELOG.md updated.

## v5.83 — Pod 2 Content Strategy Sprint (2026-02-28)

- **Item #1 complete**: Added tier-aligned CTAs (Free/Starter $20/Pro $40) to all 6 Data Lab pages with "Start Free" + "See Plans" buttons linking to dashboard signup and pricing page.
- **Item #2 complete**: Fixed market-dynamics anon key exposure — migrated from direct REST API calls (`/rest/v1/table`) to RPC-based pattern (`/rest/v1/rpc/get_*`). Created 3 new Supabase RPC wrappers: `get_mv_industry_dept_week()`, `get_mv_dept_level_week()`, `get_mv_state_week()`. Reduces API surface area to defined function signatures.
- **Item #3 complete**: Added methodology footer to data-lab.html hub page (was the only Data Lab page missing it). Describes data sources, ATS platforms, refresh cycles, and classification methodology.
- **Item #6 complete**: Added FAQPage schema to market-dynamics.html (was the only Data Lab page missing it). 4 questions aligned to entity extraction cluster 5 recommendations: geographic shifts, labor market data, state-level openings, regional industry shifts.
- **Item #17 complete**: Added mobile chart responsiveness CSS to all 6 Data Lab pages. Charts now use `min-height` with auto sizing below 640px, stat grids switch to 2-column layout, and chart cards gain horizontal scroll for overflow.
- **Version surfaces**: version.js v5.83, CHANGELOG.md updated.
- **Database**: 3 new RPC functions created (get_mv_industry_dept_week, get_mv_dept_level_week, get_mv_state_week) with anon EXECUTE grants.

## v5.82 — DataForSEO Entity Extraction for Data Lab (2026-02-28)

- **Item #5 complete**: Ran DataForSEO Keywords Data API (Search Volume + Keywords for Keywords) across 6 Data Lab keyword clusters.
- **50 keywords analyzed**: Search volume, competition, CPC data for salary-data, hiring-trends, career-level-data, jobs-by-industry, market-dynamics, and data-lab hub pages.
- **Key findings**: career-level-data has highest volume cluster (2,400/mo for "[role] salary entry level" patterns). "Salary transparency" (1,600/mo) is the anchor for salary-data page. "Hiring velocity" (480/mo) validates hiring-trends H1. "Labor market data" (480/mo) is the real anchor for market-dynamics, not "market dynamics."
- **FAQ schema recommendations**: 4 questions per page, prioritized by volume. Feeds directly into Item #6 (Pod 2).
- **Entity overlap map**: Cross-linking strategy between salary-data ↔ career-level-data, salary-data ↔ jobs-by-industry, hiring-trends ↔ market-dynamics.
- **Zero-volume keywords flagged**: 8 target keywords return zero volume — reframe recommendations included.
- **Deliverable**: docs/entity-extraction-results.md committed to repo.
- **Version surfaces**: version.js v5.82.

## v5.81 — Content Strategy Persona Alignment (2026-02-28)

- **Fiorelli AI Content Framework audit**: Applied persona-driven copy, direct-answer H2s, and entity strategy across all Data Lab pages.
- **salary-data.html**: Title → "Job Market Salary Data 2026", H1 → "What Companies Are Actually Paying in 2026", persona-aligned intro, direct-answer H2s.
- **hiring-trends.html**: Title updated, H1 → "How Fast Is the Market Moving Right Now?", persona-aligned intro, 3 direct-answer H2s.
- **career-level-data.html**: Title → "Where You Fit in the Market", H1 updated, persona-aligned intro, direct-answer H2.
- **jobs-by-industry.html**: Title → "Which Sectors Are Hiring & What They Pay", H1 updated, persona-aligned intro, 2 direct-answer H2s.
- **market-dynamics.html**: H1 → "Where the Jobs Are Moving", persona-aligned intro, 5 direct-answer H2s.
- **data-lab.html**: H1 → "Market Intelligence Lab", persona-aligned intro.
- **index.html**: Schema offers updated from "free during beta" to Free/Starter($20)/Pro($40) tiers. Social proof bar gains Data Lab methodology link.
- **Pod 1 deliverables**: Brand Voice Brief, Agent Definition, Volumetric Specs created for Content Engine handoff.
- **Version surfaces**: version.js v5.81, index.html v5.81.

## v5.80 — FCD Roadmap Update (2026-02-28)

- **Phase 66 added**: FCD Pipeline Cleanup (v5.78) — 2 done cards (cleanup deploy + Supabase infra).
- **Phase 67 added**: FCD Data Loading — 3 todo cards (run filter, upload data, activate cron).
- **Card flipped**: FCD pipeline Step 3 cron → done (job 63 created, disabled).
- **Version surfaces**: version.js v5.80, dashboard.html v5.80, index.html v5.80.

## v5.79 — FCD Enrichment Complete + Roadmap Update (2026-02-28)
- **FCD backfill complete**: 28,898/39,123 companies enriched with industry (73.9%), 24,956 with locality (63.8%)
- **US companies with jobs**: 78.8% industry coverage, 76.1% locality coverage
- **5-strategy matching**: exact name, LinkedIn slug→ATS slug, domain, unsquished slug (v1+v3 local scripts)
- **145 false-match records cleaned**: bananeiras/quadra locality clusters NULLed
- **Roadmap cards flipped**: Industry enrichment pass (done), FCD Step 2 (progress), Enrich unmatched boards (done), AI pilot (done), AI backfill (progress)
- **Blockers removed**: Jobs by Location page, Multi-dimensional insight stories now unblocked
- **JD AI enrichment**: 82.4% complete (93,289/113,179 jobs), cron running autonomously
- Handoff doc: fcd-enrichment-pipeline-handoff.docx for ongoing automated pipeline


## v5.78 — FCD Pipeline Cleanup (2026-02-28)

- **Deleted superseded PDL scripts**: Removed `scripts/filter-pdl.py`, `scripts/upload-pdl-filtered.sh`, and `supabase/functions/enrich-pdl-batch/` directory — all replaced by FCD equivalents in v5.76/v5.77.
- **Roadmap PDL→FCD rename**: Updated 6 remaining PDL references in roadmap.html (Steps 1-3 descriptions, Phase 22 card, Phase 59 card) to reference filter-fcd.py, enrich-fcd-batch, and fcd-enrichment bucket.
- **Version surfaces**: version.js v5.78, dashboard.html v5.78, index.html v5.78, CHANGELOG.md.

## v5.77 — FCD Enrichment Pipeline Production Deploy (2026-02-28)

- **FCD pipeline merged to dev**: filter-fcd.py (streams 10 GB FCD, filters by non-null industry, extracts linkedin_slug + domain), upload-fcd-filtered.sh (targets fcd-enrichment bucket), enrich-fcd-batch Edge Function (5 matching strategies: exact name, LinkedIn slug, domain, unsquished slug, Jaccard overlap). Writes 8 fields to NULL columns only.
- **Edge Function live**: Deployed enrich-fcd-batch with --no-verify-jwt. Processes max 200 boards/run within 140s wall time. Logs strategy breakdown to audit_log.
- **pg_cron job**: Old job #62 to be unscheduled. New enrich-fcd-batch job configured for weekly Sunday 3 AM UTC (DISABLED pending manual testing).

## v5.76 — Extension Update Notification + Roadmap Cleanup (2026-02-28)

- **REQUIRED_EXTENSION_VERSION bumped** from 2.11.0 → 2.17.0 in js/app.js (was stale since v5.75 ATS handler expansion)
- **Extension update flow verified**: Nav dot amber on version mismatch, Setup page shows update banner with installed vs required version, download CTA triggers /api/build-extension
- **Roadmap line 572**: Extension update notification marked done
- **Roadmap line 575**: ATS API key scraping marked done — 224 keys scraped (203 embed_js + 21 iframe), schema ready with api_key_encrypted/api_key_source/api_key_scraped_at columns, discover-boards integration pending coverage expansion

## v5.75 — Expand ATS Handler Coverage (2026-02-28)

- **4 new ATS fill handlers**: iCIMS (`*.icims.com`), Taleo/Oracle (`*.taleo.net`), SmartRecruiters (`jobs.smartrecruiters.com`), Avature (`*.avature.net`) — ~200-280 lines each following established handler pattern
- **contentScript.js router**: Added detection entries for all 4 platforms (hostname matching), JD extraction selectors, title selectors, company name selectors
- **manifest.json**: Added 5 new host_permissions + content_scripts matches for the 4 ATS domains. Extension version bumped to 2.17.0
- **Handler capabilities**: Text input fill, select/custom dropdown fill, radio/checkbox fill, resume upload, cover letter upload, smart question mapping (authorization, visa, salary, etc.)
- **Supported ATS platforms now: 13** — Greenhouse (legacy + React), Lever, Ashby, Workable, Recruitee, LinkedIn Easy Apply, Indeed, Workday, iCIMS, Taleo, SmartRecruiters, Avature, plus Generic fallback
- **Version surfaces**: version.js v5.75, dashboard.html v5.75, index.html v5.75, cache-bust params v5.75, CHANGELOG.md

## v5.74 — Location Normalization v2 (2026-02-28)

- **normalize_locations_v2 RPC** — New PostgreSQL function that composes `location_normalized` from structured fields (`loc_city`, `loc_state`, `loc_country`, `is_remote`)
- **+162,067 jobs normalized** — Coverage jumped from 41.4% → 92.2% (132K → 294K of 319K open jobs)
- **Per-ATS results:** Workable 100%, Recruitee 100%, USAJobs 100% (was 0%), Lever 92.8%, Ashby 90.2%, Greenhouse 89.1%
- **8-pass normalization strategy:** Remote (no city), Remote (with city/state), US structured, Non-US structured, US state-only, Country-only, USAJobs direct, Pattern matching
- **Remaining gaps (~25K):** Company-specific labels, multi-location strings without structured data, ambiguous city-only entries — requires geocoding API or AI extraction for future pass

## v5.73 — 2026-02-28
- **Dynamic SEO counts**: Created `get_seo_stats()` Supabase RPC (SECURITY DEFINER) returning live open_jobs, companies, active_boards, with_salary, salary_pct counts. Created `js/seo-stats.js` — shared hydrator that calls the RPC on page load, replaces hardcoded count text with live data via `.seo-jobs-k`, `.seo-jobs-full`, `.seo-companies-k`, `.seo-salary-count`, `.seo-salary-pct` class selectors. Results cached in sessionStorage (30 min TTL). Hardcoded values remain as SSR/SEO fallback for crawlers that do not execute JS.
- **FCD rename**: Renamed all "PDL" references across roadmap, methodology text, and phase names to "Free Company Dataset" (FCD). The data source is the free_company_dataset.json file (10 GB, company name/industry/size/location structure — no ATS URLs). Matching uses company name fuzzy logic against ats_companies.
- **6 SEO pages updated**: data-lab, career-level-data, hiring-trends, jobs-by-industry, market-dynamics, salary-data — all now include `seo-stats.js` and use dynamic count spans.
- **Version surfaces**: version.js v5.73, dashboard.html v5.73, index.html v5.73, CHANGELOG.md, roadmap.html Phase 62.

## v5.72 — 2026-02-28
- **SEO count accuracy sweep #2**: Updated job counts from 320K+→315K+ across 7 SEO pages — data-lab, career-level-data, hiring-trends, jobs-by-industry, market-dynamics, salary-data, and index.html structured data. Actual open jobs: 317,834 (down from 320,053 in v5.66 due to normal job closures).
- **Salary data count update**: Updated from 40K→49K salary-listed jobs (actual 49,876, 16% of total — up from 13% in v5.66). Updated salary-data.html methodology text.
- **Roadmap backfill**: Added missing roadmap entries for v5.67–v5.72 (Phases 57–61). Six versions of documentation gap closed. Phase names added.
- **Version surfaces**: version.js v5.72, dashboard.html comment + cache-bust v5.72, index.html comment v5.72, CHANGELOG.md updated.

## v5.71 — 2026-02-28
- **Version discipline fix**: Corrected stale v5.68 references in dashboard.html (HTML comment, JS cache-bust, CSS cache-bust) and index.html (HTML comment) to v5.71. Added missing v5.70 CHANGELOG entry. All version surfaces now aligned: js/version.js, dashboard.html comment, dashboard.html cache-busts, index.html comment, CHANGELOG.md.

## v5.70 — 2026-02-28
- **PDL pipeline Step 1: filter script + Edge Function**: Built filter-pdl.py (Python local streamer for 10 GB PDL dataset, ~100 MB RAM, extracts ATS-matching companies). Built enrich-pdl-batch Edge Function (3-strategy matching: LinkedIn URL, website domain, corroborated name; 200 boards/run; conditional upsert — only fills NULLs). Added pg_cron Job 62 (weekly Sun 3AM UTC, DISABLED awaiting Step 2 data upload). Schema-validated against live ats_companies (slug/source PK). Disabled legacy manual enrichment cron.

## v5.69 — 2026-02-28
- **Install instructions page**: Created /install with 7-step guide for Chrome extension installation — download, unzip, Developer mode, Load unpacked, pin, troubleshooting, and update workflow. Consistent with help.html styling (light theme, step-based layout, Outfit + JetBrains Mono fonts).
- **Roadmap hygiene: 3 completed cards marked done**: "Location normalization for non-GH platforms" (v5.60+v5.67+v5.68, 78.6%→90.1%), "Salary parsing for non-GH platforms" (v5.61, Lever+Recruitee), "Install instructions page" (this version).
- **Roadmap status**: 828 done, 124 todo, 5 in progress.

## v5.68 — 2026-02-27
- **Multi-ATS location normalization — Lever/Ashby/GH remaining gaps**: Normalized 12,562 additional jobs across Greenhouse, Lever, and Ashby platforms. Coverage: 86.2%→90.1% (275,845→288,407 jobs with loc_country).
- **Indian state matching**: Recognized 30+ Indian states/territories (Karnataka, Maharashtra, Tamil Nadu, etc.) across all platforms.
- **UK county/region matching**: Recognized 60+ UK counties (Greater London, West Midlands, Hampshire, etc.) for City-County patterns.
- **Country-prefix reversal**: Resolved "Country, City" reversed format ("New Zealand, Auckland", "India, Ahmedabad") across 40+ countries.
- **US state patterns**: Matched "State - City" (Lever) and "City, ST" (GH) patterns for all 50 US states.
- **Canadian province, Australian state, Brazilian state matching**: Province names, abbreviations, state codes.
- **Country-dash-City patterns**: Resolved "India - Bengaluru", "Malaysia - Kuala Lumpur", "Hungary - Budapest" across 50+ countries.
- **Ashby coded formats**: Parsed US-CA-Menlo Park, AU-Sydney, GB-London ISO-style and "City, ST - US" convention.
- **Remote pattern normalization**: Resolved 20+ remote variants across all platforms.
- **Known city resolution**: Mapped 120+ unambiguous world cities to their countries.
- **Emoji flag, German region, Mexican state matching**: Extended pattern coverage.
- **Remaining gaps**: GH 20,178, Lever 6,559, Ashby 4,907 — mostly company-specific labels, multi-location semicolons, and ambiguous city names.

## v5.67 — 2026-02-27
- **GH location normalization — US states**: Normalized 536 Greenhouse jobs with "State, United States" patterns (all 50 states + DC). Sets loc_state, loc_country, loc_display. Created `normalize_gh_us_states()` RPC.
- **GH location normalization — 65+ countries**: Normalized country-only strings (Canada, Brazil, Germany, etc.) across Greenhouse, Lever, Ashby, Workable. Handles exact match, case variants, whitespace, (Remote)/(Hybrid) suffixes.
- **Multi-ATS remote pattern normalization**: Resolved US-remote variants ("Remote", "US - Remote", "Remote (US)", "USA - Remote", etc.) and international remote patterns across all platforms.
- **City-level pattern matching**: Normalized São Paulo/SP, Belo Horizonte/MG, Mexico City, Hong Kong, Sofia, Budapest, Dublin/IE, Auckland/NZ, Washington D.C., Bay Area patterns.
- **Coverage improvement**: Location coverage 251,444→286,529 (78.6%→89.5%). 35,085 jobs gained location data. Remaining 33,519 jobs need geocoding API or are multi-location strings.

# Changelog

## BLOCKERS
- **Resend domain verification**: `brilliantjobs.app` domain not verified in Resend. DNS records (SPF, DKIM, DMARC) are all present and resolving correctly in Cloudflare DNS. DKIM verified, SPF shows failed in Resend. Resend dashboard throwing server-side error (Next.js SSR crash) — cannot access /domains page. Google OAuth redirect loops to accounts.youtube.com/accounts/SetSID. API key is send-only (cannot manage domains via API). **Need**: Either fix Resend dashboard access (try incognito with only brilliantjobsapp@gmail.com signed in), create a full-access API key, or contact support@resend.com. Once verified, all notification emails unlock.
- **SEO redirect (Item 3)**: `http://brilliantjobs.app` and `http://www.brilliantjobs.app` return 308 to `https://vercel.com/` instead of `https://brilliantjobs.app`. Requires manual fix in Vercel Dashboard (domain config) + Cloudflare DNS (ensure DNS-only mode). See Pod 2 Handoff doc for exact steps. Cloudflare API token lacks DNS edit permissions — needs manual dashboard access.

## v5.56 — 2026-02-27
- **On-Page Status Overlay (Competitive Gap Item #3)**: Floating bottom-right widget showing real-time fill progress during autofill
  - New module `extension/inject-overlay.js`: animated overlay with progress bar, per-field status, success/error states
  - Auto-dismisses after completion (5s success, 8s error), click-to-dismiss
  - Wired into `contentScript.js` `handleFillRequest()` — shows progress, field results, final state
  - Matches FastApply/OwlApply floating overlay UX
- **Cover Letter Generation (Competitive Gap Item #4)**: AI-powered cover letter pipeline via Edge Function
  - New Edge Function `supabase/functions/generate-cover-letter/index.ts`
  - Claude Haiku for cost efficiency (~$0.001 per letter), 350-word max
  - Accepts JD + resume + profile, generates tailored cover letter
  - Rate limited (20 AI calls/day shared with score-resume), telemetry to `cover_letter_generations` table
  - Tone options: formal, conversational, default; emphasis keywords
- **Fill Metrics & Feedback Loop (Competitive Gap Item #5)**: Per-platform fill tracking + PostHog events + AI answer ratings
  - New module `extension/utils/fillMetrics.js`: tracks fill success/failure rates per ATS platform
  - PostHog event capture from extension (`extension_fill_completed`, `extension_ai_feedback`, overlay events)
  - Supabase persistence to `extension_fill_metrics` table with local buffer fallback
  - Thumbs up/down on AI answers feeding quality table
  - Wired into `contentScript.js` — auto-reports after every fill
- Extension version: 2.16.0
- Dashboard version: v5.56, bundle rebuilt, cache-bust updated
- `manifest.json`: Added `web_accessible_resources` for dynamic handler/overlay/metrics imports

## v5.55 — 2026-02-27
- **Generic/Universal Form Handler (Competitive Gap Item #1)**: DOM heuristic-based form filler that works on any ATS not covered by a dedicated handler
  - New module `extension/handlers/generic.js`: label/input association, name attribute pattern matching, placeholder text analysis, fuzzy-match approach
  - Falls back to `aiAnswerer.js` for unrecognized custom questions
  - Updated `extension/contentScript.js`: generic fallback routing when `detectATS()` finds no named handler but `_hasApplicationForm()` returns true
  - Doubles effective ATS coverage from 8 named platforms to 8 + any unknown site
- **Manifest Host Permissions Fix (Competitive Gap Item #2)**: Content scripts now auto-inject on all ATS pages on page load
  - `manifest.json`: added all known ATS domains to `host_permissions` + `content_scripts` auto-inject entry + `optional_host_permissions` for unknown/generic sites
  - `background.js`: `injectContentScriptIfNeeded()` via `chrome.scripting.executeScript` for dynamic injection, `INJECTED_TABS` tracking, SPA fallback, tab cleanup
  - Matches FastApply/Huntr/OwlApply auto-inject behavior while preserving narrow-permission security model
- Extension version: 2.15.0
- Dashboard version: v5.55, bundle rebuilt, cache-bust updated

## v5.54 — 2026-02-27
- **Indeed Anti-Bot Hardening (Item #6)**: Three-layer hardening for Indeed form filling
  - Randomized delays with log-normal distribution
  - Fingerprint masking: canvas noise, WebGL variation, navigator shimming
  - Request pattern variation: field order shuffling, revisit simulation, tab-away events
  - Extension version: 2.14.0

## v5.53 — 2026-02-27
- **Workday My Experience Auto-Fill (Item #5)**: Full multi-section employment + education history filling on Workday's "My Experience" page
  - New module `extension/handlers/workday-experience.js`: specialized handler for the My Experience wizard step
  - Work experience: fills job title, company, location, description for each entry from `profile.experience[]`
  - Education: fills school, degree, field of study, GPA for each entry from `profile.education[]`
  - Skills: tag-style skill input with autocomplete detection, adds up to 10 skills
  - "Add Another" button detection: dynamically adds entry containers when profile has more entries than visible on page
  - "I currently work here" checkbox: auto-checked when entry has no end date or end date is "Present"
  - 4-strategy Workday date picker:
    1. Direct month/year display field filling via data-automation-id
    2. Date section widget detection (combined month/year containers)
    3. Calendar popup navigation (arrow-based, up to 60 months in either direction)
    4. Fallback to standard date/month/text inputs
  - Searchable dropdown handling: character-by-character typing triggers autocomplete for company, school, degree fields
  - Date parsing from LinkedIn profile format ("Jan 2020", "January 2020", "2020", "Jan 2020 - Present")
  - Integrated into main `workday.js` fill loop — routes to specialized handler when page title matches "My Experience"
  - Extension version: 2.13.0 (unchanged — extension-side module, no manifest change needed)

## v5.52 — 2026-02-27
- **Recruiter Email Discovery (Item #19)**: Hunter.io integration for finding recruiter contacts
  - New Edge Function `recruiter-lookup`: domain search via Hunter.io API, stores results in `recruiter_contacts`
  - Filters results by recruiting-related titles (recruiter, talent acquisition, HR, etc.)
  - Falls back to top 3 highest-confidence contacts when no title matches
  - Rate limited: 10 lookups per user per day
  - Caches results: subsequent lookups for same domain return stored contacts
  - Pipeline UI: "Find Recruiters" menu item on every pipeline card (⋮ menu)
  - Inline recruiter card shows name, title, email (mailto link), confidence score, LinkedIn link
  - `loadRecruiterContacts()` utility for future pipeline enrichment features
  - Requires `HUNTER_API_KEY` secret in Supabase Edge Function env
  - Migration: uses existing `recruiter_contacts` table (011_recruiter_contacts.sql, shipped v5.50)

## v5.49 — 2026-02-27
- **Background Discovery Pipeline (Item #2, P0)**: Full self-sustaining job discovery loop now operational
  - `board_discovery_queue` table: ATS URLs detected by extension, queued for processing (Item #20)
  - Extension pushes ATS redirect detections (11 platform patterns) to queue automatically
  - `discover-boards` Edge Function v3: processes both companies table (broad scan) and board_discovery_queue (targeted verification)
  - pg_cron schedule: `discover-boards-6h` runs every 6 hours automatically
  - Admin Feed Health tab: Board Discovery Queue stats (total, pending, found)
  - First run discovered 19 new boards from 50 companies checked
  - RLS policies on board_discovery_queue (user-scoped insert/select)
  - Migration: `010_board_discovery_queue.sql`

## v3.48 — 2026-02-22
- **SEO tab redesign** (Pod 1 spec): Full visual overhaul of Admin Console SEO tab
  - 13 new CSS classes replacing all inline styles (.seo-controls, .seo-select, .seo-section-label, .seo-detail-grid, .seo-metric-row, .seo-metric-label, .seo-metric-value, .seo-loading, .seo-empty, etc.)
  - 4-section layout: Controls → Stat Cards (`.stat-grid`) → Charts (`.stats-grid`) → Drilldowns (`.seo-detail-grid`)
  - DOM-based stat cards via `document.createElement` replacing innerHTML string concatenation
  - CrUX promoted from Knowledge Graph afterthought to own chart card
  - Chart heights: 300px (GSC full-width hero), 280px (PSI, CF, YLT, CrUX half-width)
  - Light-theme ECharts: tooltip `rgba(15,23,42,0.95)`, grid `#e8eaef`, axis `#7b829a`
  - Section dividers: "PERFORMANCE CHARTS" + "TECHNICAL DETAILS" with uppercase tracking
  - Loading states in all 9 containers, empty states with styled messaging + sync links
  - All 5 side panel renders rewritten with `.seo-metric-row` / `.admin-platform-table`
  - Tailwind CSS built clean with all 13 classes verified in output
  - All 12 acceptance criteria from Pod 1 handoff spec: PASS

## v3.47 — 2026-02-22
- **Dead job icon**: Replaced 3D 🚫 emoji with on-brand SVG burned-out lightbulb. Copy: "This Brilliant opportunity has dimmed"

## v3.46 — 2026-02-22
- **SEO Admin stat cards**: Added summary KPI row (PSI, YLT, Indexed, CF Requests, GSC Clicks) with color thresholds
- **SEO Admin chart grid**: Restructured to 2×2 card grid with consistent heights

## v3.45 — 2026-02-22
- **Visit-based segment detection (Pod 2 Item #1)**: Landing page `index.html` now detects 4 visitor segments via `<head>` script: new, returning, lapsed, active. Sets `data-segment` attribute on `<html>` before body paint (no FOUC). Visit counter (`bj_visits`) increments in localStorage. Deep visit detection (`data-visit-depth="deep"`) for visit 3+ returning visitors.
- **Segment content variants (Pod 2 Item #2)**: CSS-driven content personalization — all 4 variants in single `index.html`. New visitors see full pitch (current experience, no regression). Returning visitors see shorter hero + auto-expanded preview + compressed benefits. Visit 3+ returning visitors also see objection FAQ (data safety, LinkedIn comparison, free plan, freshness). Lapsed registered users see welcome-back hero with login CTA, no marketing sections. Active users auto-redirect to `/dashboard` with fallback banner.
- **bj_has_account flag**: Dashboard `app.js` sets `localStorage.setItem('bj_has_account', 'true')` on successful auth, persists after logout for lapsed user detection on landing page.
- **SEO redirect diagnosis (Pod 2 Item #3)**: Confirmed `http://brilliantjobs.app` → 308 to `vercel.com`. Requires manual Vercel Dashboard + Cloudflare DNS fix (documented in BLOCKERS).
- **Version bump**: v3.44 → v3.45 across dashboard.html, app.js, index.html footer

## v3.45 — 2026-02-22
- **InLinks semantic schemas**: Added WebPage ld+json with `about`/`mentions` entities (Wikipedia sameAs) to all 6 public pages (salary-data, hiring-trends, jobs-by-industry, career-level-data, data-lab, index)
- **GSC domain property fix**: Changed `siteUrl` from `https://brilliantjobs.app/` to `sc-domain:brilliantjobs.app`. URL Inspection now returns real data — homepage indexed (PASS), 5 data pages discovered/not yet crawled
- **Removed all brilliantjobs.io references**: Edge Function, dashboard HTML URL dropdown, Supabase secrets. That domain never existed
- **RLS disabled on SEO tables**: Row Level Security was blocking all frontend reads on 6 SEO tables. Disabled since they contain only aggregate admin metrics
- **Daily SEO cron**: `trigger_seo_sync()` via pg_cron at 6 AM UTC, calls all 9 tools automatically
- **SEO Admin single-column layout**: Replaced broken 2-column grid with 9 clearly labeled sections (PostHog, GSC, URL Inspection, PSI, CrUX, Yellow Labs, DataForSEO, Cloudflare, Knowledge Graph)

## v3.41 — 2026-02-22
- **SEO Admin redesign**: Complete rebuild of the SEO/Data Coverage admin tab with 9-tool dashboard
- **seo-sync Edge Function v3**: Added 4 new data sources — Yellow Lab Tools (public API, frontend quality scores), Chrome UX Report API (real-user field data), Google Knowledge Graph Search API (entity detection), Cloudflare Analytics (traffic, page views, uniques, status codes, countries)
- **PSI expanded**: PageSpeed Insights now collects all 4 Lighthouse categories (Performance, SEO, Accessibility, Best Practices) — previously only Performance and SEO
- **New dashboard layout**: URL dropdown (All Pages or individual), date range selector (7d/30d/90d), 6 time series charts (PostHog traffic, GSC clicks+impressions, PSI 4-category scores, CrUX metrics, Yellow Lab Tools scores, Cloudflare traffic), side panel with URL inspection status, Core Web Vitals drilldown, GSC search queries, Knowledge Graph entities
- **Cloudflare integration**: Zone ID `248eb020d5fcc71444faa7288f2853cf` wired via GraphQL Analytics API (httpRequests1dGroups, free plan compatible)
- **Credential consolidation**: Unified all 4 credential files (CREDENTIALS__1_, CREDENTIALS__3_, credential-google, credentialsnew) into single CREDENTIALS_MASTER with all 10 services
- **Day 1 data**: Yellow Labs (6 pages, all 99), Cloudflare (2 days), Knowledge Graph (4 entities), PSI (8 pages × 2 strategies), CrUX (awaiting sufficient traffic)



## v5.94 — 2026-03-01

### Added
- **Competitor Comparison Page** (`/compare`) — SEO hub comparing Brilliant Jobs vs LinkedIn, Indeed, ZipRecruiter, Glassdoor
- 12-row feature comparison table (desktop 6-col / mobile card stack)
- Automated cover letter generation and one-click application submission highlighted as key differentiators
- 4 competitor deep-dive sections with pain points vs. advantages
- 8-question FAQ with FAQPage JSON-LD structured data
- 5 PostHog tracking events
- `/compare` added to landing page nav and footer, sitemap.xml


## v2.60 — 2026-02-16
- **CRITICAL FIX — Resume scoring data path**: `toggleResumeFilter()` saves assignments to `resume.filterIds[]` (array of filter names on the resume object), but all scoring code checked `filter.resumeId` (a property on the filter object that was **never set**). This meant readiness analysis, feed match scores, and auto-analysis all silently found zero assignments and produced no scores. Fixed all three code paths: `initReadinessPanel`, `runReadinessAnalysis`, and `computeJobMatchScore` now read from `resume.filterIds`.
- **Feed match scoring fix**: `computeJobMatchScore()` was taking first 40 tokens from a `Set` in insertion order (document order = arbitrary). Now frequency-ranks terms within each JD — most-repeated skill terms score highest. This makes match scores meaningful.
- **Cache invalidation**: `toggleResumeFilter` now clears readiness cache and feed match scores when filter assignment changes, triggering fresh re-analysis.
- **Resend API key**: Set as Supabase Edge Function secret (`RESEND_API_KEY`). Confirmed working via test email through sandbox domain (`onboarding@resend.dev`). Blocked on domain verification (see BLOCKERS above).

## v2.59 — 2026-02-15
- **Resume readiness overhaul**: Auto-run analysis on Resumes page load (24h cache TTL, background refresh when stale)
- **Letter grades**: A+ through F scale on resume cards and feed Match column (replaces raw percentage). Grade scale: A+(90+), A(80+), B+(70+), B(60+), C+(50+), C(40+), D(30+), F(<30)
- **Inline insights**: "View insights ▸" expands directly on each resume card showing missing terms, covered terms, missing phrases, and level fit. No more scrolling to separate Readiness panel
- **Filter corpus caching**: `filterCorpusCache` stores ngram results per filter during analysis for reuse

## v2.58 — 2026-02-15
- **Notification system (P5)**: Full Applications page UI — notification preference matrix, phone verification section, escalation rules with timeout slider, per-filter overrides, notification history log
- **8 Edge Functions deployed**: send-notification, apply-on-notification, handle-notification-response, escalation-checker, daily-digest, weekly-summary, account-lifecycle, auth-hook
- **6 pg_cron schedules**: escalation checker (15min), daily digest (8am ET), weekly summary (Mon 8am ET), ghost scanner (daily), inactivity checker (daily), listing closer (daily)
- **18 email templates**: Shared template library in `_shared/email-templates.ts`
- **Pulsing nav dots**: CSS animation + `checkNavPulses()` on dashboard load

## v2.44 — 2026-02-15
- **Keyword extraction**: Strip HTML artifacts (e.g., `/li /ul`, `mdash /span`) from bigrams/trigrams via `KW_HTML_JUNK` blocklist and improved tokenizer
- **Tuning page**: Fix dropdown clipping — removed `overflow:hidden` from `.tuning-card` so company/location typeahead dropdowns render fully
- **Resume CTAs**: Solid filled buttons (Download blue, Rename gray, Archive amber, Delete red) with white text. No more pill-style or text links
- **Resume downloads**: IndexedDB file store (`bj_resume_files`) — file blobs saved on upload, Download button retrieves and triggers browser download
- **Application toggles**: Fixed notification settings toggles stretching full-width — `.toggle-switch` no longer inherits `flex:1` from label rule
- **Setup page dots**: Unified `.setup-dot` CSS class for GDrive and Gmail dots, consistent with Extension's `.ext-dot`. All three sections aligned

## v2.43 — 2026-02-15
- **Pipeline**: "Day Applied" column (shows date, replaces "Days to Apply"); "Days In Stage" column with stage-aware timing
- **Pipeline staleness dots**: Yellow/red indicators per stage (Saved 5/7d, Applied/Responded/Interview 7/14d)
- **Resumes**: Removed "Create by Level" button from upload zone

## v2.42 — 2026-02-15
- **Setup page**: Three independent card sections (Extension, GDrive, Gmail) with status dots in headers
- **GDrive dot**: Added initial gray background color

## v2.41 — 2026-02-15
- **"How this works →"** CTAs replace ? icon buttons on all page headers
- **Pipeline stage headings**: All standardized to `var(--text)` (black) — no more per-stage colors
- **Resume actions**: Changed from pill buttons to text links (later upgraded to solid CTAs in v2.44)
- **Coverage alert**: Neutral background with colored filter pills

## v2.40 — 2026-02-15
- **Pipeline redesign**: Table-based collapsible stages replacing kanban cards
- **Resume picker**: Popup on every apply action
- **Filter level assignment**: Per-filter level checkboxes with overlap detection popup
- **Resume page**: Filter-grouped layout with colored number badges
- **Per-page help icons**: Contextual help panels with numbered steps
- **Viewport overflow fix**: Body `overflow:hidden`, `.main` scrolls within viewport
- **Sticky resume stat boxes**: Pinned at top of Resumes page
- **"How Resumes Work" removed**: Explainer section removed
- **Roadmap**: Per-phase collapsible chevrons with phase names
- **Security P18**: 10 new items (RLS audit, API key scoping, etc.)

## v2.26 — 2026-02-14
- P4 keyword extraction and resume-to-JD matching
- Resume keyword display with tier-1/tier-2 chips
- Keyword insights panel with Skills, 2-Word, 3-Word tabs

## Earlier versions
See roadmap.html for full feature history across P0–P18.
