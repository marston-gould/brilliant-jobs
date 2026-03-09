/* ───────────────────────────────────────────────────────────
   admin-chat-analytics.js — PostHog Chat Mode Dashboard
   POST-REM: PostHog dashboard for all 16 chat events
   (13 original + 3 Session 11).

   Funnels: toggle → message → filters applied,
   saved prompt adoption, rate limit frequency by tier.
   Latency percentile charts (p50, p95, p99).
   Tooltip conversion: shown → dismissed by method.
   ─────────────────────────────────────────────────────────── */

var _chatAnalyticsTimer = null;
var _chatAnalyticsRefreshInterval = 120000; // 2 min

// ─── All 16 chat events ───
var CHAT_EVENTS = [
  // Original 13
  'chat_mode_toggled',
  'chat_message_sent',
  'chat_filters_extracted',
  'chat_filters_applied',
  'chat_to_filter_sync',
  'chat_prompt_auto_generated',
  'chat_prompt_modified',
  'chat_prompt_saved',
  'chat_prompt_loaded',
  'chat_prompt_deleted',
  'chat_prompt_resume_assigned',
  'chat_edge_function_latency',
  'chat_rate_limited',
  // Session 11 additions
  'chat_onboarding_tooltip_shown',
  'chat_onboarding_tooltip_dismissed',
  'chat_prompt_scrapped'
];

