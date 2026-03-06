// === Resume Archive Module ===
// Phase 3: Archive tab UI with database-backed storage, version tracking, and tier info

// Tab switching
window.switchResumeTab = function(tab) {
  const activeContent = $('#resume-tab-content-active');
  const archiveContent = $('#resume-tab-content-archive');
  const activeBtn = $('#resume-tab-active');
  const archiveBtn = $('#resume-tab-archive');
  if (!activeContent || !archiveContent) return;

  if (tab === 'archive') {
    activeContent.style.display = 'none';
    archiveContent.style.display = '';
    activeBtn.classList.remove('active');
    archiveBtn.classList.add('active');
    loadResumeArchive();
  } else {
    activeContent.style.display = '';
    archiveContent.style.display = 'none';
    activeBtn.classList.add('active');
    archiveBtn.classList.remove('active');
  }

  // Support URL hash linking: #resumes?tab=archive
  if (tab === 'archive') {
    history.replaceState(null, '', '#resumes?tab=archive');
  } else {
    history.replaceState(null, '', '#resumes');
  }
};

// Check URL hash on page load for deep-link
function checkArchiveDeepLink() {
  const hash = location.hash;
  if (hash.includes('tab=archive')) {
    setTimeout(function() { switchResumeTab('archive'); }, 200);
  }
  // Also check for specific resume ID
  const match = hash.match(/id=([a-f0-9-]+)/);
  if (match) {
    _archiveHighlightId = match[1];
  }
}
var _archiveHighlightId = null;

// Load archive data from Supabase
window.loadResumeArchive = async function() {
  const body = $('#archive-table-body');
  if (!body) return;
  body.innerHTML = '<tr><td colspan="7" style="padding:32px;text-align:center;color:var(--text-faint);">Loading…</td></tr>';

  try {
    // Fetch archive data
    const { data: archives, error } = await sb
      .from('resume_archive')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Fetch tier limits
    const { data: limits, error: limErr } = await sb.rpc('check_resume_limits', {
      p_user_id: (await sb.auth.getUser()).data.user.id
    });

    if (!limErr && limits) {
      updateStorageBar(limits);
      updateArchiveStats(archives, limits);
    }

    renderArchiveTable(archives || []);
  } catch (e) {
    console.log('[BJ] Archive load error:', e.message);
    body.innerHTML = '<tr><td colspan="7" style="padding:32px;text-align:center;color:var(--red);">Failed to load archive: ' + e.message + '</td></tr>';
  }
};

function updateStorageBar(limits) {
  const bar = $('#archive-storage-bar');
  const label = $('#archive-storage-label');
  const cta = $('#archive-tier-cta');
  if (!bar || !label) return;

  const used = limits.current_storage || 0;
  const max = limits.limits?.storage_bytes || 52428800;
  const pct = Math.min((used / max) * 100, 100);

  bar.style.width = pct.toFixed(1) + '%';
  bar.style.background = pct > 90 ? 'var(--red)' : pct > 70 ? 'var(--warm)' : 'var(--accent)';
  label.textContent = formatBytes(used) + ' / ' + formatBytes(max);

  if (cta) {
    cta.style.display = pct > 80 && limits.tier !== 'pro' ? '' : 'none';
  }
}

function updateArchiveStats(archives, limits) {
  const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
  el('arch-total', archives.length);
  el('arch-active', archives.filter(a => a.is_active).length);
  el('arch-versions', archives.reduce((sum, a) => sum + a.version_number, 0));
  el('arch-tier', (limits.tier || 'free').charAt(0).toUpperCase() + (limits.tier || 'free').slice(1));
}

