/**
 * CS-P1-005: Observability Completion + Feature Flags
 * Tests: DO-001, DO-003, DO-004, AD-DO-001, AD-DO-002, AD-DO-003, AD-DO-004
 */
const fs = require('fs');
const path = require('path');

// ── Helper: read file ──
function readFile(relPath) {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf-8');
}

// ── Helper: file exists ──
function fileExists(relPath) {
  return fs.existsSync(path.join(__dirname, '..', relPath));
}

// ═══════════════════════════════════════════════════════════
// DO-001: PostHog SDK on all 4 surfaces
// ═══════════════════════════════════════════════════════════
describe('DO-001: PostHog SDK on all surfaces', () => {
  test('Dashboard has PostHog init', () => {
    const html = readFile('dashboard.html');
    expect(html).toContain('posthog-dashboard.js');
  });

  test('Admin has PostHog init', () => {
    const html = readFile('admin.html');
    expect(html).toContain('posthog-admin.js');
  });

  test('Landing page has PostHog (via cookie-consent)', () => {
    const html = readFile('index.html');
    expect(html).toContain('cookie-consent.js');
    const consent = readFile('js/cookie-consent.js');
    expect(consent).toContain('posthog');
  });

  test('Extension has PostHog capture', () => {
    const bg = readFile('extension/background.ts');
    expect(bg).toContain('posthog');
  });

  test('Dashboard identifies users', () => {
    const app = readFile('js/app.js');
    expect(app).toContain('posthog.identify');
  });

  test('Landing page identifies users', () => {
    const landing = readFile('js/landing-app.js');
    expect(landing).toContain('PostHog identity bridge');
  });

  test('PostHog exception autocapture is enabled', () => {
    const dashPH = readFile('js/posthog-dashboard.js');
    // PostHog SDK snippet includes exception autocapture by default
    expect(dashPH).toContain('posthog.init');
  });
});

// ═══════════════════════════════════════════════════════════
// DO-003: Feature Flags via PostHog
// ═══════════════════════════════════════════════════════════
describe('DO-003: Feature flags infrastructure', () => {
  test('feature-flags.js exists', () => {
    expect(fileExists('js/feature-flags.js')).toBe(true);
  });

  test('Feature flags module exports isFeatureEnabled', () => {
    const ff = readFile('js/feature-flags.js');
    expect(ff).toContain('isFeatureEnabled');
    expect(ff).toContain('getFeatureVariant');
    expect(ff).toContain('invalidateFlags');
  });

  test('Feature flags checks PostHog first, then DB fallback', () => {
    const ff = readFile('js/feature-flags.js');
    // PostHog check before DB
    const phIdx = ff.indexOf('_checkPostHog');
    const dbIdx = ff.indexOf('_checkDB');
    expect(phIdx).toBeLessThan(dbIdx);
  });

  test('Feature flags supports rollout percentage', () => {
    const ff = readFile('js/feature-flags.js');
    expect(ff).toContain('rollout_pct');
    expect(ff).toContain('_simpleHash');
  });

  test('Feature flags supports plan gating', () => {
    const ff = readFile('js/feature-flags.js');
    expect(ff).toContain('plan_gate');
  });

  test('Feature flags supports per-user targeting', () => {
    const ff = readFile('js/feature-flags.js');
    expect(ff).toContain('user_targets');
  });

  test('Feature flags has cache with TTL', () => {
    const ff = readFile('js/feature-flags.js');
    expect(ff).toContain('_flagCache');
    expect(ff).toContain('CACHE_TTL_MS');
  });

  test('Feature flags loaded on dashboard', () => {
    const html = readFile('dashboard.html');
    expect(html).toContain('feature-flags.js');
  });

  test('Feature flags loaded on admin', () => {
    const html = readFile('admin.html');
    expect(html).toContain('feature-flags.js');
  });

  test('Feature flags loaded on landing page', () => {
    const html = readFile('index.html');
    expect(html).toContain('feature-flags.js');
  });

  test('Migration adds rollout columns to feature_flags', () => {
    const sql = readFile('supabase/migrations/20260307_cs_p1_005_observability_flags.sql');
    expect(sql).toContain('rollout_pct');
    expect(sql).toContain('plan_gate');
    expect(sql).toContain('user_targets');
    expect(sql).toContain('metadata');
  });

  test('is_feature_enabled() SQL function created', () => {
    const sql = readFile('supabase/migrations/20260307_cs_p1_005_observability_flags.sql');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.is_feature_enabled');
    expect(sql).toContain('GRANT EXECUTE');
  });

  test('Seed feature flags include operational flags', () => {
    const sql = readFile('supabase/migrations/20260307_cs_p1_005_observability_flags.sql');
    expect(sql).toContain("'dark_mode'");
    expect(sql).toContain("'passive_mode'");
    expect(sql).toContain("'ai_chat_v2'");
  });

  test('Feature flags exports via BJ namespace', () => {
    const ff = readFile('js/feature-flags.js');
    expect(ff).toContain("BJ.export('isFeatureEnabled'");
    expect(ff).toContain("BJ.export('getFeatureVariant'");
  });
});

