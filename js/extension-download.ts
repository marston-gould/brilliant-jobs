// @ts-nocheck
// js/extension-download.js — Phase 12: Fingerprinted Extension Download
// Extension 4.0.0
//
// Handles:
// 1. Requesting a unique build from the build-extension Edge Function
// 2. Storing the channel map for this build so dashboard↔extension comms work
// 3. Download progress UI
// 4. Build history display

(function() {
  'use strict';

  // ─── Channel Map Management ─────────────────────────────────
  // When the user downloads a fingerprinted build, the extension's internal
  // message channel names are randomized. The dashboard needs to know the
  // mapping so it can send the right message types via externally_connectable.

  const DEFAULT_CHANNEL_MAP = {
    'dashboard:ping':        'dashboard:ping',
    'dashboard:apply':       'dashboard:apply',
    'dashboard:fillCurrent': 'dashboard:fillCurrent',
    'dashboard:setTier':     'dashboard:setTier',
    'dashboard:getJDMatch':  'dashboard:getJDMatch',
    'dashboard:getState':    'dashboard:getState',
  };

  let _activeChannelMap = null;

  /**
   * Load the channel map from the most recent build.
   * Falls back to default (non-fingerprinted) if no build exists.
   */
  async function loadChannelMap() {
    try {
      // Try localStorage first (fastest)
      const cached = localStorage.getItem('bj_channel_map');
      if (cached) {
        _activeChannelMap = JSON.parse(cached);
        return _activeChannelMap;
      }

      // Fetch from Supabase — most recent build for this user
      const { data, error } = await sb
        .from('extension_builds')
        .select('channel_map, build_id')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data && !error && data.channel_map) {
        _activeChannelMap = data.channel_map;
        localStorage.setItem('bj_channel_map', JSON.stringify(_activeChannelMap));
        localStorage.setItem('bj_build_id', data.build_id);
        return _activeChannelMap;
      }
    } catch (e) {
      reportError('extension_download', e);
      console.warn('[BJ] Channel map load failed, using defaults:', e.message);
    }

    _activeChannelMap = DEFAULT_CHANNEL_MAP;
    return _activeChannelMap;
  }

  /**
   * Resolve a canonical channel name to the fingerprinted version.
   * Used by apply-workflow.js when sending messages to the extension.
   */
  function resolveChannel(canonical) {
    if (!_activeChannelMap) return canonical;
    return _activeChannelMap[canonical] || canonical;
  }

  // ─── Build Download ─────────────────────────────────────────

  let _downloading = false;

  /**
   * Request and download a unique fingerprinted extension build.
   */
  async function downloadExtensionBuild() {
    if (_downloading) return;
    _downloading = true;

    // EXT-BUILD-001-S2: Support both old (#extension-download-btn) and current (#download-btn) IDs
    const btn = document.getElementById('extension-download-btn') || document.getElementById('download-btn');
    const status = document.getElementById('extension-download-status') || document.getElementById('download-status');

    try {
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Building your unique extension...';
      }
      if (status) {
        status.textContent = 'Generating personalized build...';
        status.className = 'text-amber-400 text-sm mt-2';
      }

      const session = await sb.auth.getSession();
      const token = session?.data?.session?.access_token;
      if (!token) {
        throw new Error('Not authenticated. Please log in first.');
      }

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/build-extension`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || `Build failed (${response.status})`);
      }

      // Get the build ID from header
      const buildId = response.headers.get('X-Build-Id') || 'unknown';

      // Download the ZIP
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `brilliant-jobs-extension-${buildId.slice(3, 11)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Fetch and cache the new channel map
      const { data: buildData } = await sb
        .from('extension_builds')
        .select('channel_map')
        .eq('build_id', buildId)
        .single();

      if (buildData?.channel_map) {
        _activeChannelMap = buildData.channel_map;
        localStorage.setItem('bj_channel_map', JSON.stringify(_activeChannelMap));
        localStorage.setItem('bj_build_id', buildId);
      }

      // Update UI
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Download Extension';
      }
      if (status) {
        status.textContent = `✓ Build ${buildId.slice(3, 11)} downloaded. Unzip and load in chrome://extensions (Developer Mode → Load Unpacked).`;
        status.className = 'text-green-400 text-sm mt-2';
      }

      // Track download timestamp
      await sb
        .from('extension_builds')
        .update({ downloaded_at: new Date().toISOString() })
        .eq('build_id', buildId);

    } catch (err) {
      reportError('extension_download', err);
      console.error('[BJ] Extension build failed:', err);
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Download Extension';
      }
      if (status) {
        status.textContent = `✗ ${err.message}`;
        status.className = 'text-red-400 text-sm mt-2';
      }
    } finally {
      _downloading = false;
    }
  }

  // ─── Build History ──────────────────────────────────────────

  async function loadBuildHistory() {
    const container = document.getElementById('extension-build-history');
    if (!container) return;

    try {
      const { data, error } = await sb
        .from('extension_builds')
        .select('build_id, created_at, tier_at_build, installed_at, last_seen_at')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error || !data || data.length === 0) {
        container.innerHTML = '<p class="text-zinc-500 text-sm">No builds yet. Download your first extension above.</p>';
        return;
      }

      const rows = data.map(b => {
        const date = new Date(b.created_at).toLocaleDateString();
        const shortId = b.build_id.slice(3, 11);
        const status = b.installed_at
          ? `<span class="text-green-400">Active</span>`
          : b.last_seen_at
            ? `<span class="text-amber-400">Seen</span>`
            : `<span class="text-zinc-500">Downloaded</span>`;
        return `<tr>
          <td class="px-3 py-2 text-zinc-300 font-mono text-sm">${shortId}</td>
          <td class="px-3 py-2 text-zinc-400 text-sm">${date}</td>
          <td class="px-3 py-2 text-sm">${b.tier_at_build}</td>
          <td class="px-3 py-2 text-sm">${status}</td>
        </tr>`;
      }).join('');

      container.innerHTML = `
        <table class="w-full text-left">
          <thead>
            <tr class="text-zinc-500 text-xs uppercase">
              <th class="px-3 py-1">Build</th>
              <th class="px-3 py-1">Date</th>
              <th class="px-3 py-1">Tier</th>
              <th class="px-3 py-1">Status</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      `;
    } catch (e) {
      reportError('extension_download', e);
      console.warn('[BJ] Build history load failed:', e.message);
    }
  }

  // ─── Initialize ─────────────────────────────────────────────

  function initExtensionDownload() {
    // Bind download button — support both IDs
    const btn = document.getElementById('extension-download-btn') || document.getElementById('download-btn');
    if (btn && !btn._bjBound) {
      btn.addEventListener('click', downloadExtensionBuild);
      btn._bjBound = true;
    }

    // Load channel map for comms
    loadChannelMap();

    // Load build history if on settings/setup page
    loadBuildHistory();
  }

  // ─── Exports ────────────────────────────────────────────────
  window._bjExtensionDownload = {
    downloadBuild: downloadExtensionBuild,
    resolveChannel,
    loadChannelMap,
    getChannelMap: () => _activeChannelMap || DEFAULT_CHANNEL_MAP,
    loadBuildHistory,
    init: initExtensionDownload,
  };

  // Auto-init when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initExtensionDownload);
  } else {
    initExtensionDownload();
  }

})();
