
// --- TAB: CONTENT (Editorial Engine) ---
async function loadContentTab() {
  console.log("[Admin] Loading Content tab");
  try {
    var statusSel = document.getElementById("ct-filter-status");
    var catSel = document.getElementById("ct-filter-category");
    var refreshBtn = document.getElementById("ct-refresh-btn");
    var detectBtn = document.getElementById("ct-detect-btn");
    var generateBtn = document.getElementById("ct-generate-btn");
    var closePreview = document.getElementById("ct-close-preview");
    var actionStatus = document.getElementById("ct-action-status");

    if (refreshBtn) refreshBtn.onclick = function() { fetchContentStories(); };
    if (statusSel) statusSel.onchange = function() { fetchContentStories(); };
    if (catSel) catSel.onchange = function() { fetchContentStories(); };
    if (closePreview) closePreview.onclick = function() {
      document.getElementById("ct-preview-panel").style.display = "none";
    };

    if (detectBtn) detectBtn.onclick = async function() {
      detectBtn.disabled = true;
      actionStatus.textContent = "Running detection...";
      try {
        var resp = await fetch(SUPABASE_URL + "/functions/v1/detect-editorial-insights", {
          method: "POST",
          headers: { "Authorization": "Bearer " + SUPABASE_KEY, "Content-Type": "application/json" }
        });
        var data = await resp.json();
        actionStatus.textContent = "Detected " + (data.detected || 0) + " stories (" + (data.elapsed_ms || "?") + "ms)";
        fetchContentStories();
      } catch(e) {
        actionStatus.textContent = "Detection failed: " + e.message;
      }
      detectBtn.disabled = false;
    };

    if (generateBtn) generateBtn.onclick = async function() {
      generateBtn.disabled = true;
      actionStatus.textContent = "Generating content (this may take ~60s)...";
      try {
        var resp = await fetch(SUPABASE_URL + "/functions/v1/generate-editorial-content", {
          method: "POST",
          headers: { "Authorization": "Bearer " + SUPABASE_KEY, "Content-Type": "application/json" }
        });
        var data = await resp.json();
        actionStatus.textContent = "Generated " + (data.generated || 0) + " / Failed " + (data.failed || 0) + " (" + (data.elapsed_ms || "?") + "ms)";
        fetchContentStories();
      } catch(e) {
        actionStatus.textContent = "Generation failed: " + e.message;
      }
      generateBtn.disabled = false;
    };

    fetchContentStories();
  } catch (e) {
    console.error('[Admin] Content tab error:', e); toastError('Content tab failed to load');
  }
}

