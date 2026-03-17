// @ts-nocheck
/**
 * admin-landing.js — LP-RESTRUCTURE-S3
 * Admin UI for managing landing_sections table.
 * Capabilities: list, toggle visibility, edit inline, drag-to-reorder,
 * image upload to landing-assets/ bucket, segment targeting, soft delete.
 */
(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────────────────────
  var _sections = [];
  var _editingId = null; // null = new section
  var _dragSrcIdx = null;

  // ── Init ───────────────────────────────────────────────────────────────────
  window.alInit = async function () {
    await alLoadSections();
    document.getElementById('al-add-btn').addEventListener('click', function () {
      alOpenModal(null);
    });
  };

  // ── Load sections from Supabase ───────────────────────────────────────────
  async function alLoadSections() {
    var list = document.getElementById('al-section-list');
    if (!list) return;
    list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-faint);">Loading…</div>';
    try {
      var { data, error } = await sb
        .from('landing_sections')
        .select('*')
        .is('archived_at', null)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      _sections = data || [];
      alRenderList();
    } catch (e) {
      reportError('admin_landing:load', e);
      list.innerHTML = '<div style="color:var(--error);padding:20px;">Failed to load sections. ' + (e.message || '') + '</div>';
    }
  }

  // ── Render section list ───────────────────────────────────────────────────
  function alRenderList() {
    var list = document.getElementById('al-section-list');
    if (!list) return;
    if (!_sections.length) {
      list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-faint);">No sections yet. Click "+ Add Section" to create one.</div>';
      return;
    }

    list.innerHTML = '';
    _sections.forEach(function (s, idx) {
      var card = document.createElement('div');
      card.className = 'al-card';
      card.setAttribute('draggable', 'true');
      card.setAttribute('data-id', s.id);
      card.setAttribute('data-idx', idx);
      card.style.cssText = [
        'display:flex;align-items:center;gap:14px;padding:14px 16px;',
        'background:var(--bg-card);border:1px solid var(--border);border-radius:10px;',
        'cursor:default;transition:opacity .15s;',
        s.is_visible ? '' : 'opacity:0.55;'
      ].join('');

      var imgThumb = s.image_url
        ? '<img src="' + escHtml(s.image_url) + '" alt="" style="width:52px;height:36px;object-fit:cover;border-radius:5px;border:1px solid var(--border);flex-shrink:0;">'
        : '<div style="width:52px;height:36px;background:var(--bg-main);border-radius:5px;border:1px solid var(--border);flex-shrink:0;display:flex;align-items:center;justify-content:center;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="m3 9 5-5 4 4 4-4 5 5"/></svg></div>';

      var orientBadge = '<span style="font-size:10px;padding:2px 7px;border-radius:10px;background:var(--bg-main);color:var(--text-dim);border:1px solid var(--border);">' + escHtml(s.orientation) + '</span>';
      var segBadge = s.segment !== 'all'
        ? '<span style="font-size:10px;padding:2px 7px;border-radius:10px;background:rgba(59,130,246,.1);color:#60a5fa;border:1px solid rgba(59,130,246,.25);">' + escHtml(s.segment) + '</span>'
        : '';

      card.innerHTML =
        '<div style="cursor:grab;color:var(--text-faint);flex-shrink:0;padding:2px 4px;" title="Drag to reorder">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6h.01M8 12h.01M8 18h.01M16 6h.01M16 12h.01M16 18h.01"/></svg>' +
        '</div>' +
        imgThumb +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:14px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escHtml(s.title) + '</div>' +
          '<div style="font-size:12px;color:var(--text-dim);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escHtml(s.subtitle || '—') + '</div>' +
          '<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;">' + orientBadge + segBadge + '</div>' +
        '</div>' +
        '<label style="display:flex;align-items:center;gap:7px;cursor:pointer;flex-shrink:0;" title="Toggle visibility">' +
          '<input type="checkbox" ' + (s.is_visible ? 'checked' : '') + ' onchange="alToggleVisible(\'' + s.id + '\',this.checked)" style="width:16px;height:16px;cursor:pointer;">' +
          '<span style="font-size:12px;color:var(--text-dim);">' + (s.is_visible ? 'Live' : 'Hidden') + '</span>' +
        '</label>' +
        '<button class="btn btn-secondary btn-sm" onclick="alOpenModal(\'' + s.id + '\')" style="flex-shrink:0;">Edit</button>' +
        '<button onclick="alSoftDelete(\'' + s.id + '\')" title="Archive section" style="background:none;border:none;cursor:pointer;color:var(--text-faint);padding:4px;flex-shrink:0;">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/></svg>' +
        '</button>';

      // Drag events
      card.addEventListener('dragstart', function (e) {
        _dragSrcIdx = idx;
        e.dataTransfer.effectAllowed = 'move';
        card.style.opacity = '0.4';
      });
      card.addEventListener('dragend', function () {
        card.style.opacity = s.is_visible ? '1' : '0.55';
      });
      card.addEventListener('dragover', function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        card.style.borderColor = 'var(--accent)';
      });
      card.addEventListener('dragleave', function () {
        card.style.borderColor = 'var(--border)';
      });
      card.addEventListener('drop', function (e) {
        e.preventDefault();
        card.style.borderColor = 'var(--border)';
        if (_dragSrcIdx !== null && _dragSrcIdx !== idx) {
          alReorder(_dragSrcIdx, idx);
        }
        _dragSrcIdx = null;
      });

      list.appendChild(card);
    });
  }

  // ── Toggle visibility ─────────────────────────────────────────────────────
  window.alToggleVisible = async function (id, visible) {
    try {
      var { error } = await sb
        .from('landing_sections')
        .update({ is_visible: visible })
        .eq('id', id);
      if (error) throw error;
      var s = _sections.find(function (x) { return x.id === id; });
      if (s) s.is_visible = visible;
      alRenderList();
      showToast(visible ? 'Section is now live' : 'Section hidden', 'success');
      captureEvent('al_toggle_visibility', { id: id, visible: visible });
    } catch (e) {
      reportError('admin_landing:toggle', e);
      showToast('Failed to update visibility', 'error');
    }
  };

  // ── Drag-to-reorder ───────────────────────────────────────────────────────
  async function alReorder(fromIdx, toIdx) {
    var reordered = _sections.slice();
    var moved = reordered.splice(fromIdx, 1)[0];
    reordered.splice(toIdx, 0, moved);

    // Assign new sort_order values
    reordered.forEach(function (s, i) { s.sort_order = i + 1; });
    _sections = reordered;
    alRenderList();

    // Batch update
    try {
      var updates = reordered.map(function (s) {
        return sb.from('landing_sections').update({ sort_order: s.sort_order }).eq('id', s.id);
      });
      await Promise.all(updates);
      captureEvent('al_reorder', { count: reordered.length });
    } catch (e) {
      reportError('admin_landing:reorder', e);
      showToast('Reorder saved but may need refresh', 'error');
    }
  }

  // ── Open modal ────────────────────────────────────────────────────────────
  window.alOpenModal = function (id) {
    _editingId = id || null;
    var s = id ? _sections.find(function (x) { return x.id === id; }) : null;

    document.getElementById('al-modal-title').textContent = s ? 'Edit Section' : 'Add Section';
    document.getElementById('al-f-subtitle').value = s ? (s.subtitle || '') : '';
    document.getElementById('al-f-title').value = s ? (s.title || '') : '';
    document.getElementById('al-f-body').value = s ? (s.body_text || '') : '';
    document.getElementById('al-f-cta-text').value = s ? (s.cta_text || '') : '';
    document.getElementById('al-f-cta-url').value = s ? (s.cta_url || '') : '';
    document.getElementById('al-f-orientation').value = s ? (s.orientation || 'auto') : 'auto';
    document.getElementById('al-f-segment').value = s ? (s.segment || 'all') : 'all';
    document.getElementById('al-f-img').value = '';

    var imgCurrent = document.getElementById('al-img-current');
    var imgPreview = document.getElementById('al-img-preview');
    var imgUrlDisplay = document.getElementById('al-img-url-display');
    if (s && s.image_url) {
      imgPreview.src = s.image_url;
      imgUrlDisplay.textContent = s.image_url;
      imgCurrent.style.display = 'block';
    } else {
      imgCurrent.style.display = 'none';
    }

    var overlay = document.getElementById('al-modal-overlay');
    overlay.style.display = 'flex';
    document.getElementById('al-f-title').focus();
  };

  window.alCloseModal = function () {
    document.getElementById('al-modal-overlay').style.display = 'none';
    _editingId = null;
  };

  // Close on overlay click
  document.getElementById('al-modal-overlay') && document.getElementById('al-modal-overlay').addEventListener('click', function (e) {
    if (e.target === document.getElementById('al-modal-overlay')) alCloseModal();
  });

  // ── Save section ──────────────────────────────────────────────────────────
  window.alSaveSection = async function () {
    var title = document.getElementById('al-f-title').value.trim();
    if (!title) {
      showToast('Title is required', 'error');
      document.getElementById('al-f-title').focus();
      return;
    }

    var saveBtn = document.getElementById('al-modal-save');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';

    try {
      // Handle image upload if a file was selected
      var imageUrl = null;
      var imgFile = document.getElementById('al-f-img').files[0];
      if (imgFile) {
        imageUrl = await alUploadImage(imgFile);
        if (!imageUrl) {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save';
          return; // error already toasted inside alUploadImage
        }
      }

      var payload = {
        title: title,
        subtitle: document.getElementById('al-f-subtitle').value.trim(),
        body_text: document.getElementById('al-f-body').value.trim(),
        cta_text: document.getElementById('al-f-cta-text').value.trim() || null,
        cta_url: document.getElementById('al-f-cta-url').value.trim() || null,
        orientation: document.getElementById('al-f-orientation').value,
        segment: document.getElementById('al-f-segment').value,
      };
      if (imageUrl) payload.image_url = imageUrl;

      var error;
      if (_editingId) {
        // UPDATE existing
        ({ error } = await sb.from('landing_sections').update(payload).eq('id', _editingId));
      } else {
        // INSERT new draft
        var maxOrder = _sections.reduce(function (m, s) { return Math.max(m, s.sort_order || 0); }, 0);
        payload.sort_order = maxOrder + 1;
        payload.is_visible = false;
        ({ error } = await sb.from('landing_sections').insert(payload));
      }

      if (error) throw error;

      alCloseModal();
      await alLoadSections();
      showToast(_editingId ? 'Section updated' : 'Section created (hidden — toggle to make live)', 'success');
      captureEvent('al_save_section', { editing: !!_editingId });

    } catch (e) {
      reportError('admin_landing:save', e);
      showToast('Save failed: ' + (e.message || 'Unknown error'), 'error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save';
    }
  };

  // ── Upload image to landing-assets/ ──────────────────────────────────────
  async function alUploadImage(file) {
    if (file.size > 5 * 1024 * 1024) {
      showToast('Image must be under 5MB', 'error');
      return null;
    }
    var ext = file.name.split('.').pop().toLowerCase();
    var filename = 'section-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7) + '.' + ext;

    try {
      var { error } = await sb.storage.from('landing-assets').upload(filename, file, {
        contentType: file.type,
        upsert: false
      });
      if (error) throw error;

      var { data: urlData } = sb.storage.from('landing-assets').getPublicUrl(filename);
      captureEvent('al_image_upload', { filename: filename, size: file.size });
      return urlData.publicUrl;
    } catch (e) {
      reportError('admin_landing:upload', e);
      showToast('Image upload failed: ' + (e.message || 'Unknown error'), 'error');
      return null;
    }
  }

  // ── Soft delete ───────────────────────────────────────────────────────────
  window.alSoftDelete = async function (id) {
    var s = _sections.find(function (x) { return x.id === id; });
    if (!confirm('Archive "' + (s ? s.title : 'this section') + '"? It will be hidden from the landing page immediately.')) return;
    try {
      var { error } = await sb.from('landing_sections').update({
        is_visible: false,
        archived_at: new Date().toISOString()
      }).eq('id', id);
      if (error) throw error;
      _sections = _sections.filter(function (x) { return x.id !== id; });
      alRenderList();
      showToast('Section archived', 'success');
      captureEvent('al_soft_delete', { id: id });
    } catch (e) {
      reportError('admin_landing:delete', e);
      showToast('Archive failed', 'error');
    }
  };

  // ── Utility ───────────────────────────────────────────────────────────────
  function escHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Register in BJ namespace
  if (window.BJ) {
    window.BJ.alInit = window.alInit;
    window.BJ._registry['alInit'] = { module: 'admin-landing', registered: Date.now() };
  }
})();
