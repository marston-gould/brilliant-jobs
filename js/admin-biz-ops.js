// === js/admin-biz-ops.js ===
// Admin IA v2 S10 — Paid, Social, Analytics, Costs, Forecasting
// v6.94 · 2026-03-04

// ─── PAID ────────────────────────────────────────────────────────────────────
async function loadPaidTab() {
  const el = document.getElementById('admin-page-paid');
  if (!el) return;
  el.innerHTML = `
    <div class="admin-block">
      <div class="admin-block-header">
        <h2 class="admin-block-title">Paid Acquisition</h2>
        <div class="admin-block-actions">
          <a href="https://ads.google.com" target="_blank" class="admin-btn admin-btn-sm">Google Ads ↗</a>
          <a href="https://www.facebook.com/adsmanager" target="_blank" class="admin-btn admin-btn-sm">Meta Ads ↗</a>
        </div>
      </div>
      <div class="admin-stat-row" id="paid-stat-row">
        ${_adminStatCard('Total Spend', '—', 'All time')}
        ${_adminStatCard('This Month', '—', 'MTD')}
        ${_adminStatCard('Campaigns', '—', 'Active')}
        ${_adminStatCard('Est. CAC', '—', 'Avg cost/signup')}
      </div>
    </div>
    <div class="admin-block">
      <div class="admin-block-header">
        <h2 class="admin-block-title">Spend Log</h2>
        <button class="admin-btn admin-btn-sm" id="paid-add-btn">+ Add Entry</button>
      </div>
      <div id="paid-add-form" style="display:none;padding:12px 0;border-bottom:1px solid var(--border);">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr auto;gap:8px;align-items:end;">
          <div>
            <label class="admin-label">Date</label>
            <input type="date" id="paid-form-date" class="admin-input" value="${new Date().toISOString().slice(0,10)}">
          </div>
          <div>
            <label class="admin-label">Platform</label>
            <select id="paid-form-platform" class="admin-input">
              <option value="Google Ads">Google Ads</option>
              <option value="Meta Ads">Meta Ads</option>
              <option value="LinkedIn Ads">LinkedIn Ads</option>
              <option value="Reddit Ads">Reddit Ads</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div>
            <label class="admin-label">Amount ($)</label>
            <input type="number" id="paid-form-amount" class="admin-input" placeholder="0.00" step="0.01">
          </div>
          <div>
            <label class="admin-label">Notes</label>
            <input type="text" id="paid-form-notes" class="admin-input" placeholder="Campaign name, audience...">
          </div>
          <div>
            <button class="admin-btn" id="paid-form-save">Save</button>
          </div>
        </div>
      </div>
      <div id="paid-log-container"><div class="admin-empty">No spend entries yet. Add your first entry above.</div></div>
    </div>`;

  await _loadPaidLog();

  document.getElementById('paid-add-btn').addEventListener('click', () => {
    const f = document.getElementById('paid-add-form');
    f.style.display = f.style.display === 'none' ? 'block' : 'none';
  });

  document.getElementById('paid-form-save').addEventListener('click', async () => {
    const date = document.getElementById('paid-form-date').value;
    const platform = document.getElementById('paid-form-platform').value;
    const amount = parseFloat(document.getElementById('paid-form-amount').value);
    const notes = document.getElementById('paid-form-notes').value;
    if (!date || !platform || isNaN(amount)) {
      _adminToast('Fill in date, platform, and amount.', 'error'); return;
    }
    const { error } = await sb.from('paid_spend_log').insert({ date, platform, amount, notes });
    if (error) { _adminToast('Save failed: ' + error.message, 'error'); return; }
    document.getElementById('paid-add-form').style.display = 'none';
    document.getElementById('paid-form-amount').value = '';
    document.getElementById('paid-form-notes').value = '';
    _adminToast('Entry saved.');
    await _loadPaidLog();
  });
}