async function fetchContentStories() {
  try {
    var statusFilter = document.getElementById("ct-filter-status").value;
    var catFilter = document.getElementById("ct-filter-category").value;

    var url = SUPABASE_URL + "/rest/v1/content_stories?select=id,story_type,category,headline,lede,body_html,meta_description,social_snippet,chart_config,evergreen_link,score,status,tags,created_at&order=score.desc,created_at.desc&limit=100";
    if (statusFilter) url += "&status=eq." + statusFilter;
    if (catFilter) url += "&category=eq." + catFilter;

    var resp = await fetch(url, {
      headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY }
    });
    var stories = await resp.json();

    var allUrl = SUPABASE_URL + "/rest/v1/content_stories?select=status";
    var allResp = await fetch(allUrl, {
      headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY }
    });
    var allStories = await allResp.json();
    var counts = { total: allStories.length, pending: 0, approved: 0, published: 0, rejected: 0 };
    allStories.forEach(function(s) {
      if (counts[s.status] !== undefined) counts[s.status]++;
    });
    document.getElementById("ct-total").textContent = counts.total;
    document.getElementById("ct-pending").textContent = counts.pending;
    document.getElementById("ct-approved").textContent = counts.approved;
    document.getElementById("ct-published").textContent = counts.published;
    document.getElementById("ct-rejected").textContent = counts.rejected;

    var tbody = document.getElementById("ct-stories-body");
    if (!tbody) return;

    if (!stories.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-dim);padding:20px">No stories found</td></tr>';
      return;
    }

    tbody.innerHTML = stories.map(function(s) {
      var dt = new Date(s.created_at);
      var dateStr = dt.toLocaleDateString() + " " + dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      var statusColors = { pending: "#f59e0b", approved: "#22c55e", published: "#3b82f6", scheduled: "#8b5cf6", rejected: "#ef4444" };
      var statusColor = statusColors[s.status] || "#888";
      var hasContent = s.body_html ? "Y" : "N";
      var scoreColor = s.score >= 70 ? "#22c55e" : s.score >= 40 ? "#f59e0b" : "#888";

      var actions = "";
      if (s.status === "pending") {
        actions = '<button onclick="contentAction(' + s.id + ',\'approved\')" style="padding:2px 8px;font-size:11px;background:#22c55e;color:#fff;border:none;border-radius:4px;cursor:pointer;margin-right:4px" title="Approve">V</button>' +
                  '<button onclick="contentAction(' + s.id + ',\'rejected\')" style="padding:2px 8px;font-size:11px;background:#ef4444;color:#fff;border:none;border-radius:4px;cursor:pointer" title="Reject">X</button>';
      } else if (s.status === "approved") {
        actions = '<button onclick="contentAction(' + s.id + ',\'published\')" style="padding:2px 8px;font-size:11px;background:#3b82f6;color:#fff;border:none;border-radius:4px;cursor:pointer">Publish</button>';
      }

      return '<tr style="cursor:pointer" onclick="previewStory(' + s.id + ')">' +
        '<td style="color:' + scoreColor + ';font-weight:600">' + s.score + '</td>' +
        '<td style="font-size:11px">' + hasContent + ' ' + escHtml(s.story_type) + '</td>' +
        '<td>' + escHtml(s.category) + '</td>' +
        '<td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escHtml(s.headline) + '</td>' +
        '<td><span style="color:' + statusColor + ';font-weight:600;font-size:12px">' + s.status.toUpperCase() + '</span></td>' +
        '<td style="font-size:11px;white-space:nowrap">' + dateStr + '</td>' +
        '<td style="text-align:right" onclick="event.stopPropagation()">' + actions + '</td></tr>';
    }).join("");

    window._contentStories = {};
    stories.forEach(function(s) { window._contentStories[s.id] = s; });
  } catch(e) {
    console.error('[Admin] Fetch content stories error:', e); toastWarning('Failed to load content stories');
  }
}

function previewStory(id) {
  var s = window._contentStories && window._contentStories[id];
  if (!s) return;
  var panel = document.getElementById("ct-preview-panel");
  panel.style.display = "block";
  document.getElementById("ct-preview-headline").textContent = s.headline || "--";
  document.getElementById("ct-preview-lede").textContent = s.lede || "--";
  document.getElementById("ct-preview-body").innerHTML = (typeof DOMPurify !== "undefined" && s.body_html ? DOMPurify.sanitize(s.body_html) : s.body_html) || "<em>No content generated yet</em>";
  document.getElementById("ct-preview-meta").textContent = s.meta_description || "--";
  document.getElementById("ct-preview-social").textContent = s.social_snippet || "--";
  document.getElementById("ct-preview-link").textContent = s.evergreen_link || "--";
  document.getElementById("ct-preview-chart").textContent = s.chart_config ? JSON.stringify(s.chart_config) : "--";
  panel.scrollIntoView({ behavior: "smooth" });
}

async function contentAction(id, newStatus) {
  try {
    var updates = { status: newStatus };
    if (newStatus === "published") {
      updates.published_at = new Date().toISOString();
    }
    var resp = await fetch(SUPABASE_URL + "/rest/v1/content_stories?id=eq." + id, {
      method: "PATCH",
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": "Bearer " + SUPABASE_KEY,
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      },
      body: JSON.stringify(updates)
    });
    if (resp.ok) {
      document.getElementById("ct-action-status").textContent = "Story #" + id + " -> " + newStatus;
      fetchContentStories();
    } else {
      document.getElementById("ct-action-status").textContent = "Update failed";
    }
  } catch(e) {
    document.getElementById("ct-action-status").textContent = e.message;
  }
}
