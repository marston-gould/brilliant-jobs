// js/admin-cohort-pricing.js — Cohort-Based Pricing Configuration Admin Panel
// COHORT-PRICING-S1: Global defaults editor, per-cohort override editor, audit log

// ─── State ───
var _pricingDefaults = [];
var _pricingCohorts = [];
var _pricingAuditLog = [];
var _editingCohortId = null;

// ─── Entry Point ───
async function loadCohortPricingPanel() {
  console.log('[Admin] loadCohortPricingPanel');
  await Promise.all([
    loadPricingDefaults(),
    loadPricingCohorts(),
    loadPricingAuditLog()
  ]);
}
window.loadCohortPricingPanel = loadCohortPricingPanel;

// ─── Load Global Defaults ───
async function loadPricingDefaults() {
  try {
    var { data, error } = await sb.from('pricing_defaults')
      .select('*')
      .order('display_order');
    if (error) throw error;
    _pricingDefaults = data || [];
    renderGlobalDefaults();
  } catch (e) {
    reportError('admin-pricing', e);
    toastWarning('Failed to load pricing defaults');
  }
}

// ─── Load Cohorts with Pricing Config ───
async function loadPricingCohorts() {
  try {
    var { data, error } = await sb.from('cohorts')
      .select('id,name,criteria_type,criteria_value,pricing_config,is_active,is_locked,created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    _pricingCohorts = (data || []).filter(function(c) {
      return c.criteria_type === 'signup_date_range';
    });
    renderCohortList();
  } catch (e) {
    reportError('admin-pricing', e);
  }
}