async function _loadPaidLog() {
  const container = document.getElementById('paid-log-container');
  if (!container) return;

  const { data, error } = await sb.from('paid_spend_log')
    .select('*').order('date', { ascending: false }).limit(100);

  if (error || !data || data.length === 0) {
    container.innerHTML = '<div class="admin-empty">No spend entries yet.</div>';
    _updatePaidStats([], document.getElementById('paid-stat-row'));
    return;
  }

  _updatePaidStats(data, document.getElementById('paid-stat-row'));

  const rows = data.map(r => `
    <tr>
      <td>${_escHtml(r.date)}</td>
      <td>${_escHtml(r.platform)}</td>
      <td>$${parseFloat(r.amount).toFixed(2)}</td>
      <td>${_escHtml(r.notes || '—')}</td>
    </tr>`).join('');

  container.innerHTML = `
    <table class="admin-table">
      <thead><tr><th>Date</th><th>Platform</th><th>Amount</th><th>Notes</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function _updatePaidStats(data, el) {
  if (!el) return;
  const total = data.reduce((s, r) => s + parseFloat(r.amount || 0), 0);
  const now = new Date();
  const mtd = data.filter(r => {
    const d = new Date(r.date);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).reduce((s, r) => s + parseFloat(r.amount || 0), 0);
  const platforms = new Set(data.filter(r => {
    const d = new Date(r.date);
    const diff = (now - d) / 86400000;
    return diff <= 30;
  }).map(r => r.platform));

  el.innerHTML = `
    ${_adminStatCard('Total Spend', '$' + total.toFixed(2), 'All time')}
    ${_adminStatCard('This Month', '$' + mtd.toFixed(2), 'MTD')}
    ${_adminStatCard('Active Platforms', platforms.size.toString(), 'Last 30d')}
    ${_adminStatCard('Est. CAC', '—', 'Connect signups data')}`;
}

// ─── SOCIAL ──────────────────────────────────────────────────────────────────
async function loadSocialTab() {
  const el = document.getElementById('admin-page-social');
  if (!el) return;
  el.innerHTML = `
    <div class="admin-block">
      <div class="admin-block-header">
        <h2 class="admin-block-title">Social Media</h2>
        <div class="admin-block-actions">
          <a href="https://www.linkedin.com/in/marston-gould" target="_blank" class="admin-btn admin-btn-sm">LinkedIn ↗</a>
          <a href="https://twitter.com" target="_blank" class="admin-btn admin-btn-sm">X/Twitter ↗</a>
        </div>
      </div>
      <div class="admin-stat-row" id="social-stat-row">
        ${_adminStatCard('Posts Logged', '—', 'All time')}
        ${_adminStatCard('This Month', '—', 'MTD posts')}
        ${_adminStatCard('Total Engagements', '—', 'All logged')}
        ${_adminStatCard('Avg Engagement', '—', 'Per post')}
      </div>
    </div>
    <div class="admin-block">
      <div class="admin-block-header">
        <h2 class="admin-block-title">Post Log</h2>
        <button class="admin-btn admin-btn-sm" id="social-add-btn">+ Log Post</button>
      </div>
      <div id="social-add-form" style="display:none;padding:12px 0;border-bottom:1px solid var(--border);">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr auto;gap:8px;align-items:end;">
          <div>
            <label class="admin-label">Date</label>
            <input type="date" id="social-form-date" class="admin-input" value="${new Date().toISOString().slice(0,10)}">
          </div>
          <div>
            <label class="admin-label">Platform</label>
            <select id="social-form-platform" class="admin-input">
              <option value="LinkedIn">LinkedIn</option>
              <option value="X/Twitter">X/Twitter</option>
              <option value="Reddit">Reddit</option>
              <option value="TikTok">TikTok</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div>
            <label class="admin-label">Engagements</label>
            <input type="number" id="social-form-engagements" class="admin-input" placeholder="Likes + comments + shares" min="0">
          </div>
          <div>
            <label class="admin-label">Notes / URL</label>
            <input type="text" id="social-form-notes" class="admin-input" placeholder="Post topic or URL">
          </div>
          <div>
            <button class="admin-btn" id="social-form-save">Save</button>
          </div>
        </div>
      </div>
      <div id="social-log-container"><div class="admin-loading">Loading...</div></div>
    </div>`;

  await _loadSocialLog();

  document.getElementById('social-add-btn').addEventListener('click', () => {
    const f = document.getElementById('social-add-form');
    f.style.display = f.style.display === 'none' ? 'block' : 'none';
  });

  document.getElementById('social-form-save').addEventListener('click', async () => {
    const date = document.getElementById('social-form-date').value;
    const platform = document.getElementById('social-form-platform').value;
    const engagements = parseInt(document.getElementById('social-form-engagements').value) || 0;
    const notes = document.getElementById('social-form-notes').value;
    if (!date || !platform) { _adminToast('Fill in date and platform.', 'error'); return; }
    const { error } = await sb.from('social_post_log').insert({ date, platform, engagements, notes });
    if (error) { _adminToast('Save failed: ' + error.message, 'error'); return; }
    document.getElementById('social-add-form').style.display = 'none';
    document.getElementById('social-form-engagements').value = '';
    document.getElementById('social-form-notes').value = '';
    _adminToast('Post logged.');
    await _loadSocialLog();
  });
}

async function _loadSocialLog() {
  const container = document.getElementById('social-log-container');
  if (!container) return;

  const { data, error } = await sb.from('social_post_log')
    .select('*').order('date', { ascending: false }).limit(100);

  if (error || !data || data.length === 0) {
    container.innerHTML = '<div class="admin-empty">No posts logged yet.</div>';
    _updateSocialStats([], document.getElementById('social-stat-row'));
    return;
  }

  _updateSocialStats(data, document.getElementById('social-stat-row'));

  const rows = data.map(r => `
    <tr>
      <td>${_escHtml(r.date)}</td>
      <td>${_escHtml(r.platform)}</td>
      <td>${r.engagements || 0}</td>
      <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_escHtml(r.notes || '—')}</td>
    </tr>`).join('');

  container.innerHTML = `
    <table class="admin-table">
      <thead><tr><th>Date</th><th>Platform</th><th>Engagements</th><th>Notes</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function _updateSocialStats(data, el) {
  if (!el) return;
  const now = new Date();
  const mtd = data.filter(r => {
    const d = new Date(r.date);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });
  const totalEng = data.reduce((s, r) => s + (r.engagements || 0), 0);
  const avgEng = data.length ? (totalEng / data.length).toFixed(1) : '—';

  el.innerHTML = `
    ${_adminStatCard('Posts Logged', data.length.toString(), 'All time')}
    ${_adminStatCard('This Month', mtd.length.toString(), 'MTD posts')}
    ${_adminStatCard('Total Engagements', totalEng.toLocaleString(), 'All logged')}
    ${_adminStatCard('Avg Engagement', avgEng, 'Per post')}`;
}