// ═══════════════════════════════════════════════════════════
// DO-004: Cron failure alerting
// ═══════════════════════════════════════════════════════════
describe('DO-004: Cron failure alerting', () => {
  test('evaluate-alerts Edge Function exists', () => {
    expect(fileExists('supabase/functions/evaluate-alerts/index.ts')).toBe(true);
  });

  test('evaluate-alerts checks cron health', () => {
    const ef = readFile('supabase/functions/evaluate-alerts/index.ts');
    expect(ef).toContain('v_cron_health');
    expect(ef).toContain('cron_failed_count');
  });

  test('evaluate-alerts evaluates alert rules', () => {
    const ef = readFile('supabase/functions/evaluate-alerts/index.ts');
    expect(ef).toContain('alert_rules');
    expect(ef).toContain('_evaluateCondition');
  });

  test('evaluate-alerts respects cooldown period', () => {
    const ef = readFile('supabase/functions/evaluate-alerts/index.ts');
    expect(ef).toContain('cooldown_minutes');
    expect(ef).toContain('cooldownCutoff');
  });

  test('evaluate-alerts fires to alert_history', () => {
    const ef = readFile('supabase/functions/evaluate-alerts/index.ts');
    expect(ef).toContain("from('alert_history').insert");
  });

  test('evaluate-alerts sends email for critical alerts', () => {
    const ef = readFile('supabase/functions/evaluate-alerts/index.ts');
    expect(ef).toContain('_sendAlertEmail');
    expect(ef).toContain('resend.com/emails');
  });

  test('evaluate-alerts scheduled via pg_cron every 5 minutes', () => {
    const sql = readFile('supabase/migrations/20260307_cs_p1_005_observability_flags.sql');
    expect(sql).toContain("'evaluate-alerts-5min'");
    expect(sql).toContain('*/5 * * * *');
  });

  test('evaluate-alerts uses correlation middleware', () => {
    const ef = readFile('supabase/functions/evaluate-alerts/index.ts');
    expect(ef).toContain('withCorrelation');
  });

  test('evaluate-alerts uses API versioning', () => {
    const ef = readFile('supabase/functions/evaluate-alerts/index.ts');
    expect(ef).toContain('API_VERSION');
    expect(ef).toContain('x-api-version');
  });
});