function renderArchiveTable(archives) {
  const body = $('#archive-table-body');
  const search = $('#archive-search');
  if (!body) return;

  // Filter by search
  let filtered = archives;
  if (search && search.value.trim()) {
    const q = search.value.trim().toLowerCase();
    filtered = archives.filter(a =>
      a.display_name.toLowerCase().includes(q) ||
      (a.file_type || '').toLowerCase().includes(q)
    );
  }

  if (filtered.length === 0) {
    body.innerHTML = '<tr><td colspan="7" style="padding:32px;text-align:center;color:var(--text-faint);">No archived resumes found</td></tr>';
    return;
  }

  body.innerHTML = filtered.map(a => {
    const isExpired = a.metadata_snapshot?.soft_deleted === true;
    const statusBadge = isExpired
      ? '<span style="display:inline-block;padding:2px 8px;border-radius:4px;background:var(--red)15;color:var(--red);font-size:10px;font-weight:600;">Expired</span>'
      : a.is_active
        ? '<span style="display:inline-block;padding:2px 8px;border-radius:4px;background:var(--green)15;color:var(--green);font-size:10px;font-weight:600;">Active</span>'
        : a.is_archived
          ? '<span style="display:inline-block;padding:2px 8px;border-radius:4px;background:var(--warm)15;color:var(--warm);font-size:10px;font-weight:600;">Archived</span>'
          : '<span style="display:inline-block;padding:2px 8px;border-radius:4px;background:var(--text-faint)15;color:var(--text-faint);font-size:10px;font-weight:600;">Inactive</span>';

    // Show expiry countdown for archived resumes
    const expiryInfo = a.is_archived && a.archive_expires_at && !isExpired
      ? (() => {
          const days = Math.ceil((new Date(a.archive_expires_at) - new Date()) / 86400000);
          if (days <= 7) return `<div style="font-size:9px;color:var(--red);margin-top:2px;">Expires in ${days}d</div>`;
          if (days <= 30) return `<div style="font-size:9px;color:var(--warm);margin-top:2px;">Expires in ${days}d</div>`;
          return '';
        })()
      : '';

    const levelBadge = a.metadata_snapshot?.level_label
      ? `<span style="font-size:9px;font-weight:600;padding:1px 6px;border-radius:4px;background:${a.metadata_snapshot.level_color || '#94a3b8'}15;color:${a.metadata_snapshot.level_color || '#94a3b8'};">${a.metadata_snapshot.level_label}</span>`
      : '';

    const highlight = _archiveHighlightId === a.resume_id ? 'background:var(--accent)08;' : '';

    return `<tr style="border-bottom:1px solid var(--border);${highlight}" data-resume-id="${a.resume_id}">
      <td style="padding:10px 12px;">
        <div style="display:flex;align-items:center;gap:6px;">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--text-faint)" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <div>
            <div style="font-weight:600;color:var(--text);">${a.display_name}</div>
            <div style="font-size:10px;color:var(--text-faint);">${a.file_type.toUpperCase()} ${levelBadge}</div>
          </div>
        </div>
      </td>
      <td style="padding:10px 12px;font-family:var(--mono);font-size:11px;color:var(--text-dim);">v${a.version_number}</td>
      <td style="padding:10px 12px;font-size:11px;color:var(--text-dim);">${formatDate(a.created_at)}</td>
      <td style="padding:10px 12px;font-size:11px;color:var(--text-dim);">${a.last_used_at ? formatDate(a.last_used_at) : '—'}</td>
      <td style="padding:10px 12px;font-size:11px;color:var(--text-dim);font-family:var(--mono);">${formatBytes(a.compressed_size_bytes || a.file_size_bytes)}</td>
      <td style="padding:10px 12px;">${statusBadge}${expiryInfo}</td>
      <td style="padding:10px 12px;">
        <div style="display:flex;gap:4px;">
          <button class="btn btn-sm" onclick="showVersionTimeline('${a.resume_id}')" style="font-size:10px;padding:3px 8px;" title="Version history">History</button>
          ${a.is_archived || isExpired ? `<button class="btn btn-sm" onclick="restoreArchiveResume('${a.resume_id}')" style="font-size:10px;padding:3px 8px;background:var(--accent);color:#fff;" title="Restore">${isExpired ? 'Restore ↑' : 'Restore'}</button>` : ''}
          ${a.is_active ? `<button class="btn btn-sm" onclick="archiveDbResume('${a.resume_id}')" style="font-size:10px;padding:3px 8px;background:var(--warm);color:#000;" title="Archive">Archive</button>` : ''}
          <button class="btn btn-sm" onclick="deleteArchiveResume('${a.resume_id}')" style="font-size:10px;padding:3px 8px;background:var(--red);color:#fff;" title="Delete">Del</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  _archiveHighlightId = null;
}

// Version timeline
window.showVersionTimeline = async function(resumeId) {
  const timeline = $('#archive-version-timeline');
  const list = $('#archive-version-list');
  if (!timeline || !list) return;

  timeline.style.display = '';
  list.innerHTML = '<div style="padding:16px;color:var(--text-faint);font-size:12px;">Loading versions…</div>';

  try {
    // Get the resume and all versions in its lineage
    const resume = await safeQuery(() => sb.from('resume_archive').select('*').eq('resume_id', resumeId).single(), { label: 'resume-archive:resume_archive', fallback: null });
    if (!resume) return;

    // Find all versions: same display_name or linked by parent
    const versions = await safeQuery(() => sb.from('resume_archive').select('*')
      .eq('user_id', resume.user_id)
      .eq('display_name', resume.display_name)
      .order('version_number', { ascending: false }), { label: 'resume-archive:resume_archive', fallback: [] });

    if (!versions || versions.length === 0) {
      list.innerHTML = '<div style="padding:16px;color:var(--text-faint);font-size:12px;">No version history found</div>';
      return;
    }

    list.innerHTML = versions.map((v, idx) => {
      const isCurrent = v.resume_id === resumeId;
      const dot = v.is_active
        ? '<div style="width:10px;height:10px;border-radius:50%;background:var(--green);flex-shrink:0;"></div>'
        : '<div style="width:10px;height:10px;border-radius:50%;background:var(--border);flex-shrink:0;"></div>';
      const connector = idx < versions.length - 1
        ? '<div style="position:absolute;left:4px;top:14px;bottom:-14px;width:2px;background:var(--border);"></div>'
        : '';

      return `<div style="display:flex;gap:12px;align-items:flex-start;padding:8px 0;position:relative;${isCurrent ? 'background:var(--bg-input);border-radius:8px;padding:8px 12px;margin:-4px -12px;' : ''}">
        <div style="position:relative;">${dot}${connector}</div>
        <div style="flex:1;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-weight:600;font-size:12px;color:var(--text);">v${v.version_number}</span>
            ${v.is_active ? '<span style="font-size:9px;padding:1px 6px;border-radius:4px;background:var(--green)15;color:var(--green);font-weight:600;">Current</span>' : ''}
            ${v.is_archived ? '<span style="font-size:9px;padding:1px 6px;border-radius:4px;background:var(--warm)15;color:var(--warm);font-weight:600;">Archived</span>' : ''}
          </div>
          <div style="font-size:10px;color:var(--text-faint);margin-top:2px;">
            ${formatDate(v.created_at)} · ${formatBytes(v.compressed_size_bytes || v.file_size_bytes)} · ${v.file_type.toUpperCase()}
          </div>
        </div>
      </div>`;
    }).join('');
  } catch (e) {
    list.innerHTML = '<div style="padding:16px;color:var(--red);font-size:12px;">Error: ' + e.message + '</div>';
  }
};

// Archive a resume (move from active to archived)
window.archiveDbResume = async function(resumeId) {
  if (!confirm('Archive this resume? It will be compressed and moved to cold storage.')) return;
  try {
    // Get tier to set expiry
    const userId = (await sb.auth.getUser()).data.user.id;
    const { data: limits } = await sb.rpc('check_resume_limits', { p_user_id: userId });
    const tier = limits?.tier || 'free';

    // Calculate expiry: Free=30d, Starter=90d, Pro=null
    let expiresAt = null;
    if (tier === 'free') {
      expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();
    } else if (tier === 'starter') {
      expiresAt = new Date(Date.now() + 90 * 86400000).toISOString();
    }

    const { error } = await sb.from('resume_archive')
      .update({
        is_active: false,
        is_archived: true,
        archived_at: new Date().toISOString(),
        archive_expires_at: expiresAt
      })
      .eq('resume_id', resumeId);
    if (error) throw error;
    loadResumeArchive();
  } catch (e) {
    alert('Archive failed: ' + e.message);
  }
};

// Restore an archived resume
window.restoreArchiveResume = async function(resumeId) {
  try {
    const { error } = await sb.from('resume_archive')
      .update({ is_active: true, is_archived: false, archived_at: null })
      .eq('resume_id', resumeId);
    if (error) throw error;
    loadResumeArchive();
  } catch (e) {
    alert('Restore failed: ' + e.message);
  }
};

// Delete a resume from archive
window.deleteArchiveResume = async function(resumeId) {
  if (!confirm('Permanently delete this resume from the archive? This cannot be undone.')) return;
  try {
    const { error } = await sb.from('resume_archive')
      .delete()
      .eq('resume_id', resumeId);
    if (error) throw error;
    loadResumeArchive();
  } catch (e) {
    alert('Delete failed: ' + e.message);
  }
};

// Helpers
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function formatDate(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Search filter
(function() {
  const searchEl = document.getElementById('archive-search');
  if (searchEl) {
    let _debounce;
    searchEl.addEventListener('input', function() {
      clearTimeout(_debounce);
      _debounce = setTimeout(function() { loadResumeArchive(); }, 300);
    });
  }
})();

// Check deep link on load
if (typeof checkArchiveDeepLink === 'function') checkArchiveDeepLink();

// Phase 4: Enhanced restore using server-side function
window.restoreArchiveResume = async function(resumeId) {
  try {
    const { data, error } = await sb.rpc('restore_archived_resume', {
      p_resume_id: resumeId
    });
    if (error) throw error;
    if (data && !data.success) {
      if (data.error === 'EXPIRED_UPGRADE_REQUIRED') {
        if (confirm(data.message + '\n\nGo to subscription page?')) {
          showPage('subscription');
        }
        return;
      }
      alert('Restore failed: ' + (data.error || 'Unknown error'));
      return;
    }
    loadResumeArchive();
  } catch (e) {
    alert('Restore failed: ' + e.message);
  }
};