// ─── ANALYTICS ───────────────────────────────────────────────────────────────
async function loadAnalyticsOverviewTab() {
  const el = document.getElementById('admin-page-analytics');
  if (!el) return;
  el.innerHTML = `
    <div class="admin-block">
      <div class="admin-block-header">
        <h2 class="admin-block-title">PostHog Analytics</h2>
        <div class="admin-block-actions">
          <a href="https://us.posthog.com/project/318006" target="_blank" class="admin-btn admin-btn-sm">Open PostHog ↗</a>
        </div>
      </div>
      <div class="admin-stat-row" id="analytics-stat-row">
        ${_adminStatCard('Total Users', '—', 'All time signups')}
        ${_adminStatCard('DAU', '—', 'Unique today')}
        ${_adminStatCard('WAU', '—', 'Unique last 7d')}
        ${_adminStatCard('MAU', '—', 'Unique last 30d')}
      </div>
    </div>
    <div class="admin-block">
      <div class="admin-block-header">
        <h2 class="admin-block-title">User Funnel</h2>
      </div>
      <div id="analytics-funnel-chart" style="height:280px;"></div>
    </div>
    <div class="admin-block">
      <div class="admin-block-header">
        <h2 class="admin-block-title">Signups Over Time</h2>
        <div class="admin-block-actions">
          <select id="analytics-period" class="admin-input admin-input-sm">
            <option value="30">Last 30d</option>
            <option value="90">Last 90d</option>
            <option value="180">Last 180d</option>
          </select>
        </div>
      </div>
      <div id="analytics-signups-chart" style="height:260px;"></div>
    </div>`;

  await _loadAnalyticsData();

  document.getElementById('analytics-period').addEventListener('change', _loadAnalyticsData);
}