// ─── Render ───
async function refreshChatAnalytics() {
  var container = document.getElementById('admin-page-chat-analytics');
  if (!container) return;

  try {
    var sb = loadSupabase();
    var session = (await sb.auth.getSession()).data.session;
    if (!session) {
      container.innerHTML = '<div class="admin-empty-state"><div class="admin-empty-state-title">Authentication Required</div></div>';
      return;
    }

    // Fetch aggregated event data from admin-analytics EF
    var res = await fetch(
      (typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : 'https://qojhagupdnbtomfoxnsf.supabase.co') +
      '/functions/v1/api-gateway/admin-analytics?action=chat_analytics',
      {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer ' + session.access_token,
          'apikey': typeof SUPABASE_KEY !== 'undefined' ? SUPABASE_KEY : ''
        }
      }
    );

    var data = {};
    if (res.ok) {
      data = await res.json();
    }

    // Build dashboard HTML
    var html = '<div class="admin-section-header"><h2>Chat Mode Analytics</h2>';
    html += '<span class="admin-badge admin-badge-info">16 events tracked</span>';
    html += '<button class="admin-btn admin-btn-sm" onclick="refreshChatAnalytics()">Refresh</button></div>';

    // ─── Summary Cards ───
    html += '<div class="admin-stat-row">';
    html += _chatStatCard('Toggles (24h)', data.toggles_24h || 0, 'chat_mode_toggled');
    html += _chatStatCard('Messages (24h)', data.messages_24h || 0, 'chat_message_sent');
    html += _chatStatCard('Filters Applied (24h)', data.filters_applied_24h || 0, 'chat_filters_applied');
    html += _chatStatCard('Rate Limited (24h)', data.rate_limited_24h || 0, 'chat_rate_limited');
    html += _chatStatCard('Prompts Saved (24h)', data.prompts_saved_24h || 0, 'chat_prompt_saved');
    html += _chatStatCard('Tooltip Shows (24h)', data.tooltip_shown_24h || 0, 'chat_onboarding_tooltip_shown');
    html += '</div>';

    // ─── Funnel: Toggle → Message → Filters ───
    html += '<div class="admin-card" style="margin-top:16px;">';
    html += '<h3>Core Funnel: Toggle → Message → Filters Applied</h3>';
    html += _renderFunnel([
      { label: 'Mode Toggled', count: data.funnel_toggle || 0 },
      { label: 'Message Sent', count: data.funnel_message || 0 },
      { label: 'Filters Applied', count: data.funnel_filters || 0 }
    ]);
    html += '</div>';

    // ─── Funnel: Saved Prompt Adoption ───
    html += '<div class="admin-card" style="margin-top:16px;">';
    html += '<h3>Saved Prompt Adoption</h3>';
    html += _renderFunnel([
      { label: 'Prompt Saved', count: data.prompt_saved_total || 0 },
      { label: 'Prompt Loaded', count: data.prompt_loaded_total || 0 },
      { label: 'Resume Assigned', count: data.prompt_resume_assigned_total || 0 }
    ]);
    html += '</div>';

    // ─── Tooltip Conversion ───
    html += '<div class="admin-card" style="margin-top:16px;">';
    html += '<h3>Tooltip Conversion: Shown → Dismissed</h3>';
    var tooltipShown = data.tooltip_shown_total || 0;
    var tooltipDismissedButton = data.tooltip_dismissed_button || 0;
    var tooltipDismissedToggle = data.tooltip_dismissed_toggle || 0;
    var tooltipTotal = tooltipDismissedButton + tooltipDismissedToggle;
    var tooltipRate = tooltipShown > 0 ? ((tooltipTotal / tooltipShown) * 100).toFixed(1) : '0.0';
    html += '<div class="admin-stat-row">';
    html += '<div class="admin-stat-card"><div class="admin-stat-value">' + tooltipShown + '</div><div class="admin-stat-label">Shown</div></div>';
    html += '<div class="admin-stat-card"><div class="admin-stat-value">' + tooltipDismissedButton + '</div><div class="admin-stat-label">Dismissed (button)</div></div>';
    html += '<div class="admin-stat-card"><div class="admin-stat-value">' + tooltipDismissedToggle + '</div><div class="admin-stat-label">Dismissed (toggle)</div></div>';
    html += '<div class="admin-stat-card"><div class="admin-stat-value">' + tooltipRate + '%</div><div class="admin-stat-label">Conversion Rate</div></div>';
    html += '</div></div>';

    // ─── Rate Limit Frequency by Tier ───
    html += '<div class="admin-card" style="margin-top:16px;">';
    html += '<h3>Rate Limits by Tier (7d)</h3>';
    html += '<table class="admin-table"><thead><tr><th>Tier</th><th>Count</th><th>% of Total</th><th>Avg Limit Type</th></tr></thead><tbody>';
    var rateTiers = data.rate_limits_by_tier || {};
    var totalRateLimits = Object.values(rateTiers).reduce(function(sum, v) { return sum + (v.count || 0); }, 0) || 1;
    ['free', 'starter', 'pro', 'admin'].forEach(function(tier) {
      var tierData = rateTiers[tier] || { count: 0, primary_type: 'n/a' };
      var pct = ((tierData.count / totalRateLimits) * 100).toFixed(1);
      html += '<tr><td><span class="admin-badge admin-badge-' + (tier === 'free' ? 'warn' : tier === 'pro' ? 'success' : 'info') + '">' + tier + '</span></td>';
      html += '<td>' + tierData.count + '</td><td>' + pct + '%</td><td>' + (tierData.primary_type || 'daily') + '</td></tr>';
    });
    html += '</tbody></table></div>';

    // ─── Latency Percentile Chart ───
    html += '<div class="admin-card" style="margin-top:16px;">';
    html += '<h3>Edge Function Latency (7d)</h3>';
    html += '<div class="admin-stat-row">';
    var latency = data.latency || {};
    html += '<div class="admin-stat-card"><div class="admin-stat-value" style="color:' + (latency.p50 > 1000 ? 'var(--bj-warning)' : 'var(--bj-success)') + '">' + (latency.p50 || '—') + 'ms</div><div class="admin-stat-label">p50</div></div>';
    html += '<div class="admin-stat-card"><div class="admin-stat-value" style="color:' + (latency.p95 > 2000 ? 'var(--bj-danger)' : 'var(--bj-success)') + '">' + (latency.p95 || '—') + 'ms</div><div class="admin-stat-label">p95</div></div>';
    html += '<div class="admin-stat-card"><div class="admin-stat-value" style="color:' + (latency.p99 > 3000 ? 'var(--bj-danger)' : 'var(--bj-warning)') + '">' + (latency.p99 || '—') + 'ms</div><div class="admin-stat-label">p99</div></div>';
    html += '<div class="admin-stat-card"><div class="admin-stat-value">' + (latency.total_samples || 0) + '</div><div class="admin-stat-label">Samples</div></div>';
    html += '</div>';

    // Latency trend sparkline (SVG)
    var latencyTrend = data.latency_trend || [];
    if (latencyTrend.length > 1) {
      html += _renderLatencySparkline(latencyTrend);
    }

    // p95 alert status
    if (latency.p95 && latency.p95 > 2000) {
      html += '<div class="admin-alert admin-alert-danger" style="margin-top:12px;">';
      html += '<i data-lucide="triangle-alert" class="icon-xs icon-stroke" style="color:var(--warm)"></i> p95 latency (' + latency.p95 + 'ms) exceeds 2000ms target. PostHog alert should fire.';
      html += '</div>';
    }
    html += '</div>';

    // ─── Event Volume Table (all 16) ───
    html += '<div class="admin-card" style="margin-top:16px;">';
    html += '<h3>Event Volume (7d)</h3>';
    html += '<table class="admin-table"><thead><tr><th>Event</th><th>24h</th><th>7d</th><th>Trend</th></tr></thead><tbody>';
    var eventVolumes = data.event_volumes || {};
    CHAT_EVENTS.forEach(function(evt) {
      var vol = eventVolumes[evt] || { day: 0, week: 0, trend: 'flat' };
      var trendIcon = vol.trend === 'up' ? '↑' : vol.trend === 'down' ? '↓' : '→';
      var trendColor = vol.trend === 'up' ? 'var(--bj-success)' : vol.trend === 'down' ? 'var(--bj-danger)' : 'var(--text-secondary)';
      html += '<tr><td><code>' + evt + '</code></td>';
      html += '<td>' + vol.day + '</td><td>' + vol.week + '</td>';
      html += '<td style="color:' + trendColor + '">' + trendIcon + '</td></tr>';
    });
    html += '</tbody></table></div>';

    // ─── Cache Hit Rate (from EF cost monitor) ───
    html += '<div class="admin-card" style="margin-top:16px;">';
    html += '<h3>Response Cache Performance</h3>';
    var cache = data.cache || {};
    html += '<div class="admin-stat-row">';
    html += '<div class="admin-stat-card"><div class="admin-stat-value">' + (cache.hit_rate || '0.0') + '%</div><div class="admin-stat-label">Hit Rate</div></div>';
    html += '<div class="admin-stat-card"><div class="admin-stat-value">' + (cache.hits || 0) + '</div><div class="admin-stat-label">Cache Hits (24h)</div></div>';
    html += '<div class="admin-stat-card"><div class="admin-stat-value">' + (cache.misses || 0) + '</div><div class="admin-stat-label">Cache Misses (24h)</div></div>';
    html += '<div class="admin-stat-card"><div class="admin-stat-value">$' + (cache.estimated_savings || '0.00') + '</div><div class="admin-stat-label">Est. Savings (24h)</div></div>';
    html += '</div></div>';

    container.innerHTML = html;

  } catch (e) {
    if (typeof reportError === 'function') reportError('admin-chat-analytics:refresh', e);
    container.innerHTML = '<div class="admin-empty-state"><div class="admin-empty-state-title">Error Loading</div><div class="admin-empty-state-desc">' + (e.message || 'Unknown error') + '</div></div>';
  }
}