// ─── Load Audit Log ───
async function loadPricingAuditLog() {
  try {
    var { data, error } = await sb.from('pricing_audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) throw error;
    _pricingAuditLog = data || [];
    renderAuditLog();
  } catch (e) {
    reportError('admin-pricing', e);
  }
}

// ─── Render: Global Defaults Table ───
function renderGlobalDefaults() {
  var tbody = document.getElementById('cp-defaults-body');
  if (!tbody) return;

  tbody.innerHTML = _pricingDefaults.map(function(d) {
    var priceStr = d.subscription_price_cents === 0 ? '$0' : '$' + (d.subscription_price_cents / 100).toFixed(2);
    var paygStr = '$' + (d.payg_rate_cents / 100).toFixed(2);
    var filtersStr = d.max_saved_filters === null ? '∞' : String(d.max_saved_filters);
    var resumesStr = d.max_resumes === null ? '∞' : String(d.max_resumes);

    return '<tr data-tier="' + d.tier + '">' +
      '<td style="font-weight:600;color:var(--accent)">' + d.name + '</td>' +
      '<td><input type="number" class="cp-input" id="cp-def-price-' + d.tier + '" value="' + d.subscription_price_cents + '" min="0" step="100" style="width:80px" title="Cents/month"></td>' +
      '<td><input type="number" class="cp-input" id="cp-def-credits-' + d.tier + '" value="' + d.included_credits + '" min="0" step="10" style="width:70px"></td>' +
      '<td><input type="number" class="cp-input" id="cp-def-payg-' + d.tier + '" value="' + d.payg_rate_cents + '" min="0" step="1" style="width:60px" title="Cents/credit"></td>' +
      '<td style="font-family:var(--mono);font-size:11px;color:var(--text-faint)">' + filtersStr + '</td>' +
      '<td style="font-family:var(--mono);font-size:11px;color:var(--text-faint)">' + resumesStr + '</td>' +
      '<td style="font-size:11px;color:var(--text-dim)">' + priceStr + '/mo, ' + d.included_credits + ' cr, ' + paygStr + '/cr</td>' +
      '<td><button class="btn-sm btn-primary" onclick="saveGlobalDefault(\'' + d.tier + '\')" style="font-size:10px;padding:3px 10px">Save</button></td>' +
      '</tr>';
  }).join('');
}

// ─── Save Global Default ───
window.saveGlobalDefault = async function(tier) {
  var priceEl = document.getElementById('cp-def-price-' + tier);
  var creditsEl = document.getElementById('cp-def-credits-' + tier);
  var paygEl = document.getElementById('cp-def-payg-' + tier);
  if (!priceEl || !creditsEl || !paygEl) return;

  var price = parseInt(priceEl.value, 10);
  var credits = parseInt(creditsEl.value, 10);
  var payg = parseInt(paygEl.value, 10);

  if (isNaN(price) || isNaN(credits) || isNaN(payg)) {
    toastWarning('All fields must be valid numbers');
    return;
  }

  try {
    var { data, error } = await sb.rpc('fn_update_pricing_default', {
      p_tier: tier,
      p_subscription_price_cents: price,
      p_included_credits: credits,
      p_payg_rate_cents: payg
    });
    if (error) throw error;
    if (data && data.error) { toastWarning(data.error); return; }

    toastSuccess('Updated ' + tier + ' defaults');
    await loadPricingDefaults();
    await loadPricingAuditLog();
  } catch (e) {
    reportError('admin-pricing', e);
    toastWarning('Failed to save: ' + e.message);
  }
};

// ─── Render: Cohort List ───
function renderCohortList() {
  var tbody = document.getElementById('cp-cohort-body');
  if (!tbody) return;

  if (_pricingCohorts.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="color:var(--text-faint);text-align:center;padding:20px">No time-based cohorts found. Create one below.</td></tr>';
    return;
  }

  tbody.innerHTML = _pricingCohorts.map(function(c) {
    var cv = c.criteria_value || {};
    var start = cv.start ? new Date(cv.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
    var end = cv.end ? new Date(cv.end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Open';
    var isOpen = !cv.end || new Date(cv.end) > new Date();
    var overrideCount = c.pricing_config ? Object.keys(c.pricing_config).length : 0;
    var statusDot = c.is_active ? '<span style="color:#22c55e">●</span>' : '<span style="color:#ef4444">●</span>';

    return '<tr>' +
      '<td style="font-family:var(--mono);font-size:12px;color:var(--accent)">' + c.id + '</td>' +
      '<td>' + c.name + '</td>' +
      '<td style="font-size:12px">' + start + ' — ' + end + (isOpen ? ' <span style="color:#22c55e;font-size:10px">OPEN</span>' : '') + '</td>' +
      '<td>' + statusDot + ' ' + (c.is_active ? 'Active' : 'Inactive') + '</td>' +
      '<td style="font-family:var(--mono)">' + overrideCount + ' tier' + (overrideCount !== 1 ? 's' : '') + '</td>' +
      '<td><button class="btn-sm" onclick="openCohortEditor(\'' + c.id + '\')" style="font-size:10px;padding:3px 10px;background:var(--bg-input);border:1px solid var(--border);color:var(--text);cursor:pointer">Edit Pricing</button></td>' +
      '</tr>';
  }).join('');
}

// ─── Open Cohort Pricing Editor ───
window.openCohortEditor = function(cohortId) {
  _editingCohortId = cohortId;
  var cohort = _pricingCohorts.find(function(c) { return c.id === cohortId; });
  if (!cohort) return;

  var container = document.getElementById('cp-cohort-editor');
  if (!container) return;

  var config = cohort.pricing_config || {};
  container.style.display = '';
  document.getElementById('cp-editor-title').textContent = 'Pricing Overrides: ' + cohort.name + ' (' + cohort.id + ')';

  // Build editor rows for each tier
  var editorBody = document.getElementById('cp-editor-body');
  if (!editorBody) return;

  editorBody.innerHTML = _pricingDefaults.map(function(d) {
    var override = config[d.tier] || {};
    var hasPrice = override.subscription_price_cents !== undefined;
    var hasCredits = override.included_credits !== undefined;
    var hasPayg = override.payg_rate_cents !== undefined;
    var hasLabel = override.promo_label !== undefined;
    var hasExpiry = override.promo_expires_at !== undefined;

    return '<tr data-tier="' + d.tier + '">' +
      '<td style="font-weight:600;color:var(--accent)">' + d.name +
        '<div style="font-size:10px;color:var(--text-faint)">Default: $' + (d.subscription_price_cents / 100).toFixed(2) + ' / ' + d.included_credits + ' cr / $' + (d.payg_rate_cents / 100).toFixed(2) + '/cr</div>' +
      '</td>' +
      '<td><input type="number" class="cp-input cp-override" id="cp-ov-price-' + d.tier + '" value="' + (hasPrice ? override.subscription_price_cents : '') + '" placeholder="' + d.subscription_price_cents + '" min="0" step="100" style="width:80px" title="Leave blank = use global default"></td>' +
      '<td><input type="number" class="cp-input cp-override" id="cp-ov-credits-' + d.tier + '" value="' + (hasCredits ? override.included_credits : '') + '" placeholder="' + d.included_credits + '" min="0" step="10" style="width:70px"></td>' +
      '<td><input type="number" class="cp-input cp-override" id="cp-ov-payg-' + d.tier + '" value="' + (hasPayg ? override.payg_rate_cents : '') + '" placeholder="' + d.payg_rate_cents + '" min="0" step="1" style="width:60px"></td>' +
      '<td><input type="text" class="cp-input cp-override" id="cp-ov-label-' + d.tier + '" value="' + (hasLabel ? override.promo_label : '') + '" placeholder="None" style="width:100px;font-size:11px"></td>' +
      '<td><input type="date" class="cp-input cp-override" id="cp-ov-expiry-' + d.tier + '" value="' + (hasExpiry ? override.promo_expires_at.split('T')[0] : '') + '" style="width:120px;font-size:11px"></td>' +
      '</tr>';
  }).join('');

  renderCohortPreview(config);
  container.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// ─── Render Cohort Preview ───
function renderCohortPreview(config) {
  var preview = document.getElementById('cp-preview-body');
  if (!preview) return;

  preview.innerHTML = _pricingDefaults.map(function(d) {
    var override = config[d.tier] || {};
    var expired = override.promo_expires_at && new Date(override.promo_expires_at) < new Date();

    var rPrice = (!expired && override.subscription_price_cents !== undefined) ? override.subscription_price_cents : d.subscription_price_cents;
    var rCredits = (!expired && override.included_credits !== undefined) ? override.included_credits : d.included_credits;
    var rPayg = (!expired && override.payg_rate_cents !== undefined) ? override.payg_rate_cents : d.payg_rate_cents;

    var isOverridden = function(field) {
      return !expired && override[field] !== undefined;
    };
    var ovStyle = 'color:#6366f1;font-weight:600';
    var defStyle = 'color:var(--text-faint)';

    return '<tr>' +
      '<td style="font-weight:600">' + d.name + '</td>' +
      '<td style="' + (isOverridden('subscription_price_cents') ? ovStyle : defStyle) + '">$' + (rPrice / 100).toFixed(2) + '</td>' +
      '<td style="' + (isOverridden('included_credits') ? ovStyle : defStyle) + '">' + rCredits + '</td>' +
      '<td style="' + (isOverridden('payg_rate_cents') ? ovStyle : defStyle) + '">$' + (rPayg / 100).toFixed(2) + '</td>' +
      '<td style="font-size:11px;color:var(--text-dim)">' + (override.promo_label || '—') + (expired ? ' <span style="color:#ef4444;font-size:10px">EXPIRED</span>' : '') + '</td>' +
      '</tr>';
  }).join('');
}

// ─── Save Cohort Overrides ───
window.saveCohortOverrides = async function() {
  if (!_editingCohortId) return;

  var config = {};
  _pricingDefaults.forEach(function(d) {
    var priceEl = document.getElementById('cp-ov-price-' + d.tier);
    var creditsEl = document.getElementById('cp-ov-credits-' + d.tier);
    var paygEl = document.getElementById('cp-ov-payg-' + d.tier);
    var labelEl = document.getElementById('cp-ov-label-' + d.tier);
    var expiryEl = document.getElementById('cp-ov-expiry-' + d.tier);

    var tierConfig = {};
    if (priceEl && priceEl.value !== '') tierConfig.subscription_price_cents = parseInt(priceEl.value, 10);
    if (creditsEl && creditsEl.value !== '') tierConfig.included_credits = parseInt(creditsEl.value, 10);
    if (paygEl && paygEl.value !== '') tierConfig.payg_rate_cents = parseInt(paygEl.value, 10);
    if (labelEl && labelEl.value.trim() !== '') tierConfig.promo_label = labelEl.value.trim();
    if (expiryEl && expiryEl.value !== '') tierConfig.promo_expires_at = expiryEl.value + 'T00:00:00Z';

    // Only include tier if it has at least one override
    if (Object.keys(tierConfig).length > 0) {
      config[d.tier] = tierConfig;
    }
  });

  try {
    var { data, error } = await sb.rpc('fn_update_cohort_pricing', {
      p_cohort_id: _editingCohortId,
      p_pricing_config: config
    });
    if (error) throw error;
    if (data && data.error) { toastWarning(data.error); return; }

    toastSuccess('Saved pricing overrides for ' + _editingCohortId);
    await loadPricingCohorts();
    await loadPricingAuditLog();

    // Refresh preview
    renderCohortPreview(config);
  } catch (e) {
    reportError('admin-pricing', e);
    toastWarning('Failed to save: ' + e.message);
  }
};

// ─── Close Cohort Editor ───
window.closeCohortEditor = function() {
  _editingCohortId = null;
  var container = document.getElementById('cp-cohort-editor');
  if (container) container.style.display = 'none';
};

// ─── Create New Cohort ───
window.createPricingCohort = async function() {
  var idEl = document.getElementById('cp-new-id');
  var nameEl = document.getElementById('cp-new-name');
  var startEl = document.getElementById('cp-new-start');
  var endEl = document.getElementById('cp-new-end');
  if (!idEl || !nameEl || !startEl || !endEl) return;

  var id = idEl.value.trim().toLowerCase().replace(/[^a-z0-9\-]/g, '');
  var name = nameEl.value.trim();
  var start = startEl.value;
  var end = endEl.value;

  if (!id || !name || !start || !end) {
    toastWarning('All fields are required');
    return;
  }

  if (new Date(end) <= new Date(start)) {
    toastWarning('End date must be after start date');
    return;
  }

  try {
    var { data, error } = await sb.rpc('fn_create_pricing_cohort', {
      p_id: id,
      p_name: name,
      p_start: start + 'T00:00:00Z',
      p_end: end + 'T00:00:00Z'
    });
    if (error) throw error;
    if (data && data.error) { toastWarning(data.error); return; }

    toastSuccess('Created cohort: ' + name);
    idEl.value = ''; nameEl.value = ''; startEl.value = ''; endEl.value = '';
    await loadPricingCohorts();
    await loadPricingAuditLog();
  } catch (e) {
    reportError('admin-pricing', e);
    toastWarning('Failed to create: ' + e.message);
  }
};

// ─── Render Audit Log ───
function renderAuditLog() {
  var tbody = document.getElementById('cp-audit-body');
  if (!tbody) return;

  if (_pricingAuditLog.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="color:var(--text-faint);text-align:center">No pricing changes recorded yet</td></tr>';
    return;
  }

  tbody.innerHTML = _pricingAuditLog.map(function(a) {
    var date = new Date(a.created_at);
    var timeStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    var typeLabel = {
      'global_default': 'Global Default',
      'cohort_override': 'Cohort Override',
      'cohort_create': 'Cohort Created',
      'cohort_assign': 'Cohort Assignment'
    }[a.change_type] || a.change_type;

    var typeColor = {
      'global_default': '#6366f1',
      'cohort_override': '#f59e0b',
      'cohort_create': '#22c55e',
      'cohort_assign': '#06b6d4'
    }[a.change_type] || 'var(--text-dim)';

    return '<tr>' +
      '<td style="font-size:11px;font-family:var(--mono);color:var(--text-faint)">' + timeStr + '</td>' +
      '<td><span style="font-size:10px;padding:2px 6px;border-radius:4px;background:' + typeColor + '20;color:' + typeColor + ';font-weight:600">' + typeLabel + '</span></td>' +
      '<td style="font-family:var(--mono);font-size:12px">' + a.target_id + '</td>' +
      '<td style="font-size:11px;color:var(--text-dim);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
        (a.after_value ? JSON.stringify(a.after_value).substring(0, 80) : '—') + '</td>' +
      '</tr>';
  }).join('');
}

// ─── Live Preview on Input Change ───
document.addEventListener('input', function(e) {
  if (e.target.classList.contains('cp-override') && _editingCohortId) {
    // Build config from current editor state for live preview
    var config = {};
    _pricingDefaults.forEach(function(d) {
      var tierConfig = {};
      var pv = document.getElementById('cp-ov-price-' + d.tier);
      var cv = document.getElementById('cp-ov-credits-' + d.tier);
      var gv = document.getElementById('cp-ov-payg-' + d.tier);
      var lv = document.getElementById('cp-ov-label-' + d.tier);
      var ev = document.getElementById('cp-ov-expiry-' + d.tier);
      if (pv && pv.value !== '') tierConfig.subscription_price_cents = parseInt(pv.value, 10);
      if (cv && cv.value !== '') tierConfig.included_credits = parseInt(cv.value, 10);
      if (gv && gv.value !== '') tierConfig.payg_rate_cents = parseInt(gv.value, 10);
      if (lv && lv.value.trim() !== '') tierConfig.promo_label = lv.value.trim();
      if (ev && ev.value !== '') tierConfig.promo_expires_at = ev.value + 'T00:00:00Z';
      if (Object.keys(tierConfig).length > 0) config[d.tier] = tierConfig;
    });
    renderCohortPreview(config);
  }
});