async function _loadAnalyticsData() {
  const days = parseInt(document.getElementById('analytics-period')?.value || '30');
  const since = new Date(Date.now() - days * 86400000).toISOString();

  // Pull from profiles table for user stats
  const { data: allUsers } = await sb.from('profiles').select('id, created_at, last_seen_at').order('created_at');
  const { data: recentUsers } = await sb.from('profiles').select('id, created_at').gte('created_at', since);

  const now = new Date();
  const dau = allUsers ? allUsers.filter(u => {
    if (!u.last_seen_at) return false;
    return (now - new Date(u.last_seen_at)) < 86400000;
  }).length : 0;
  const wau = allUsers ? allUsers.filter(u => {
    if (!u.last_seen_at) return false;
    return (now - new Date(u.last_seen_at)) < 7 * 86400000;
  }).length : 0;
  const mau = allUsers ? allUsers.filter(u => {
    if (!u.last_seen_at) return false;
    return (now - new Date(u.last_seen_at)) < 30 * 86400000;
  }).length : 0;

  const statEl = document.getElementById('analytics-stat-row');
  if (statEl) {
    statEl.innerHTML = `
      ${_adminStatCard('Total Users', (allUsers?.length || 0).toString(), 'All time signups')}
      ${_adminStatCard('DAU', dau.toString(), 'Unique today')}
      ${_adminStatCard('WAU', wau.toString(), 'Unique last 7d')}
      ${_adminStatCard('MAU', mau.toString(), 'Unique last 30d')}`;
  }

  // Signups over time chart
  if (recentUsers && recentUsers.length > 0 && typeof echarts !== 'undefined') {
    const byDay = {};
    recentUsers.forEach(u => {
      const day = u.created_at.slice(0, 10);
      byDay[day] = (byDay[day] || 0) + 1;
    });
    const labels = Object.keys(byDay).sort();
    const values = labels.map(d => byDay[d]);

    const chartEl = document.getElementById('analytics-signups-chart');
    if (chartEl) {
      let chart = echarts.getInstanceByDom(chartEl) || echarts.init(chartEl, 'dark');
      chart.setOption({
        backgroundColor: 'transparent',
        tooltip: { trigger: 'axis' },
        grid: { left: 40, right: 20, top: 20, bottom: 40 },
        xAxis: { type: 'category', data: labels, axisLabel: { color: '#aaa', fontSize: 11 } },
        yAxis: { type: 'value', axisLabel: { color: '#aaa', fontSize: 11 }, minInterval: 1 },
        series: [{ name: 'Signups', type: 'bar', data: values, itemStyle: { color: '#00c896' } }]
      });
    }
  } else {
    const chartEl = document.getElementById('analytics-signups-chart');
    if (chartEl) chartEl.innerHTML = '<div class="admin-empty" style="padding:60px 0;text-align:center;">No signup data in this period.</div>';
  }

  // Funnel
  const funnelEl = document.getElementById('analytics-funnel-chart');
  if (funnelEl && typeof echarts !== 'undefined' && allUsers) {
    const total = allUsers.length;
    const approved = allUsers.filter(u => u.approved !== false).length;
    const active = mau;
    let chart = echarts.getInstanceByDom(funnelEl) || echarts.init(funnelEl, 'dark');
    chart.setOption({
      backgroundColor: 'transparent',
      tooltip: { trigger: 'item' },
      series: [{
        type: 'funnel', width: '60%', left: '20%', top: 20, bottom: 20,
        data: [
          { value: total, name: 'Signups', itemStyle: { color: '#3b7de8' } },
          { value: approved, name: 'Approved', itemStyle: { color: '#00c896' } },
          { value: active, name: 'MAU', itemStyle: { color: '#f59e0b' } }
        ]
      }]
    });
  }
}

