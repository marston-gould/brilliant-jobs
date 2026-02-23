// popup-post.js — Runs after popup.js
// Overrides addLog to route to unified log, handles version display

(function() {
  // Override addLog to route all per-tab logs to unified log
  const sourceMap = {
    'h-log': 'harvest',
    's-log': 'scan',
    'j-log': 'jobs',
    'd-log': 'data'
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
})();