// ─── Helpers ───

function _chatStatCard(label, value, eventName) {
  return '<div class="admin-stat-card" title="Event: ' + eventName + '">' +
    '<div class="admin-stat-value">' + value + '</div>' +
    '<div class="admin-stat-label">' + label + '</div></div>';
}

function _renderFunnel(steps) {
  var html = '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">';
  steps.forEach(function(step, i) {
    var pct = i > 0 && steps[i - 1].count > 0
      ? ((step.count / steps[i - 1].count) * 100).toFixed(1)
      : '100.0';
    var barWidth = steps[0].count > 0 ? Math.max(10, (step.count / steps[0].count) * 100) : 10;
    html += '<div style="flex:1;min-width:120px;">';
    html += '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:4px;">' + step.label + '</div>';
    html += '<div style="font-size:24px;font-weight:600;color:var(--text-primary);">' + step.count + '</div>';
    html += '<div style="height:8px;background:var(--bg-card-hover);border-radius:4px;margin-top:4px;">';
    html += '<div style="height:100%;width:' + barWidth + '%;background:var(--bj-primary);border-radius:4px;"></div></div>';
    if (i > 0) {
      html += '<div style="font-size:11px;color:var(--text-tertiary);margin-top:2px;">' + pct + '% conversion</div>';
    }
    html += '</div>';
    if (i < steps.length - 1) {
      html += '<div style="color:var(--text-tertiary);font-size:18px;">→</div>';
    }
  });
  html += '</div>';
  return html;
}

