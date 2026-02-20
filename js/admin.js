// === js/admin.js ===
// Admin panel — ATS Board Health metrics
// Dependencies: sb, currentUser, setText (from stats.js or inline)

var adminPeriod = parseInt(localStorage.getItem('bj_admin_period') || '168');
var _adminInitialized = false;

function initAdminPage() {
  var page = document.getElementById('page-admin');
  if (!page || !page.classList.contains('active')) return;
  if (_adminInitialized) { loadBoardHealth(); return; }
  _adminInitialized = true;

  // Period toggle
  var toggle = document.getElementById('admin-period-toggle');
  if (toggle) {
    toggle.addEventListener('click', function(e) {
      if (!e.target.classList.contains('admin-period-btn')) return;
      toggle.querySelectorAll('.admin-period-btn').forEach(function(b) { b.classList.remove('active'); });
      e.target.classList.add('active');
      adminPeriod = parseInt(e.target.dataset.hours);
      localStorage.setItem('bj_admin_period', String(adminPeriod));
      loadBoardHealth();
    });
    // Restore saved period
    toggle.querySelectorAll('.admin-period-btn').forEach(function(b) {
      b.classList.toggle('active', parseInt(b.dataset.hours) === adminPeriod);
    });
  }

  loadBoardHealth();
}

async function loadBoardHealth() {
  try {
    var results = await Promise.all([
      sb.rpc('get_board_health', { period_hours: adminPeriod }),
      sb.rpc('get_board_health_by_platform', { period_hours: adminPeriod })
    ]);
    var snapshot = results[0];
    var platforms = results[1];

    if (snapshot.error) { console.error('[Admin] RPC error:', snapshot.error); return; }

    var d = snapshot.data;

    // Stat cards
    setAdminText('ah-total', fmtNum(d.total_feeds));
    setAdminText('ah-with-jobs', fmtNum(d.feeds_with_jobs));
    setAdminText('ah-4xx', fmtNum(d.feeds_4xx));
    setAdminText('ah-jobs', fmtNum(d.total_jobs));

    var netJobs = d.jobs_added - d.jobs_lost;
    var netEl = document.getElementById('ah-net');
    if (netEl) {
      netEl.textContent = (netJobs >= 0 ? '+' : '') + fmtNum(netJobs);
      netEl.className = 'stat-val ' + (netJobs > 0 ? 'admin-green' : netJobs < 0 ? 'admin-red' : 'admin-amber');
    }

    // Deltas
    setAdminDelta('ah-total-delta', d.boards_added, d.boards_lost);
    setAdminDelta('ah-with-jobs-delta', d.boards_added, d.boards_lost);
    setAdminDelta('ah-4xx-delta', d.boards_lost, 0);
    setAdminDelta('ah-jobs-delta', d.jobs_added, d.jobs_lost);

    // Net delta label
    var netDelta = document.getElementById('ah-net-delta');
    if (netDelta) {
      var label = adminPeriod <= 24 ? '24 hours' : adminPeriod <= 168 ? '7 days' : '30 days';
      netDelta.textContent = label;
    }

    // Health indicator
    var healthEl = document.getElementById('admin-health');
    if (healthEl) {
      var deadPct = d.total_feeds > 0 ? (d.feeds_4xx / d.total_feeds * 100) : 0;
      var dotClass = deadPct < 5 ? 'green' : deadPct < 10 ? 'amber' : 'red';
      var healthLabel = d.feed_health_pct + '% healthy · ' + fmtNum(d.feeds_4xx) + ' dead · ' + fmtNum(d.feeds_never_scraped) + ' never scraped';
      healthEl.innerHTML = '<span class="admin-health-dot ' + dotClass + '"></span> ' + healthLabel;
    }

    // Platform table
    if (!platforms.error && platforms.data) {
      renderPlatformTable(platforms.data);
    }
  } catch (err) {
    console.error('[Admin] loadBoardHealth error:', err);
  }
}

function fmtNum(n) { return n != null ? Number(n).toLocaleString() : '—'; }

function setAdminText(id, val) {
  var el = document.getElementById(id);
  if (el) el.textContent = val;
}

function setAdminDelta(id, added, lost) {
  var el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = '<span class="up">▲' + fmtNum(added) + '</span> <span class="down">▼' + fmtNum(lost) + '</span>';
}

function renderPlatformTable(platforms) {
  var tbody = document.getElementById('admin-platform-body');
  if (!tbody || !platforms) return;
  tbody.innerHTML = platforms.map(function(p) {
    return '<tr>' +
      '<td class="admin-platform-name">' + p.platform + '</td>' +
      '<td>' + fmtNum(p.total) + '</td>' +
      '<td class="admin-green">+' + fmtNum(p.boards_added) + '</td>' +
      '<td class="admin-red">-' + fmtNum(p.boards_lost) + '</td>' +
      '<td>' + fmtNum(p.with_jobs) + '</td>' +
      '<td>' + fmtNum(p.errors_4xx) + '</td>' +
      '<td>' + fmtNum(p.jobs) + '</td>' +
      '<td class="admin-green">+' + fmtNum(p.jobs_added) + '</td>' +
      '<td class="admin-red">-' + fmtNum(p.jobs_lost) + '</td>' +
      '</tr>';
  }).join('');
}

// Show admin nav if user is admin — called from app.js after profile load
function checkAdminAccess() {
  if (!currentUser) return;
  sb.from('profiles').select('role').eq('id', currentUser.id).single().then(function(res) {
    if (res.data && res.data.role === 'admin') {
      var navAdmin = document.getElementById('nav-admin');
      if (navAdmin) navAdmin.style.display = '';
    }
  });
}
