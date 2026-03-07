/* ───────────────────────────────────────────────────────────
   admin-posthog-insights.js — PostHog API for Admin (AD-DO-002)
   CS-P1-005: Wire PostHog REST API into admin dashboards.
   
   Shows: active users (24h/7d/30d), event trends, top events,
   feature flag status, session replay summary.
   
   Requires: POSTHOG_PERSONAL_API_KEY in admin session or
   fetched from Supabase Vault at runtime.
   ─────────────────────────────────────────────────────────── */

var _phInsightsTimer = null;
var _phApiBase = 'https://us.posthog.com';
var _phProjectId = '318006';

// PostHog Personal API key — fetched from vault via EF, never hardcoded
var _phApiKey = null;

async function _getPostHogApiKey() {
  if (_phApiKey) return _phApiKey;
  // Fetch from admin-analytics EF which reads from Vault
  try {
    var sb = loadSupabase();
    var session = (await sb.auth.getSession()).data.session;
    if (!session) return null;

    var res = await fetch(
      (typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : 'https://qojhagupdnbtomfoxnsf.supabase.co') +
      '/functions/v1/admin-analytics?action=get_posthog_key',
      {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer ' + session.access_token,
          'apikey': typeof SUPABASE_KEY !== 'undefined' ? SUPABASE_KEY : ''
        }
      }
    );
    if (res.ok) {
      var data = await res.json();
      _phApiKey = data.key || null;
    }
  } catch (e) {
    if (typeof reportError === 'function') reportError('admin-posthog:key', e);
  }
  return _phApiKey;
}