// ─── COSTS ───────────────────────────────────────────────────────────────────
async function loadCostsTab() {
  const el = document.getElementById('admin-page-costs');
  if (!el) return;

  const VENDORS = ['Vercel', 'Supabase', 'DataForSEO', 'Cloudflare', 'Resend', 'Vonage', 'Anthropic', 'Other'];

  el.innerHTML = `
    <div class="admin-block">
      <div class="admin-block-header">
        <h2 class="admin-block-title">Vendor Costs</h2>
        <button class="admin-btn admin-btn-sm" id="costs-add-btn">+ Add Entry</button>
      </div>
      <div class="admin-stat-row" id="costs-stat-row">
        ${_adminStatCard('This Month', '—', 'Total MTD')}
        ${_adminStatCard('Last Month', '—', 'Total')}
        ${_adminStatCard('Largest Vendor', '—', 'This month')}
        ${_adminStatCard('MoM Change', '—', 'vs last month')}
      </div>
      <div id="costs-add-form" style="display:none;padding:12px 0;border-bottom:1px solid var(--border);">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr auto;gap:8px;align-items:end;">
          <div>
            <label class="admin-label">Month (YYYY-MM)</label>
            <input type="month" id="costs-form-month" class="admin-input" value="${new Date().toISOString().slice(0,7)}">
          </div>
          <div>
            <label class="admin-label">Vendor</label>
            <select id="costs-form-vendor" class="admin-input">
              ${VENDORS.map(v => `<option value="${v}">${v}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="admin-label">Amount ($)</label>
            <input type="number" id="costs-form-amount" class="admin-input" placeholder="0.00" step="0.01">
          </div>
          <div>
            <label class="admin-label">Notes</label>
            <input type="text" id="costs-form-notes" class="admin-input" placeholder="Plan tier, usage notes...">
          </div>
          <div>
            <button class="admin-btn" id="costs-form-save">Save</button>
          </div>
        </div>
      </div>
    </div>
    <div class="admin-block">
      <div class="admin-block-header">
        <h2 class="admin-block-title">Monthly Breakdown</h2>
      </div>
      <div id="costs-chart" style="height:280px;"></div>
    </div>
    <div class="admin-block">
      <div class="admin-block-header">
        <h2 class="admin-block-title">Cost Log</h2>
      </div>
      <div id="costs-log-container"><div class="admin-loading">Loading...</div></div>
    </div>`;

  await _loadCostsData();

  document.getElementById('costs-add-btn').addEventListener('click', () => {
    const f = document.getElementById('costs-add-form');
    f.style.display = f.style.display === 'none' ? 'block' : 'none';
  });

  document.getElementById('costs-form-save').addEventListener('click', async () => {
    const month = document.getElementById('costs-form-month').value;
    const vendor = document.getElementById('costs-form-vendor').value;
    const amount = parseFloat(document.getElementById('costs-form-amount').value);
    const notes = document.getElementById('costs-form-notes').value;
    if (!month || !vendor || isNaN(amount)) { _adminToast('Fill in month, vendor, and amount.', 'error'); return; }
    const { error } = await sb.from('vendor_cost_log').insert({ month, vendor, amount, notes });
    if (error) { _adminToast('Save failed: ' + error.message, 'error'); return; }
    document.getElementById('costs-add-form').style.display = 'none';
    document.getElementById('costs-form-amount').value = '';
    document.getElementById('costs-form-notes').value = '';
    _adminToast('Cost entry saved.');
    await _loadCostsData();
  });
}

async function _loadCostsData() {
  const { data, error } = await sb.from('vendor_cost_log')
    .select('*').order('month', { ascending: false }).limit(200);

  const container = document.getElementById('costs-log-container');
  if (!container) return;

  if (error || !data || data.length === 0) {
    container.innerHTML = '<div class="admin-empty">No cost entries yet. Add your first entry above.</div>';
    return;
  }

  // Stat cards
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const lastDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonth = `${lastDate.getFullYear()}-${String(lastDate.getMonth() + 1).padStart(2, '0')}`;

  const thisMo = data.filter(r => r.month === thisMonth);
  const lastMo = data.filter(r => r.month === lastMonth);
  const thisMoTotal = thisMo.reduce((s, r) => s + parseFloat(r.amount || 0), 0);
  const lastMoTotal = lastMo.reduce((s, r) => s + parseFloat(r.amount || 0), 0);

  const vendorTotals = {};
  thisMo.forEach(r => { vendorTotals[r.vendor] = (vendorTotals[r.vendor] || 0) + parseFloat(r.amount || 0); });
  const topVendor = Object.entries(vendorTotals).sort((a, b) => b[1] - a[1])[0];
  const momChange = lastMoTotal > 0 ? (((thisMoTotal - lastMoTotal) / lastMoTotal) * 100).toFixed(1) + '%' : '—';

  const statEl = document.getElementById('costs-stat-row');
  if (statEl) {
    statEl.innerHTML = `
      ${_adminStatCard('This Month', '$' + thisMoTotal.toFixed(2), 'Total MTD')}
      ${_adminStatCard('Last Month', '$' + lastMoTotal.toFixed(2), 'Total')}
      ${_adminStatCard('Largest Vendor', topVendor ? topVendor[0] : '—', 'This month')}
      ${_adminStatCard('MoM Change', momChange, 'vs last month')}`;
  }

  // Monthly trend chart
  const monthlyTotals = {};
  data.forEach(r => {
    monthlyTotals[r.month] = (monthlyTotals[r.month] || 0) + parseFloat(r.amount || 0);
  });
  const months = Object.keys(monthlyTotals).sort().slice(-12);
  const monthValues = months.map(m => monthlyTotals[m]);

  const chartEl = document.getElementById('costs-chart');
  if (chartEl && typeof echarts !== 'undefined' && months.length > 0) {
    let chart = echarts.getInstanceByDom(chartEl) || echarts.init(chartEl, 'dark');
    chart.setOption({
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis', formatter: p => p[0].name + ': $' + p[0].value.toFixed(2) },
      grid: { left: 55, right: 20, top: 20, bottom: 40 },
      xAxis: { type: 'category', data: months, axisLabel: { color: '#aaa', fontSize: 11 } },
      yAxis: { type: 'value', axisLabel: { color: '#aaa', fontSize: 11, formatter: v => '$' + v } },
      series: [{ type: 'bar', data: monthValues, itemStyle: { color: '#e55' }, name: 'Total Cost' }]
    });
  }

  // Log table
  const rows = data.slice(0, 100).map(r => `
    <tr>
      <td>${_escHtml(r.month)}</td>
      <td>${_escHtml(r.vendor)}</td>
      <td>$${parseFloat(r.amount).toFixed(2)}</td>
      <td>${_escHtml(r.notes || '—')}</td>
    </tr>`).join('');

  container.innerHTML = `
    <table class="admin-table">
      <thead><tr><th>Month</th><th>Vendor</th><th>Amount</th><th>Notes</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ─── FORECASTING ─────────────────────────────────────────────────────────────
async function loadForecastingTab() {
  const el = document.getElementById('admin-page-forecasting');
  if (!el) return;
  el.innerHTML = `
    <div class="admin-block">
      <div class="admin-block-header">
        <h2 class="admin-block-title">Revenue Forecast</h2>
        <div class="admin-block-actions">
          <select id="forecast-months" class="admin-input admin-input-sm">
            <option value="6">6 months</option>
            <option value="12" selected>12 months</option>
            <option value="24">24 months</option>
          </select>
        </div>
      </div>
      <div class="admin-stat-row" id="forecast-stat-row">
        ${_adminStatCard('Current MRR', '—', 'Based on subscriptions')}
        ${_adminStatCard('Paid Users', '—', 'Active subscriptions')}
        ${_adminStatCard('Growth Rate', '—', 'MoM estimate')}
        ${_adminStatCard('12m ARR Target', '—', 'Projected')}
      </div>
      <div id="forecast-chart" style="height:340px;margin-top:16px;"></div>
    </div>
    <div class="admin-block">
      <div class="admin-block-header">
        <h2 class="admin-block-title">Assumptions</h2>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;padding:8px 0;">
        <div>
          <label class="admin-label">Monthly Growth Rate (%)</label>
          <input type="number" id="forecast-growth" class="admin-input" value="15" min="0" max="200" step="1">
        </div>
        <div>
          <label class="admin-label">ARPU ($/month)</label>
          <input type="number" id="forecast-arpu" class="admin-input" value="19.99" step="0.01">
        </div>
        <div>
          <label class="admin-label">Churn Rate (%/month)</label>
          <input type="number" id="forecast-churn" class="admin-input" value="5" min="0" max="100" step="0.5">
        </div>
      </div>
      <button class="admin-btn" id="forecast-run" style="margin-top:8px;">Run Forecast</button>
    </div>`;

  await _runForecast();

  document.getElementById('forecast-run').addEventListener('click', _runForecast);
  document.getElementById('forecast-months').addEventListener('change', _runForecast);
}

async function _runForecast() {
  // Pull live paid user count from subscriptions if available
  const { data: subs } = await sb.from('subscriptions')
    .select('id, plan_id, status').eq('status', 'active');

  const paidUsers = subs ? subs.length : 0;
  const arpu = parseFloat(document.getElementById('forecast-arpu')?.value || '19.99');
  const growthRate = parseFloat(document.getElementById('forecast-growth')?.value || '15') / 100;
  const churnRate = parseFloat(document.getElementById('forecast-churn')?.value || '5') / 100;
  const forecastMonths = parseInt(document.getElementById('forecast-months')?.value || '12');

  const currentMRR = paidUsers * arpu;

  const statEl = document.getElementById('forecast-stat-row');
  if (statEl) {
    const projectedARR = _projectMRR(paidUsers, arpu, growthRate, churnRate, 12) * 12;
    statEl.innerHTML = `
      ${_adminStatCard('Current MRR', '$' + currentMRR.toFixed(2), 'Based on subscriptions')}
      ${_adminStatCard('Paid Users', paidUsers.toString(), 'Active subscriptions')}
      ${_adminStatCard('Growth Rate', (growthRate * 100).toFixed(1) + '%', 'MoM configured')}
      ${_adminStatCard('12m ARR Target', '$' + projectedARR.toFixed(0), 'Projected')}`;
  }

  // Build forecast series
  const months = [];
  const mrrSeries = [];
  const arrSeries = [];
  const usersSeries = [];
  let users = paidUsers;

  const now = new Date();
  for (let i = 0; i <= forecastMonths; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    months.push(d.toISOString().slice(0, 7));
    const mrr = users * arpu;
    mrrSeries.push(parseFloat(mrr.toFixed(2)));
    arrSeries.push(parseFloat((mrr * 12).toFixed(2)));
    usersSeries.push(users);
    users = Math.round(users * (1 + growthRate - churnRate));
  }

  const chartEl = document.getElementById('forecast-chart');
  if (chartEl && typeof echarts !== 'undefined') {
    let chart = echarts.getInstanceByDom(chartEl) || echarts.init(chartEl, 'dark');
    chart.setOption({
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis' },
      legend: { data: ['MRR ($)', 'Paid Users'], textStyle: { color: '#aaa' } },
      grid: { left: 60, right: 60, top: 40, bottom: 40 },
      xAxis: { type: 'category', data: months, axisLabel: { color: '#aaa', fontSize: 11 } },
      yAxis: [
        { type: 'value', name: 'MRR ($)', nameTextStyle: { color: '#aaa' }, axisLabel: { color: '#aaa', formatter: v => '$' + v } },
        { type: 'value', name: 'Users', nameTextStyle: { color: '#aaa' }, axisLabel: { color: '#aaa' } }
      ],
      series: [
        { name: 'MRR ($)', type: 'line', smooth: true, data: mrrSeries, itemStyle: { color: '#00c896' }, areaStyle: { opacity: 0.15 } },
        { name: 'Paid Users', type: 'line', smooth: true, data: usersSeries, yAxisIndex: 1, itemStyle: { color: '#3b7de8' }, lineStyle: { type: 'dashed' } }
      ]
    });
    window.addEventListener('resize', () => chart.resize());
  }
}

function _projectMRR(users, arpu, growth, churn, months) {
  let u = users;
  for (let i = 0; i < months; i++) u = u * (1 + growth - churn);
  return u * arpu;
}

// ─── EXPORTS ─────────────────────────────────────────────────────────────────
window.loadPaidTab = loadPaidTab;
window.loadSocialTab = loadSocialTab;
window.loadAnalyticsOverviewTab = loadAnalyticsOverviewTab;
window.loadCostsTab = loadCostsTab;
window.loadForecastingTab = loadForecastingTab;