function _renderLatencySparkline(trend) {
  // trend = [{ ts, p50, p95, p99 }]
  if (!trend.length) return '';
  var w = 400, h = 80, pad = 4;
  var maxVal = 0;
  trend.forEach(function(t) {
    maxVal = Math.max(maxVal, t.p99 || 0, t.p95 || 0, t.p50 || 0);
  });
  if (maxVal === 0) maxVal = 1;

  function points(key) {
    return trend.map(function(t, i) {
      var x = pad + (i / (trend.length - 1)) * (w - pad * 2);
      var y = h - pad - ((t[key] || 0) / maxVal) * (h - pad * 2);
      return x + ',' + y;
    }).join(' ');
  }

  var svg = '<svg viewBox="0 0 ' + w + ' ' + h + '" style="width:100%;max-width:400px;height:80px;margin-top:8px;">';
  // p99 line (lightest)
  svg += '<polyline points="' + points('p99') + '" fill="none" stroke="var(--bj-danger)" stroke-width="1" stroke-dasharray="4,2" opacity="0.5"/>';
  // p95 line
  svg += '<polyline points="' + points('p95') + '" fill="none" stroke="var(--bj-warning)" stroke-width="1.5"/>';
  // p50 line (darkest)
  svg += '<polyline points="' + points('p50') + '" fill="none" stroke="var(--bj-success)" stroke-width="2"/>';
  // 2000ms target line
  var targetY = h - pad - (2000 / maxVal) * (h - pad * 2);
  if (targetY > pad && targetY < h - pad) {
    svg += '<line x1="' + pad + '" y1="' + targetY + '" x2="' + (w - pad) + '" y2="' + targetY + '" stroke="var(--bj-danger)" stroke-width="0.5" stroke-dasharray="2,2"/>';
    svg += '<text x="' + (w - pad) + '" y="' + (targetY - 2) + '" font-size="9" fill="var(--bj-danger)" text-anchor="end">2000ms target</text>';
  }
  svg += '</svg>';
  svg += '<div style="font-size:11px;color:var(--text-tertiary);display:flex;gap:16px;margin-top:4px;">';
  svg += '<span style="color:var(--bj-success);">━ p50</span>';
  svg += '<span style="color:var(--bj-warning);">━ p95</span>';
  svg += '<span style="color:var(--bj-danger);">╌ p99</span>';
  svg += '</div>';
  return svg;
}

// ─── Lifecycle ───
function startChatAnalyticsPolling() {
  refreshChatAnalytics();
  _chatAnalyticsTimer = setInterval(refreshChatAnalytics, _chatAnalyticsRefreshInterval);
}

function stopChatAnalyticsPolling() {
  if (_chatAnalyticsTimer) {
    clearInterval(_chatAnalyticsTimer);
    _chatAnalyticsTimer = null;
  }
}

// Wire into admin shell page switching
if (typeof window._adminPageCallbacks === 'undefined') {
  window._adminPageCallbacks = {};
}
window._adminPageCallbacks['chat-analytics'] = {
  show: startChatAnalyticsPolling,
  hide: stopChatAnalyticsPolling
};