async function _phApiFetch(endpoint, params) {
  var key = await _getPostHogApiKey();
  if (!key) return null;

  var url = _phApiBase + '/api/projects/' + _phProjectId + endpoint;
  if (params) {
    var qs = Object.keys(params).map(function(k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
    }).join('&');
    url += '?' + qs;
  }

  try {
    var res = await fetch(url, {
      headers: { 'Authorization': 'Bearer ' + key }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    if (typeof reportError === 'function') reportError('admin-posthog:api', e);
    return null;
  }
}

async function loadPostHogInsightsPanel() {
  var el = document.getElementById('admin-page-posthog-insights');
  if (!el) return;

  el.innerHTML = [
    '<div class="admin-block">',
    '  <div class="admin-block-header">',
    '    <h2 class="admin-block-title">PostHog Insights</h2>',
    '    <div class="admin-block-actions">',
    '      <span id="ph-last-refresh" style="font-size:12px;color:var(--muted);margin-right:8px;"></span>',
    '      <button class="admin-btn admin-btn-sm" id="ph-refresh-btn">↻ Refresh</button>',
    '    </div>',
    '  </div>',
    '',
    '  <!-- Active Users Cards -->',
    '  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px;" id="ph-active-users">',
    '    <div class="admin-metric-card" id="ph-dau"><div class="admin-metric-label">Active Today</div><div class="admin-metric-value">—</div></div>',
    '    <div class="admin-metric-card" id="ph-wau"><div class="admin-metric-label">Active 7d</div><div class="admin-metric-value">—</div></div>',
    '    <div class="admin-metric-card" id="ph-mau"><div class="admin-metric-label">Active 30d</div><div class="admin-metric-value">—</div></div>',
    '  </div>',
    '',
    '  <!-- Event Trends -->',
    '  <div style="background:var(--bg-input);border-radius:10px;border:1px solid var(--border);padding:16px;margin-bottom:20px;">',
    '    <div style="font-size:13px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px;">Event Volume (7 days)</div>',
    '    <div id="ph-event-chart" style="height:200px;display:flex;align-items:flex-end;gap:4px;">',
    '      <div style="text-align:center;color:var(--muted);font-size:13px;width:100%;padding:80px 0;">Loading…</div>',
    '    </div>',
    '  </div>',
    '',
    '  <!-- Top Events -->',
    '  <div style="background:var(--bg-input);border-radius:10px;border:1px solid var(--border);padding:16px;margin-bottom:20px;">',
    '    <div style="font-size:13px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px;">Top Events (24h)</div>',
    '    <div id="ph-top-events">',
    '      <div style="text-align:center;color:var(--muted);font-size:13px;padding:12px;">Loading…</div>',
    '    </div>',
    '  </div>',
    '',
    '  <!-- Feature Flags Status -->',
    '  <div style="background:var(--bg-input);border-radius:10px;border:1px solid var(--border);padding:16px;">',
    '    <div style="font-size:13px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px;">Feature Flags</div>',
    '    <div id="ph-flags-body">',
    '      <div style="text-align:center;color:var(--muted);font-size:13px;padding:12px;">Loading…</div>',
    '    </div>',
    '  </div>',
    '',
    '</div>'
  ].join('\n');

  document.getElementById('ph-refresh-btn').addEventListener('click', _refreshPostHogInsights);
  await _refreshPostHogInsights();

  // Auto-refresh every 5 minutes
  _phInsightsTimer = setInterval(_refreshPostHogInsights, 5 * 60 * 1000);
}

function _cleanupPostHogInsights() {
  if (_phInsightsTimer) {
    clearInterval(_phInsightsTimer);
    _phInsightsTimer = null;
  }
}

async function _refreshPostHogInsights() {
  var ts = document.getElementById('ph-last-refresh');
  if (ts) ts.textContent = 'Refreshing…';

  await Promise.all([
    _loadActiveUsers(),
    _loadEventTrends(),
    _loadTopEvents(),
    _loadFeatureFlags()
  ]);

  if (ts) ts.textContent = 'Updated ' + new Date().toLocaleTimeString();
}

async function _loadActiveUsers() {
  // Use PostHog persons API or derive from events
  var periods = [
    { id: 'ph-dau', label: 'Active Today', days: 1 },
    { id: 'ph-wau', label: 'Active 7d', days: 7 },
    { id: 'ph-mau', label: 'Active 30d', days: 30 }
  ];

  for (var i = 0; i < periods.length; i++) {
    var p = periods[i];
    var el = document.getElementById(p.id);
    if (!el) continue;

    var afterDate = new Date(Date.now() - p.days * 86400000).toISOString().split('T')[0];
    var data = await _phApiFetch('/insights/trend/', {
      events: JSON.stringify([{ id: '$pageview', type: 'events', math: 'dau' }]),
      date_from: afterDate,
      date_to: new Date().toISOString().split('T')[0]
    });

    var count = '—';
    if (data && data.result && data.result[0] && data.result[0].data) {
      var values = data.result[0].data;
      count = String(values[values.length - 1] || 0);
    }

    el.querySelector('.admin-metric-value').textContent = count;
  }
}

async function _loadEventTrends() {
  var container = document.getElementById('ph-event-chart');
  if (!container) return;

  var fromDate = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  var data = await _phApiFetch('/insights/trend/', {
    events: JSON.stringify([{ id: '$pageview', type: 'events', math: 'total' }]),
    date_from: fromDate,
    date_to: new Date().toISOString().split('T')[0],
    interval: 'day'
  });

  if (!data || !data.result || !data.result[0]) {
    container.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:13px;width:100%;padding:80px 0;">Unable to load event data. Check API key.</div>';
    return;
  }

  var values = data.result[0].data || [];
  var labels = data.result[0].labels || [];
  var maxVal = Math.max.apply(null, values) || 1;

  var bars = '';
  for (var i = 0; i < values.length; i++) {
    var pct = Math.round((values[i] / maxVal) * 100);
    var day = labels[i] ? labels[i].split(' ')[0] : '';
    bars += '<div style="flex:1;display:flex;flex-direction:column;align-items:center;">' +
      '<div style="font-size:10px;color:var(--muted);margin-bottom:4px;">' + values[i] + '</div>' +
      '<div style="width:100%;height:' + Math.max(pct, 2) + '%;background:var(--accent, #6366f1);border-radius:4px 4px 0 0;min-height:4px;"></div>' +
      '<div style="font-size:10px;color:var(--muted);margin-top:4px;">' + day + '</div>' +
      '</div>';
  }

  container.innerHTML = bars;
  container.style.alignItems = 'flex-end';
}

async function _loadTopEvents() {
  var container = document.getElementById('ph-top-events');
  if (!container) return;

  // Use PostHog events API to get top event names
  var data = await _phApiFetch('/insights/trend/', {
    events: JSON.stringify([
      { id: '$pageview', type: 'events', math: 'total' },
      { id: '$autocapture', type: 'events', math: 'total' },
      { id: 'dashboard_tab_viewed', type: 'events', math: 'total' },
      { id: 'chat_mode_toggled', type: 'events', math: 'total' },
      { id: 'pricing_cta_clicked', type: 'events', math: 'total' },
      { id: 'referral_link_clicked', type: 'events', math: 'total' }
    ]),
    date_from: '-1d'
  });

  if (!data || !data.result) {
    container.innerHTML = '<div style="color:var(--muted);font-size:13px;text-align:center;padding:12px;">Unable to load events. Check API key.</div>';
    return;
  }

  var items = data.result
    .map(function(r) {
      var total = (r.data || []).reduce(function(a, b) { return a + b; }, 0);
      return { name: r.label || r.action?.id || '—', count: total };
    })
    .filter(function(r) { return r.count > 0; })
    .sort(function(a, b) { return b.count - a.count; });

  if (items.length === 0) {
    container.innerHTML = '<div style="color:var(--muted);font-size:13px;text-align:center;padding:12px;">No events in the last 24 hours.</div>';
    return;
  }

  var html = '<div style="display:flex;flex-direction:column;gap:6px;">';
  for (var i = 0; i < items.length; i++) {
    var pct = Math.round((items[i].count / items[0].count) * 100);
    html += '<div style="display:flex;align-items:center;gap:8px;">' +
      '<div style="font-size:13px;color:var(--text);min-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + _escHtml(items[i].name) + '</div>' +
      '<div style="flex:1;height:16px;background:var(--bg-main);border-radius:4px;overflow:hidden;">' +
        '<div style="height:100%;width:' + pct + '%;background:var(--accent, #6366f1);border-radius:4px;"></div>' +
      '</div>' +
      '<div style="font-size:12px;color:var(--muted);min-width:40px;text-align:right;">' + items[i].count + '</div>' +
    '</div>';
  }
  html += '</div>';
  container.innerHTML = html;
}

async function _loadFeatureFlags() {
  var container = document.getElementById('ph-flags-body');
  if (!container) return;

  // Load from DB feature_flags table (authoritative)
  var sb = loadSupabase();
  try {
    var { data: flags, error } = await sb
      .from('feature_flags')
      .select('id, enabled, description, rollout_pct, updated_at')
      .order('updated_at', { ascending: false });

    if (error) throw error;

    if (!flags || flags.length === 0) {
      container.innerHTML = '<div style="color:var(--muted);font-size:13px;text-align:center;padding:12px;">No feature flags configured.</div>';
      return;
    }

    var html = '<div style="display:flex;flex-direction:column;gap:8px;">';
    for (var i = 0; i < flags.length; i++) {
      var f = flags[i];
      var statusColor = f.enabled ? 'var(--success, #22c55e)' : 'var(--muted)';
      var statusIcon = f.enabled ? '🟢' : '⚫';
      var rollout = (f.rollout_pct != null && f.rollout_pct < 100) ? ' (' + f.rollout_pct + '%)' : '';

      html += '<div style="display:flex;align-items:center;gap:8px;padding:8px;background:var(--bg-main);border-radius:6px;">' +
        '<span>' + statusIcon + '</span>' +
        '<div style="flex:1;">' +
          '<div style="font-size:13px;font-weight:500;color:var(--text);">' + _escHtml(f.id) + rollout + '</div>' +
          '<div style="font-size:11px;color:var(--muted);">' + _escHtml(f.description || '') + '</div>' +
        '</div>' +
        '<div style="font-size:11px;color:var(--muted);">' + (f.updated_at ? new Date(f.updated_at).toLocaleDateString() : '') + '</div>' +
      '</div>';
    }
    html += '</div>';
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = '<div style="color:var(--danger, #ef4444);font-size:13px;padding:12px;">Error: ' + _escHtml(e.message) + '</div>';
  }
}

function _escHtml(s) {
  if (!s) return '';
  var d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