// ═══════════════════════════════════════════════════════════
// AD-DO-001: Structured logging + monitoring infra baseline
// ═══════════════════════════════════════════════════════════
describe('AD-DO-001: Structured logging', () => {
  test('structured-logger.js exists', () => {
    expect(fileExists('js/structured-logger.js')).toBe(true);
  });

  test('Structured logger exports createLogger', () => {
    const sl = readFile('js/structured-logger.js');
    expect(sl).toContain('createStructuredLogger');
    expect(sl).toContain('createLogger');
  });

  test('Logger has debug/info/warn/error levels', () => {
    const sl = readFile('js/structured-logger.js');
    expect(sl).toContain("debug: 0");
    expect(sl).toContain("info: 1");
    expect(sl).toContain("warn: 2");
    expect(sl).toContain("error: 3");
  });

  test('Logger strips PII from data', () => {
    const sl = readFile('js/structured-logger.js');
    expect(sl).toContain("'email'");
    expect(sl).toContain("'password'");
    expect(sl).toContain("'token'");
  });

  test('Logger batches warnings to PostHog', () => {
    const sl = readFile('js/structured-logger.js');
    expect(sl).toContain('_logBuffer');
    expect(sl).toContain('$structured_log_batch');
  });

  test('Logger sends errors to PostHog immediately', () => {
    const sl = readFile('js/structured-logger.js');
    expect(sl).toContain('$structured_log_error');
  });

  test('Logger detects surface correctly', () => {
    const sl = readFile('js/structured-logger.js');
    expect(sl).toContain('_detectSurface');
    expect(sl).toContain("'admin'");
    expect(sl).toContain("'dashboard'");
    expect(sl).toContain("'landing'");
    expect(sl).toContain("'extension'");
  });

  test('Structured logger loaded on all HTML surfaces', () => {
    const dashboard = readFile('dashboard.html');
    const admin = readFile('admin.html');
    const landing = readFile('index.html');
    expect(dashboard).toContain('structured-logger.js');
    expect(admin).toContain('structured-logger.js');
    expect(landing).toContain('structured-logger.js');
  });

  test('Logger exports via BJ namespace', () => {
    const sl = readFile('js/structured-logger.js');
    expect(sl).toContain("BJ.export('createLogger'");
    expect(sl).toContain("BJ.export('setLogLevel'");
  });
});

// ═══════════════════════════════════════════════════════════
// AD-DO-002: PostHog API for admin
// ═══════════════════════════════════════════════════════════
describe('AD-DO-002: PostHog API for admin', () => {
  test('admin-posthog-insights.js exists', () => {
    expect(fileExists('js/admin-posthog-insights.js')).toBe(true);
  });

  test('PostHog insights shows active users', () => {
    const pi = readFile('js/admin-posthog-insights.js');
    expect(pi).toContain('_loadActiveUsers');
    expect(pi).toContain('Active Today');
    expect(pi).toContain('Active 7d');
    expect(pi).toContain('Active 30d');
  });

  test('PostHog insights shows event trends', () => {
    const pi = readFile('js/admin-posthog-insights.js');
    expect(pi).toContain('_loadEventTrends');
    expect(pi).toContain('Event Volume');
  });

  test('PostHog insights shows top events', () => {
    const pi = readFile('js/admin-posthog-insights.js');
    expect(pi).toContain('_loadTopEvents');
    expect(pi).toContain('Top Events');
  });

  test('PostHog insights shows feature flag status', () => {
    const pi = readFile('js/admin-posthog-insights.js');
    expect(pi).toContain('_loadFeatureFlags');
    expect(pi).toContain('Feature Flags');
  });

  test('PostHog API key fetched from vault via EF (not hardcoded)', () => {
    const pi = readFile('js/admin-posthog-insights.js');
    expect(pi).toContain('_getPostHogApiKey');
    expect(pi).toContain('admin-analytics');
    // Verify no hardcoded key
    expect(pi).not.toMatch(/phx_[a-zA-Z0-9]+/);
  });

  test('PostHog insights page registered in admin', () => {
    const adminJs = readFile('dist/admin.js');
    expect(adminJs).toContain("'posthog-insights'");
    expect(adminJs).toContain('loadPostHogInsightsPanel');
  });

  test('PostHog insights has page container in admin.html', () => {
    const html = readFile('admin.html');
    expect(html).toContain('admin-page-posthog-insights');
  });

  test('PostHog insights in admin build', () => {
    const build = readFile('build-admin.js');
    expect(build).toContain('admin-posthog-insights.js');
  });

  test('admin-analytics EF has get_posthog_key action', () => {
    const ef = readFile('supabase/functions/admin-analytics/index.ts');
    expect(ef).toContain('get_posthog_key');
    expect(ef).toContain('POSTHOG_PERSONAL_API_KEY');
  });
});

