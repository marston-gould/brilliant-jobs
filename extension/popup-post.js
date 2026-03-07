// popup-post.js — Runs after popup.js
// Overrides addLog to route to unified log, handles version display

(function() {
  // Override addLog to route all per-tab logs to unified log
  const sourceMap = {
    'h-log': 'contacts',
    's-log': 'company-scan',
    'j-log': 'jobs',
    'd-log': 'export'
  };

  window.addLog = function(logId, msg, type) {
    const log = document.getElementById('unified-log');
    if (!log) return;
    const line = document.createElement('div');
    line.className = 'log-line ' + (type || '');
    const now = new Date();
    const time = now.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const source = sourceMap[logId] || '';

    const timeSpan = document.createElement('span');
    timeSpan.className = 'log-time';
    timeSpan.textContent = time;
    line.appendChild(timeSpan);

    if (source) {
      const srcSpan = document.createElement('span');
      srcSpan.className = 'log-source';
      srcSpan.textContent = source;
      line.appendChild(srcSpan);
    }

    const msgSpan = document.createElement('span');
    msgSpan.textContent = msg;
    line.appendChild(msgSpan);

    log.insertBefore(line, log.firstChild);
    while (log.children.length > 100) log.removeChild(log.lastChild);
  };

  // Clear button
  var clearBtn = document.getElementById('log-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', function() {
      document.getElementById('unified-log').innerHTML = '';
    });
  }

  // Version info from version.json
  (async function() {
    try {
      const res = await fetch(chrome.runtime.getURL('version.json'));
      const ver = await res.json();
      var verLabel = document.getElementById('ver-label');
      if (verLabel) {
        verLabel.textContent = 'v' + ver.version;
        // Console log version and role
        chrome.storage.local.get('userRole').then(data => {
          var role = data.userRole || 'user';
          console.log('[BJ Extension] v' + ver.version + ' loaded | role: ' + role);
        });
        verLabel.addEventListener('click', function() {
          var panel = document.getElementById('about-panel');
          if (panel) panel.classList.toggle('active');
        });
      }

      var closeBtn = document.getElementById('about-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', function() {
          var panel = document.getElementById('about-panel');
          if (panel) panel.classList.remove('active');
        });
      }

      // Build the about body
      var body = document.getElementById('about-body');
      if (body) {
        var table = document.createElement('table');
        function addRow(label, value, color) {
          var tr = document.createElement('tr');
          var td1 = document.createElement('td');
          td1.textContent = label;
          var td2 = document.createElement('td');
          td2.textContent = value;
          if (color) td2.style.color = color;
          tr.appendChild(td1);
          tr.appendChild(td2);
          table.appendChild(tr);
        }
        function addHeader(text) {
          var tr = document.createElement('tr');
          var td = document.createElement('td');
          td.colSpan = 2;
          td.style.paddingTop = '6px';
          td.style.color = 'var(--text-faint)';
          td.style.fontWeight = '600';
          td.textContent = text;
          tr.appendChild(td);
          table.appendChild(tr);
        }

        addRow('Version', ver.version);
        addRow('Build', ver.build);
        addHeader('Files');
        for (var file in ver.files) {
          var fver = ver.files[file];
          var current = fver === ver.version;
          addRow(file, fver, current ? 'var(--green)' : 'var(--text-faint)');
        }
        if (ver.changelog) {
          addHeader('Changelog');
          for (var cv in ver.changelog) {
            var tr = document.createElement('tr');
            var td1 = document.createElement('td');
            td1.textContent = cv;
            var td2 = document.createElement('td');
            td2.textContent = ver.changelog[cv];
            td2.style.fontFamily = 'inherit';
            td2.style.whiteSpace = 'normal';
            tr.appendChild(td1);
            tr.appendChild(td2);
            table.appendChild(tr);
          }
        }
        body.innerHTML = '';
        body.appendChild(table);
      }
    } catch (e) {
      var verLabel = document.getElementById('ver-label');
      if (verLabel) verLabel.textContent = 'v?.?';
    }
  })();

  // ============================================================
  // ES1-5: Version Mismatch Check
  // ============================================================
  // Queries app_config for the latest expected extension version.
  // Shows a banner if the installed version is behind.
  (async function checkExtensionVersion() {
    try {
      const localRes = await fetch(chrome.runtime.getURL('version.json'));
      const localVer = (await localRes.json()).version; // e.g. "2.20.0"

      const SB_URL = 'https://qojhagupdnbtomfoxnsf.supabase.co';
      const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvamhhZ3VwZG5idG9tZm94bnNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NjkwNjYsImV4cCI6MjA4NjE0NTA2Nn0.0AFgnrN7omBC4Jg8G0kxZACn5mXLWPazIodI6JOx1rg';

      const res = await fetch(
        `${SB_URL}/rest/v1/app_config?select=value&key=eq.extension_latest_version`,
        { headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` } }
      );
      if (!res.ok) return;

      const rows = await res.json();
      if (!rows || rows.length === 0) return;

      const expectedVer = rows[0].value; // e.g. "2.21.0"

      // Compare semver: split and compare numerically
      function compareSemver(a, b) {
        const pa = a.split('.').map(Number);
        const pb = b.split('.').map(Number);
        for (let i = 0; i < 3; i++) {
          if ((pa[i] || 0) < (pb[i] || 0)) return -1;
          if ((pa[i] || 0) > (pb[i] || 0)) return 1;
        }
        return 0;
      }

      if (compareSemver(localVer, expectedVer) < 0) {
        // Installed version is behind — show banner
        const banner = document.getElementById('version-mismatch-banner');
        if (banner) {
          banner.style.display = 'block';
          // Dismiss handler
          var dismissBtn = document.getElementById('version-mismatch-dismiss');
          if (dismissBtn) {
            dismissBtn.addEventListener('click', function() {
              banner.style.display = 'none';
              // Don't show again this session
              try { sessionStorage.setItem('bj-version-dismissed', '1'); } catch {}
            });
          }
        }
      }
    } catch {
      // Version check is non-critical — silently fail
    }
  })();
})();