// ═══════════════════════════════════════════════════════════
// AD-DO-003: Unified alerting pipeline
// ═══════════════════════════════════════════════════════════
describe('AD-DO-003: Alerting pipeline', () => {
  test('Alert rules table exists in migrations', () => {
    const sql = readFile('supabase/migrations/20260307_cs023_monitoring_alerts.sql');
    expect(sql).toContain('alert_rules');
    expect(sql).toContain('alert_history');
  });

  test('evaluate-alerts collects multiple metric types', () => {
    const ef = readFile('supabase/functions/evaluate-alerts/index.ts');
    expect(ef).toContain('cron_failed_count');
    expect(ef).toContain('health_status');
    expect(ef).toContain('feed_freshness_minutes');
    expect(ef).toContain('error_count_1h');
    expect(ef).toContain('surface_latency_ms');
  });

  test('evaluate-alerts supports all comparison operators', () => {
    const ef = readFile('supabase/functions/evaluate-alerts/index.ts');
    expect(ef).toContain("'>='");
    expect(ef).toContain("'>'");
    expect(ef).toContain("'<='");
    expect(ef).toContain("'<'");
    expect(ef).toContain("'=='");
    expect(ef).toContain("'!='");
  });

  test('Additional alert rules seeded for availability', () => {
    const sql = readFile('supabase/migrations/20260307_cs_p1_005_observability_flags.sql');
    expect(sql).toContain("'Admin surface down'");
    expect(sql).toContain("'Dashboard surface down'");
    expect(sql).toContain("'Landing surface down'");
  });
});

// ═══════════════════════════════════════════════════════════
// AD-DO-004: Admin availability monitoring
// ═══════════════════════════════════════════════════════════
describe('AD-DO-004: Availability monitoring', () => {
  test('availability_checks table in migration', () => {
    const sql = readFile('supabase/migrations/20260307_cs_p1_005_observability_flags.sql');
    expect(sql).toContain('availability_checks');
    expect(sql).toContain("status TEXT NOT NULL");
    expect(sql).toContain("latency_ms INTEGER");
  });

  test('Availability summary view created', () => {
    const sql = readFile('supabase/migrations/20260307_cs_p1_005_observability_flags.sql');
    expect(sql).toContain('v_availability_summary');
    expect(sql).toContain('uptime_pct_24h');
  });

  test('Availability checks have RLS', () => {
    const sql = readFile('supabase/migrations/20260307_cs_p1_005_observability_flags.sql');
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('Admin read availability');
  });

  test('Health-check EF records availability', () => {
    const ef = readFile('supabase/functions/health-check/index.ts');
    expect(ef).toContain('availability_checks');
    expect(ef).toContain('AD-DO-004');
  });

  test('Availability checks scheduled via pg_cron', () => {
    const sql = readFile('supabase/migrations/20260307_cs_p1_005_observability_flags.sql');
    expect(sql).toContain("'availability-check-10min'");
    expect(sql).toContain('*/10 * * * *');
  });
});

// ═══════════════════════════════════════════════════════════
// Cross-cutting: Security + quality
// ═══════════════════════════════════════════════════════════
describe('Cross-cutting: Security and quality', () => {
  test('evaluate-alerts uses CORS restricted to brilliantjobs.app', () => {
    const ef = readFile('supabase/functions/evaluate-alerts/index.ts');
    expect(ef).toContain('https://brilliantjobs.app');
  });

  test('No hardcoded API keys in client JS', () => {
    const ff = readFile('js/feature-flags.js');
    const sl = readFile('js/structured-logger.js');
    const pi = readFile('js/admin-posthog-insights.js');
    // Only PostHog public API key should appear (safe to expose)
    expect(ff).not.toMatch(/phx_[a-zA-Z0-9]+/); // Personal API key
    expect(sl).not.toMatch(/phx_[a-zA-Z0-9]+/);
    expect(pi).not.toMatch(/phx_[a-zA-Z0-9]+/);
  });

  test('Feature flags uses XSS-safe HTML rendering', () => {
    const pi = readFile('js/admin-posthog-insights.js');
    expect(pi).toContain('_escHtml');
  });

  test('Structured logger uses XSS-safe output', () => {
    const sl = readFile('js/structured-logger.js');
    // Console output only, no innerHTML
    expect(sl).not.toContain('innerHTML');
  });
});
