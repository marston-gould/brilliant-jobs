// ============================================================
// KEYWORD EXTRACTION ENGINE (P4)
// ============================================================
const KW_STOPWORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with','by','from','as','is','was','are','were',
  'be','been','being','have','has','had','do','does','did','will','would','shall','should','may','might','can',
  'could','must','need','this','that','these','those','it','its','we','our','you','your','they','their','he',
  'she','his','her','who','which','what','when','where','how','all','each','every','both','few','more','most',
  'other','some','such','no','not','only','own','same','so','than','too','very','just','about','above','after',
  'again','also','am','any','because','before','below','between','down','during','further','here','into','out',
  'over','then','there','through','under','until','up','while','if','or','nor','per','via','etc','ie','eg',
  'able','across','along','already','among','another','around','away','back','become','behind','best','better',
  'beyond','come','day','different','done','either','else','end','even','find','first','get','give','go','going',
  'good','great','help','high','however','including','keep','know','last','least','less','let','like','long',
  'look','made','make','many','much','new','next','now','number','off','often','old','one','onto','part',
  'people','place','point','put','right','say','see','set','show','since','small','still','take','tell',
  'thing','think','three','time','turn','two','us','use','used','using','want','way','well','without','work',
  'working','works','world','year','years','able','apply','applicants','application','applications',
  'candidate','candidates','company','companies','description','duties','employment','employer','equal',
  'experience','include','includes','including','information','job','jobs','location','opportunities',
  'opportunity','position','positions','qualifications','qualified','required','requirements','responsible',
  'role','roles','skills','team','teams','employees','status','provide','providing','related','may','within',
  'based','ensure','must','strong','support','ability','following','current','please','com','www','http','https',
  'will','nbsp','amp','quot','lt','gt','div','span','class','style','href','src','img','br','ul','ol','li',
  'strong','em','table','tr','td','th','p','h1','h2','h3','h4','h5','h6','section','header','footer',
  'width','height','color','background','font','size','margin','padding','border','display','align','text'
]);

// Industry/role terms that are too generic to be useful
const KW_GENERIC = new Set([
  'full','time','base','level','senior','junior','lead','manager','director','associate','staff','principal',
  'remote','hybrid','onsite','office','salary','range','bonus','benefits','paid','annual','competitive',
  'preferred','minimum','bachelor','master','degree','equivalent','plus','knowledge','understanding',
  'excellent','written','verbal','communication','organizational','proven','track','record','attention',
  'detail','self','starter','motivated','passion','passionate','fast','paced','environment','collaborative',
  'cross','functional','hands','ability','demonstrated','proficiency','proficient','familiarity','familiar',
  'deep','solid','relevant','direct','extensive','developing','developed','build','building','create',
  'creating','manage','managing','management','drive','driving','driven','deliver','delivering','lead',
  'leading','leadership','execute','execution','implement','implementing','implementation','define',
  'defining','establish','establishing','maintain','maintaining','optimize','optimizing','oversee',
  'overseeing','coordinate','coordinating','collaborate','collaborating','analyze','analyzing','identify',
  'identifying','develop','growth','report','reporting','reports','responsible','responsibilities',
  'looking','join','exciting'
]);

function stripHtmlToText(html) {
  if (!html) return '';
  // First pass: decode any double-encoded HTML entities
  let cleaned = html.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const doc = new DOMParser().parseFromString(cleaned, 'text/html');
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
}

const KW_HTML_JUNK = new Set(['div','span','li','ul','ol','br','hr','td','tr','th','tbody','thead','table','strong','em','p','a','img','svg','path','h1','h2','h3','h4','h5','h6','nbsp','mdash','ndash','amp','quot','lt','gt','href','src','class','style','id','type','data','width','height']);

function tokenize(text) {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s\-\+\#\.]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !/^\d+$/.test(w) && !KW_HTML_JUNK.has(w));
}

function extractNgrams(jobs, maxPerGroup = 40) {
  const uniCounts = {};
  const biCounts = {};
  const triCounts = {};
  let jobsWithContent = 0;

  for (const job of jobs) {
    const raw = job.content || job.description || '';
    if (!raw) continue;
    jobsWithContent++;

    const text = stripHtmlToText(raw);
    const words = tokenize(text);

    // Track per-job uniqueness (count each term once per job, not per occurrence)
    const seenUni = new Set();
    const seenBi = new Set();
    const seenTri = new Set();

    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      // Unigrams
      if (!KW_STOPWORDS.has(w) && !KW_GENERIC.has(w) && w.length > 2) {
        if (!seenUni.has(w)) { uniCounts[w] = (uniCounts[w] || 0) + 1; seenUni.add(w); }
      }
      // Bigrams
      if (i < words.length - 1) {
        const bi = w + ' ' + words[i+1];
        if (!KW_STOPWORDS.has(w) && !KW_STOPWORDS.has(words[i+1]) && !seenBi.has(bi)) {
          biCounts[bi] = (biCounts[bi] || 0) + 1;
          seenBi.add(bi);
        }
      }
      // Trigrams
      if (i < words.length - 2) {
        const tri = w + ' ' + words[i+1] + ' ' + words[i+2];
        const ws = [w, words[i+1], words[i+2]];
        const stopCount = ws.filter(x => KW_STOPWORDS.has(x)).length;
        if (stopCount <= 1 && !seenTri.has(tri)) {
          triCounts[tri] = (triCounts[tri] || 0) + 1;
          seenTri.add(tri);
        }
      }
    }
  }

  // Minimum threshold: must appear in at least 2 JDs (or 10% of jobs, whichever is higher)
  const minCount = Math.max(2, Math.ceil(jobsWithContent * 0.10));

  const sortAndFilter = (counts) => Object.entries(counts)
    .filter(([term, count]) => count >= minCount && !KW_GENERIC.has(term))
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxPerGroup);

  return {
    skills: sortAndFilter(uniCounts),
    bigrams: sortAndFilter(biCounts),
    trigrams: sortAndFilter(triCounts),
    jobsAnalyzed: jobsWithContent,
    totalJobs: jobs.length
  };
}

function renderKeywordChips(entries, containerId, maxCount) {
  const container = document.getElementById(containerId);
  if (!entries || entries.length === 0) {
    container.innerHTML = '<div class="kw-empty">Not enough job descriptions loaded yet. Open a few job details first to cache their content.</div>';
    return;
  }
  const top = entries[0]?.[1] || 1;
  const tier1Threshold = top * 0.6;

  container.innerHTML = entries.map(([term, count]) => {
    const tier = count >= tier1Threshold ? 'tier-1' : count >= tier1Threshold * 0.5 ? 'tier-2' : '';
    const pct = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
    return `<div class="kw-chip ${tier}" title="Found in ${count} job descriptions (${pct}% of analyzed jobs)">
      ${term} <span class="kw-count">${count}</span>
    </div>`;
  }).join('');
}

function runKeywordAnalysis() {
  const results = extractNgrams(allJobs);
  $('#kw-job-count').textContent = `across ${results.jobsAnalyzed} of ${results.totalJobs} jobs`;
  renderKeywordChips(results.skills, 'kw-grid-skills', results.jobsAnalyzed);
  renderKeywordChips(results.bigrams, 'kw-grid-bigrams', results.jobsAnalyzed);
  renderKeywordChips(results.trigrams, 'kw-grid-trigrams', results.jobsAnalyzed);
}

function toggleKeywordPanel() {
  const panel = $('#kw-panel');
  const btn = $('#kw-toggle-btn');
  const isOpen = panel.classList.contains('open');
  if (isOpen) {
    panel.classList.remove('open');
    btn.classList.remove('active');
  } else {
    panel.classList.add('open');
    btn.classList.add('active');
    runKeywordAnalysis();
  }
}

// Keyword tab switching
document.addEventListener('click', e => {
  const tab = e.target.closest('.kw-tab');
  if (!tab) return;
  const tabName = tab.dataset.kwTab;
  $$('.kw-tab').forEach(t => t.classList.toggle('active', t === tab));
  $$('.kw-grid').forEach(g => g.classList.toggle('active', g.id === `kw-grid-${tabName}`));
});

// Auto-refresh keywords when panel is open and jobs reload
function refreshKeywordsIfOpen() {
  if ($('#kw-panel')?.classList.contains('open')) {
    runKeywordAnalysis();
  }
}

// ============================================================
// RESUME VS FILTER MATCH COMPARISON (P4)
// ============================================================
let _lastNgramResults = null;

// Override runKeywordAnalysis to cache results for match comparison
const _origRunKW = runKeywordAnalysis;
runKeywordAnalysis = function() {
  const results = extractNgrams(allJobs);
  _lastNgramResults = results;
  $('#kw-job-count').textContent = `across ${results.jobsAnalyzed} of ${results.totalJobs} jobs`;
  renderKeywordChips(results.skills, 'kw-grid-skills', results.jobsAnalyzed);
  renderKeywordChips(results.bigrams, 'kw-grid-bigrams', results.jobsAnalyzed);
  renderKeywordChips(results.trigrams, 'kw-grid-trigrams', results.jobsAnalyzed);

  // Populate resume dropdown
  const select = $('#kw-resume-select');
  const currentVal = select.value;
  select.innerHTML = '<option value="">Select a resume…</option>';
  resumes.filter(r => r.textStatus === 'ready' && r.keywords?.length > 0).forEach((r, i) => {
    const realIdx = resumes.indexOf(r);
    select.innerHTML += `<option value="${realIdx}">${r.name} (${r.keywords.length} keywords)</option>`;
  });
  if (currentVal) select.value = currentVal;

  // Refresh match if a resume is selected
  if (select.value) runResumeMatch();
};

window.runResumeMatch = function() {
  const select = $('#kw-resume-select');
  const summaryEl = $('#kw-match-summary');
  const chipsEl = $('#kw-match-chips');

  if (!select.value || !_lastNgramResults) {
    summaryEl.innerHTML = '';
    chipsEl.innerHTML = '<div class="kw-empty">Select a resume to compare against the top JD keywords.</div>';
    return;
  }

  const resume = resumes[parseInt(select.value)];
  if (!resume || !resume.keywords?.length) {
    summaryEl.innerHTML = '';
    chipsEl.innerHTML = '<div class="kw-empty">This resume has no extracted keywords.</div>';
    return;
  }

  // Build resume keyword set (lowercased)
  const resumeTerms = new Set(resume.keywords.map(([t]) => t.toLowerCase()));
  // Also check if resume raw text contains the term (broader match)
  const resumeText = (resume.extractedText || '').toLowerCase();

  // Compare against top JD unigrams
  const jdTerms = _lastNgramResults.skills.slice(0, 30);
  let matched = 0;
  let missing = 0;

  const chips = jdTerms.map(([term, count]) => {
    const inResume = resumeTerms.has(term) || resumeText.includes(term);
    if (inResume) matched++;
    else missing++;
    const style = inResume
      ? 'background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.25);color:var(--green);'
      : 'background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.2);color:var(--red);';
    const icon = inResume ? '✓' : '✗';
    return `<div class="kw-chip" style="${style}" title="${inResume ? 'Found in your resume' : 'MISSING from your resume — consider adding this term'}">
      <span style="font-size:10px;">${icon}</span> ${term} <span class="kw-count">${count}</span>
    </div>`;
  });

  const total = matched + missing;
  const pct = total > 0 ? Math.round((matched / total) * 100) : 0;
  const color = pct >= 70 ? 'var(--green)' : pct >= 40 ? 'var(--warm)' : 'var(--red)';
  const label = pct >= 70 ? 'Strong match' : pct >= 40 ? 'Partial match — review gaps' : 'Weak match — significant gaps';

  summaryEl.innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;padding:12px 16px;background:var(--bg-input);border-radius:8px;">
      <div style="font-family:var(--mono);font-size:28px;font-weight:700;color:${color};">${pct}%</div>
      <div>
        <div style="font-size:13px;font-weight:600;color:var(--text);">${matched} of ${total} top JD terms found in your resume</div>
        <div style="font-size:11px;color:${color};font-weight:500;">${label}</div>
      </div>
    </div>
    <div style="font-size:10px;color:var(--text-faint);margin-top:8px;">
      <span style="color:var(--green);">✓ green</span> = in your resume &nbsp; <span style="color:var(--red);">✗ red</span> = missing — add these to improve your match
    </div>
  `;

  chipsEl.innerHTML = chips.join('');
};

// Event delegation for job title clicks — opens full modal
document.addEventListener('click', e => {
  const link = e.target.closest('.job-title-link');
  if (link && link.dataset.jobid) {
    e.preventDefault();
    openJobModal(link.dataset.jobid);
  }
  // "→" click in preview snippet opens modal
  const more = e.target.closest('.preview-more');
  if (more && more.dataset.jobid) {
    e.preventDefault();
    openJobModal(more.dataset.jobid);
  }
});

// Global preview toggle — shows one-line description snippets under each title
function initPreviewToggle() {
  const toggle = $('#preview-toggle');
  if (!toggle) return;

  // Restore saved preference
  if (localStorage.getItem('bj_show_previews') === '1') {
    toggle.checked = true;
    $('#job-table')?.classList.add('show-previews');
  }

  toggle.addEventListener('change', () => {
    const table = $('#job-table');
    if (toggle.checked) {
      table.classList.add('show-previews');
      localStorage.setItem('bj_show_previews', '1');
      loadPreviewSnippets();
    } else {
      table.classList.remove('show-previews');
      localStorage.setItem('bj_show_previews', '0');
    }
  });
}

// Strip common Greenhouse slug suffixes from company names
function cleanCompanyName(name) {
  if (!name) return '';
  let n = name;
  // Remove common slug junk suffixes (case-insensitive, greedy)
  n = n.replace(/\s*(jobs?apply(?:now)?|careers?|jobs?|hiring|recruit(?:ing|ment)?|talent|hr|apply(?:now)?|greenhouse|workday|ats)\s*$/i, '');
  // Repeat in case of stacking: "companyjobsapplynow" → strip "applynow" then "jobs"
  n = n.replace(/(jobs?apply(?:now)?|careers?|jobs?|hiring|recruit(?:ing|ment)?|talent|hr|apply(?:now)?|greenhouse|workday|ats)$/i, '');
  n = n.replace(/(jobs?apply(?:now)?|careers?|jobs?|hiring|recruit(?:ing|ment)?|talent|apply(?:now)?)$/i, '');
  return n.trim() || name;
}
function extractSnippet(html, maxLen) {
  if (!html) return '';
  const div = document.createElement('div');
  div.innerHTML = html;
  const text = div.textContent || div.innerText || '';
  // Clean up whitespace
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > maxLen ? clean.slice(0, maxLen) : clean;
}

// Load preview snippets for all visible jobs
async function loadPreviewSnippets() {
  const snippetEls = document.querySelectorAll('.job-snippet-text[data-preview-id]');
  if (!snippetEls.length) return;

  for (const el of snippetEls) {
    const jobId = el.dataset.previewId;
    if (el.dataset.loaded === '1') continue; // Already loaded

    const job = allJobs.find(j => j.greenhouse_id === jobId);
    let content = job?.content || null;

    if (content) {
      // Already cached — render immediately
      const snippet = extractSnippet(content, 300);
      el.innerHTML = snippet + `<span class="preview-more" data-jobid="${jobId}"> →</span>`;
      el.dataset.loaded = '1';
    } else {
      // Mark as loading, fetch in background
      el.innerHTML = '<span style="opacity:0.4;">loading…</span>';

      // Fetch from Greenhouse API
      try {
        const jobUrl = job?.url || '';
        const urlMatch = jobUrl.match(/boards\.greenhouse\.io\/([^\/]+)\/jobs\/(\d+)/);
        let apiUrl = null;
        if (urlMatch) {
          apiUrl = `https://boards-api.greenhouse.io/v1/boards/${urlMatch[1]}/jobs/${urlMatch[2]}`;
        } else if (job?.company_slug) {
          apiUrl = `https://boards-api.greenhouse.io/v1/boards/${job.company_slug}/jobs/${jobId}`;
        }

        if (apiUrl) {
          const resp = await fetch(apiUrl);
          if (resp.ok) {
            const data = await resp.json();
            if (data.content) {
              content = decodeJobContent(data.content);
              if (job) job.content = content;
              sb.from('ats_jobs').update({ content }).eq('greenhouse_id', jobId).then(() => {});

              // Extract salary while we have it
              if (job && !job.salary_min) {
                const salary = parseSalaryFromContent(content);
                if (salary) {
                  job.salary_min = salary.min;
                  job.salary_max = salary.max;
                  job.salary_currency = salary.currency || 'USD'; job.salary_rate = salary.rate || 'yr';
                  sb.from('ats_jobs').update({ salary_min: salary.min, salary_max: salary.max, salary_raw: salary.raw, salary_currency: salary.currency || 'USD', salary_rate: salary.rate || 'yr' })
                    .eq('greenhouse_id', jobId).then(() => {});
                  const cell = document.querySelector(`tr[data-jobid="${jobId}"] .jt-salary`);
                  if (cell) cell.textContent = formatSalaryCell(job);
                }
              }
            }
          }
        }
      } catch (e) {
        // Silently skip
      }

      if (content) {
        const snippet = extractSnippet(content, 300);
        el.innerHTML = snippet + `<span class="preview-more" data-jobid="${jobId}"> →</span>`;
      } else {
        el.innerHTML = '<span style="opacity:0.3;">no description available</span>';
      }
      el.dataset.loaded = '1';

      // Small delay between API calls
      await new Promise(r => setTimeout(r, 200));
    }
  }
}

// Initialize preview toggle after DOM ready
setTimeout(initPreviewToggle, 100);

// Robust HTML content decoder — handles any level of entity encoding
function decodeJobContent(raw) {
  if (!raw) return '';
  let html = raw;
  // Keep decoding until stable (handles double/triple encoding)
  for (let i = 0; i < 5; i++) {
    if (!html.includes('&lt;') && !html.includes('&amp;') && !html.includes('&#')) break;
    const tmp = document.createElement('textarea');
    tmp.innerHTML = html;
    const decoded = tmp.value;
    if (decoded === html) break; // stable
    html = decoded;
  }
  return html;
}

// Job Spec Modal
async function openJobModal(jobId, e) {
  if (e) e.preventDefault();
  console.log('[BJ] openJobModal called with:', jobId);
  const overlay = $('#job-modal-overlay');
  const titleEl = $('#job-modal-title');
  const metaEl = $('#job-modal-meta');
  const bodyEl = $('#job-modal-body');
  const footerEl = $('#job-modal-footer');
  const extLink = $('#job-modal-external');

  // Look up from cached results — instant, no extra fetch
  let job = allJobs.find(j => j.greenhouse_id === jobId);
  if (!job) {
    // Fallback: quick fetch just this one row
    const { data } = await sb.from('ats_jobs').select('*').eq('greenhouse_id', jobId).single();
    job = data;
  }

  // Show modal
  overlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  if (!job) {
    titleEl.textContent = 'Job not found';
    metaEl.textContent = '';
    bodyEl.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-faint);">This job could not be loaded.</div>';
    footerEl.innerHTML = '<button class="job-modal-close-btn" onclick="closeJobModal()">Close</button>';
    extLink.href = '#';
    return;
  }

  // Build proper URL
  const jobUrl = job.url && job.url.startsWith('http') ? job.url : job.url ? 'https://boards.greenhouse.io' + job.url : '#';

  // Populate header
  titleEl.textContent = job.title || 'Untitled';
  const metaParts = [job.company_name, formatLocation(job.location, job.loc_display)].filter(Boolean);
  if (job.department) metaParts.push(job.department);
  metaEl.textContent = metaParts.join('  \u00b7  ');
  extLink.href = jobUrl;

  // Populate body — robust decode that handles any level of HTML encoding
  const rawContent = job.content || job.description || null;
  if (rawContent) {
    bodyEl.innerHTML = decodeJobContent(rawContent);
    // Parse salary from cached content if not already parsed
    if (!job.salary_min) {
      const salary = parseSalaryFromContent(rawContent);
      if (salary) {
        job.salary_min = salary.min;
        job.salary_max = salary.max;
        job.salary_currency = salary.currency || 'USD'; job.salary_rate = salary.rate || 'yr';
        console.log(`[BJ] Salary extracted (cached): ${salary.currency || 'USD'} $${(salary.min/1000).toFixed(0)}k-$${(salary.max/1000).toFixed(0)}k from "${salary.raw}"`);
        sb.from('ats_jobs').update({ salary_min: salary.min, salary_max: salary.max, salary_raw: salary.raw, salary_currency: salary.currency || 'USD', salary_rate: salary.rate || 'yr' })
          .eq('greenhouse_id', jobId).then(() => {});
        // Update salary cell in feed
        const row = document.querySelector(`tr[data-jobid="${jobId}"] .jt-salary`);
        if (row) row.textContent = formatSalaryCell(job);
      }
    }
  } else {
    // Show loading state and fetch on demand
    bodyEl.innerHTML = '<div style="text-align:center;padding:40px;"><div class="loading-spinner" style="margin:0 auto 12px;"></div><div style="color:var(--text-faint);font-size:13px;">Loading job details…</div></div>';
    fetchJobSpec(jobId, jobUrl, bodyEl);
  }

  // Store for toggle between spec and form
  window._modalJobUrl = jobUrl;
  window._modalJobId = jobId;
  window._modalShowingForm = false;

  // Footer with action buttons — all sync back to feed
  const isSaved = savedJobIds.includes(jobId);
  const isApplied = appliedJobIds.includes(jobId);
  let footerHtml = '';
  if (isApplied) {
    footerHtml += '<span class="job-action-btn applied-btn">Applied ✓</span>';
  } else {
    // Build embed URL for Greenhouse iframe form
    const embedMatch = jobUrl.match(/boards\.greenhouse\.io\/([^\/]+)\/jobs\/(\d+)/);
    if (embedMatch) {
      footerHtml += '<button class="apply-btn apply-btn-default" id="modal-apply-here" onclick="toggleApplyForm()" style="padding:6px 16px;font-size:12px;">Apply</button>';
    } else {
      // No embeddable form — show ATS link as primary
      footerHtml += '<a href="' + jobUrl + '" target="_blank" rel="noopener" class="apply-btn apply-btn-default" style="padding:6px 16px;font-size:12px;text-decoration:none;">Apply on ATS ↗</a>';
    }
    const saveClass = isSaved ? 'job-action-btn saved-btn' : 'job-action-btn';
    const saveLabel = isSaved ? 'In Pipeline' : 'Add to Pipeline';
    footerHtml += '<button class="' + saveClass + '" id="modal-save-btn" onclick="modalSave(\'' + jobId + '\', this)">' + saveLabel + '</button>';
  }
  footerHtml += '<button class="job-action-btn hide-btn" onclick="modalHide(\'' + jobId + '\')" style="padding:4px 10px;font-size:11px;">Hide</button>';
  footerHtml += '<button class="job-modal-close-btn" onclick="closeJobModal()" style="margin-left:auto;">Close</button>';
  footerEl.innerHTML = footerHtml;
}


function closeJobModal(e) {
  if (e && e.target !== e.currentTarget) return;
  $('#job-modal-overlay').style.display = 'none';
  document.body.style.overflow = '';
  window._modalShowingForm = false;
}

// Toggle between job spec view and embedded Greenhouse application form
function toggleApplyForm() {
  const bodyEl = $('#job-modal-body');
  const btn = $('#modal-apply-here');
  const jobUrl = window._modalJobUrl;
  const jobId = window._modalJobId;

  if (window._modalShowingForm) {
    // Switch back to job spec
    window._modalShowingForm = false;
    btn.textContent = 'Apply';
    btn.style.background = '';
    btn.style.color = '';
    // Re-trigger the spec load
    const job = allJobs.find(j => j.greenhouse_id === jobId);
    if (job?.content) {
      bodyEl.innerHTML = decodeJobContent(job.content);
    } else {
      bodyEl.innerHTML = '<div style="text-align:center;padding:40px;"><div class="loading-spinner" style="margin:0 auto 12px;"></div><div style="color:var(--text-faint);font-size:13px;">Loading job details…</div></div>';
      fetchJobSpec(jobId, jobUrl, bodyEl);
    }
    return;
  }

  // Switch to application form
  window._modalShowingForm = true;
  btn.textContent = '← Back to Job Spec';
  btn.style.background = 'none';
  btn.style.color = 'var(--accent)';

  // Build Greenhouse embed URL
  const urlMatch = jobUrl.match(/boards\.greenhouse\.io\/([^\/]+)\/jobs\/(\d+)/);
  if (urlMatch) {
    const [, boardToken, numId] = urlMatch;
    const embedUrl = `https://boards.greenhouse.io/embed/job_app?for=${boardToken}&token=${numId}`;
    bodyEl.innerHTML = `
      <div style="display:flex;flex-direction:column;height:100%;min-height:500px;">
        <div style="font-size:12px;color:var(--text-faint);margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--border);">
          Complete your application below — this form submits directly to the company's hiring system
        </div>
        <iframe id="gh-apply-frame" src="${embedUrl}" style="flex:1;border:none;border-radius:8px;min-height:500px;width:100%;background:#fff;" 
          sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-top-navigation"
          loading="lazy"></iframe>
      </div>`;

    // Watch for successful submission — Greenhouse shows a confirmation page after submit
    // We detect this by polling iframe height changes or watching for the frame to reload
    const frame = $('#gh-apply-frame');
    let pollCount = 0;
    const submissionPoller = setInterval(() => {
      pollCount++;
      if (pollCount > 600) { clearInterval(submissionPoller); return; } // stop after 10 min
      try {
        // Cross-origin: can't read URL, but we can detect if content shrinks
        // (confirmation page is much shorter than the application form)
        // Also try to detect via frame load events
      } catch(e) {}
    }, 1000);

    // Listen for the iframe to load a new page (confirmation page after submission)
    let frameLoads = 0;
    frame.addEventListener('load', () => {
      frameLoads++;
      if (frameLoads > 1) {
        // Second load = form was submitted and confirmation page loaded
        clearInterval(submissionPoller);
        markAppliedFromModal(jobId);
      }
    });
  }
}

// On-demand job spec fetcher — tries Greenhouse JSON API first
// Salary parser — extract salary range from job description HTML
// Finds ALL salary ranges (handles multi-zone postings) and returns lowest min / highest max
// Detects rate type: annual, hourly, weekly, monthly
// Rejects: commission disclosures, franchise FDDs
function parseSalaryFromContent(html) {
  if (!html) return null;
  // Strip HTML tags for cleaner regex matching
  let text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ');
  // Decode common HTML entities that appear in salary ranges
  text = text.replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&amp;/g, '&').replace(/&#8212;/g, '—').replace(/&#8211;/g, '–');
  text = text.replace(/\s+/g, ' ');

  // Early exit: skip franchise disclosure documents entirely
  if (/franchise\s+disclosure|franchisee|reporting\s+publications?|item\s+19\b/i.test(text)) {
    if (/average\s+(?:commission|yearly|annual).*\$[\d,]+/i.test(text)) {
      return null;
    }
  }

  const allRanges = [];

  // Currency symbol pattern: matches $, CA$, C$, A$, AU$, NZ$, HK$, £, €
  const currSym = '(?:CA\\$|C\\$|A\\$|AU\\$|NZ\\$|HK\\$|US\\$|£|€|\\$)';

  // Rate detection patterns — check surrounding context
  const ratePatterns = [
    { pattern: /per\s+hour|\/\s*(?:hr|hour|h)\b|hourly/i, rate: 'hr' },
    { pattern: /per\s+week|\/\s*(?:wk|week)\b|weekly/i, rate: 'wk' },
    { pattern: /per\s+month|\/\s*(?:mo|month|mth)\b|monthly/i, rate: 'mo' },
    { pattern: /per\s+day|\/\s*(?:day|d)\b|per\s+diem|daily/i, rate: 'day' },
    { pattern: /per\s+session|\/\s*session/i, rate: 'session' },
    { pattern: /per\s+visit|\/\s*visit/i, rate: 'visit' },
  ];
  const commissionPattern = /commission|franchisee|earnings\s+claim|franchise\s+disclosure/i;

  // Helper: detect rate type from surrounding text
  function detectRate(matchIndex, matchLen) {
    const afterText = text.slice(matchIndex, matchIndex + matchLen + 80);
    const beforeText = text.slice(Math.max(0, matchIndex - 80), matchIndex + matchLen);
    for (const rp of ratePatterns) {
      if (rp.pattern.test(afterText) || rp.pattern.test(beforeText)) return rp.rate;
    }
    return 'yr'; // default annual
  }

  // Helper: check if context suggests commission/franchise disclosure
  function isCommission(matchIndex, matchLen) {
    const beforeText = text.slice(Math.max(0, matchIndex - 80), matchIndex + matchLen);
    return commissionPattern.test(beforeText);
  }

  // Also detect currency for metadata
  let detectedCurrency = 'USD'; // default
  if (/CA\$|C\$|\bCAD\b/i.test(text)) detectedCurrency = 'CAD';
  else if (/£|\bGBP\b/i.test(text)) detectedCurrency = 'GBP';
  else if (/€|\bEUR\b/i.test(text)) detectedCurrency = 'EUR';
  else if (/A\$|AU\$|\bAUD\b/i.test(text)) detectedCurrency = 'AUD';

  // Patterns to match salary/rate ranges
  const rangePatterns = [
    // "$120,000 - $150,000" or "$77 - $96" or "$77.00 to $96.00"
    new RegExp(currSym + '\\s*([\\d,]+(?:\\.\\d{2})?)\\s*(?:[-–—]|to)\\s*' + currSym + '?\\s*([\\d,]+(?:\\.\\d{2})?)\\s*(?:per\\s+(?:year|hour|hr|week|wk|month|mo|day|session|visit)|annually|annual|hourly|weekly|monthly|\\/\\s*(?:yr|year|hr|hour|h|wk|week|mo|month|mth|day|d)|USD|CAD|GBP|EUR)?', 'gi'),
    // "$120k - $150k"
    new RegExp(currSym + '\\s*(\\d+(?:\\.\\d+)?)\\s*[kK]\\s*(?:[-–—]|to)\\s*' + currSym + '?\\s*(\\d+(?:\\.\\d+)?)\\s*[kK]', 'gi'),
  ];

  for (const pattern of rangePatterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      if (isCommission(match.index, match[0].length)) continue;

      let min = parseFloat(match[1].replace(/,/g, ''));
      let max = parseFloat(match[2].replace(/,/g, ''));
      // Handle "k" notation
      if (min < 1000 && max < 1000 && match[0].toLowerCase().includes('k')) { min *= 1000; max *= 1000; }

      const rate = detectRate(match.index, match[0].length);

      // Sanity checks per rate type
      let valid = false;
      if (rate === 'yr') {
        // Annual: $20k-$2M, apply k-multiplier for small numbers without explicit k
        if (min < 1000) min *= 1000;
        if (max < 1000) max *= 1000;
        valid = min >= 20000 && min <= 2000000 && max >= min && max <= 2000000;
      } else if (rate === 'hr') {
        valid = min >= 10 && min <= 1000 && max >= min && max <= 1000;
      } else if (rate === 'day') {
        valid = min >= 50 && min <= 5000 && max >= min && max <= 5000;
      } else if (rate === 'wk') {
        valid = min >= 200 && min <= 20000 && max >= min && max <= 20000;
      } else if (rate === 'mo') {
        valid = min >= 1000 && min <= 100000 && max >= min && max <= 100000;
      } else if (rate === 'session' || rate === 'visit') {
        valid = min >= 10 && min <= 2000 && max >= min && max <= 2000;
      }

      if (valid) {
        allRanges.push({ min: Math.round(min), max: Math.round(max), raw: match[0].trim(), currency: detectedCurrency, rate });
      }
    }
  }

  // If we found ranges, return the envelope (lowest min, highest max) — group by rate type
  // Prefer annual ranges if mixed; otherwise use whatever we found
  if (allRanges.length > 0) {
    const annualRanges = allRanges.filter(r => r.rate === 'yr');
    const bestRanges = annualRanges.length > 0 ? annualRanges : allRanges;
    // Use only ranges of the same rate type
    const rateType = bestRanges[0].rate;
    const sameRate = bestRanges.filter(r => r.rate === rateType);

    const lowestMin = Math.min(...sameRate.map(r => r.min));
    const highestMax = Math.max(...sameRate.map(r => r.max));
    const currency = sameRate[0].currency;
    const prefMap = { CAD: 'CA$', GBP: '£', EUR: '€', AUD: 'AU$' };
    const sym = prefMap[currency] || '$';
    const raw = sameRate.length > 1
      ? `${sameRate.length} zones: ${sym}${(lowestMin/1000).toFixed(0)}k-${sym}${(highestMax/1000).toFixed(0)}k`
      : sameRate[0].raw;
    return { min: lowestMin, max: highestMax, raw, currency, rate: rateType };
  }

  // Single value patterns: "$150,000" or "$150k" or "CA$150,000"
  // Only match when preceded by salary/compensation/pay keywords
  const singlePatterns = [
    new RegExp('(?:base\\s+(?:salary|pay|compensation)[:\\s]*)' + currSym + '\\s*([\\d,]+(?:\\.\\d{2})?)\\s*(?:per\\s+(?:year|hour|hr|week|month)|annually|annual|hourly|\\/\\s*(?:yr|year|hr|hour))?', 'gi'),
    new RegExp('(?:salary|compensation|pay\\s+range|pay)[:\\s]*' + currSym + '\\s*([\\d,]+(?:\\.\\d{2})?)', 'gi'),
    new RegExp('(?:salary|compensation|pay\\s+range|pay)[:\\s]*' + currSym + '\\s*(\\d+(?:\\.\\d+)?)\\s*[kK]', 'gi'),
    // "Up to $232 per hour" — common pattern for single-value rates
    new RegExp('(?:up\\s+to|starting\\s+at|from)\\s+' + currSym + '\\s*([\\d,]+(?:\\.\\d{2})?)\\s*(?:per\\s+(?:hour|hr|week|wk|month|mo|day|session|visit)|hourly|\\/\\s*(?:hr|hour|h|wk|mo))', 'gi'),
  ];
  for (const pattern of singlePatterns) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (match) {
      if (isCommission(match.index, match[0].length)) continue;

      const rate = detectRate(match.index, match[0].length);
      let val = parseFloat(match[1].replace(/,/g, ''));

      let valid = false;
      if (rate === 'yr') {
        if (val < 1000) val *= 1000;
        valid = val >= 20000 && val <= 2000000;
      } else if (rate === 'hr') {
        valid = val >= 10 && val <= 1000;
      } else if (rate === 'day') {
        valid = val >= 50 && val <= 5000;
      } else if (rate === 'wk') {
        valid = val >= 200 && val <= 20000;
      } else if (rate === 'mo') {
        valid = val >= 1000 && val <= 100000;
      } else if (rate === 'session' || rate === 'visit') {
        valid = val >= 10 && val <= 2000;
      }

      if (valid) {
        return { min: Math.round(val), max: Math.round(val), raw: match[0].trim(), currency: detectedCurrency, rate };
      }
    }
  }

  return null;
}

async function fetchJobSpec(jobId, jobUrl, bodyEl) {
  try {
    // Try Greenhouse public JSON API — CORS-friendly, returns structured content
    // URL format: https://boards.greenhouse.io/{company}/jobs/{id}
    // API format: https://boards-api.greenhouse.io/v1/boards/{company}/jobs/{id}
    const urlMatch = jobUrl.match(/boards\.greenhouse\.io\/([^\/]+)\/jobs\/(\d+)/);
    if (urlMatch) {
      const [, boardToken, jobNumId] = urlMatch;
      const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs/${jobNumId}`;
      const resp = await fetch(apiUrl);
      if (resp.ok) {
        const data = await resp.json();
        if (data.content) {
          // Decode through helper that handles any encoding level
          const htmlContent = decodeJobContent(data.content);
          bodyEl.innerHTML = htmlContent;
          // Also show department/location from API if available
          const meta = [];
          if (data.departments?.length) meta.push(data.departments.map(d => d.name).join(', '));
          if (data.offices?.length) meta.push(data.offices.map(o => o.name).join(', '));
          if (meta.length) {
            bodyEl.innerHTML = `<div style="font-size:11px;color:var(--text-faint);margin-bottom:16px;padding-bottom:10px;border-bottom:1px solid var(--border);">${meta.join('  ·  ')}</div>` + bodyEl.innerHTML;
          }
          // Cache the decoded version locally and in Supabase
          const cachedJob = allJobs.find(j => j.greenhouse_id === jobId);
          if (cachedJob) cachedJob.content = htmlContent;
          // Extract salary from content
          const salary = parseSalaryFromContent(htmlContent);
          const updateData = { content: htmlContent };
          if (salary) {
            updateData.salary_min = salary.min;
            updateData.salary_max = salary.max;
            updateData.salary_raw = salary.raw;
            updateData.salary_currency = salary.currency || 'USD'; updateData.salary_rate = salary.rate || 'yr';
            if (cachedJob) { cachedJob.salary_min = salary.min; cachedJob.salary_max = salary.max; cachedJob.salary_currency = salary.currency || 'USD'; cachedJob.salary_rate = salary.rate || 'yr'; }
            console.log(`[BJ] Salary extracted: ${salary.currency || 'USD'} $${(salary.min/1000).toFixed(0)}k-$${(salary.max/1000).toFixed(0)}k from "${salary.raw}"`);
            // Update salary cell in feed
            const salaryCell = document.querySelector(`tr[data-jobid="${jobId}"] .jt-salary`);
            if (salaryCell && cachedJob) salaryCell.textContent = formatSalaryCell(cachedJob);
          }
          sb.from('ats_jobs').update(updateData).eq('greenhouse_id', jobId).then(() => {});
          return;
        }
      }
    }
  } catch (err) {
    console.log('[BJ] Greenhouse API fetch failed:', err.message);
  }

  // Fallback: try using company slug from ats_companies + greenhouse_id
  // Handles self-hosted career pages (e.g. block.xyz/careers) that use Greenhouse backend
  try {
    const job = allJobs.find(j => j.greenhouse_id === jobId);
    const slug = job?.company_name;
    if (slug && jobId) {
      console.log(`[BJ] Trying slug fallback: ${slug}/jobs/${jobId}`);
      const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs/${jobId}`;
      const resp = await fetch(apiUrl);
      if (resp.ok) {
        const data = await resp.json();
        if (data.content) {
          const htmlContent = decodeJobContent(data.content);
          bodyEl.innerHTML = htmlContent;
          const meta = [];
          if (data.departments?.length) meta.push(data.departments.map(d => d.name).join(', '));
          if (data.offices?.length) meta.push(data.offices.map(o => o.name).join(', '));
          if (meta.length) {
            bodyEl.innerHTML = `<div style="font-size:11px;color:var(--text-faint);margin-bottom:16px;padding-bottom:10px;border-bottom:1px solid var(--border);">${meta.join('  ·  ')}</div>` + bodyEl.innerHTML;
          }
          const cachedJob = allJobs.find(j => j.greenhouse_id === jobId);
          if (cachedJob) cachedJob.content = htmlContent;
          const salary = parseSalaryFromContent(htmlContent);
          const updateData = { content: htmlContent };
          if (salary) {
            updateData.salary_min = salary.min;
            updateData.salary_max = salary.max;
            updateData.salary_raw = salary.raw;
            updateData.salary_currency = salary.currency || 'USD'; updateData.salary_rate = salary.rate || 'yr';
            if (cachedJob) { cachedJob.salary_min = salary.min; cachedJob.salary_max = salary.max; cachedJob.salary_currency = salary.currency || 'USD'; cachedJob.salary_rate = salary.rate || 'yr'; }
            console.log(`[BJ] Salary extracted (slug fallback): ${salary.currency || 'USD'} $${(salary.min/1000).toFixed(0)}k-$${(salary.max/1000).toFixed(0)}k`);
            const salaryCell = document.querySelector(`tr[data-jobid="${jobId}"] .jt-salary`);
            if (salaryCell && cachedJob) salaryCell.textContent = formatSalaryCell(cachedJob);
          }
          sb.from('ats_jobs').update(updateData).eq('greenhouse_id', jobId).then(() => {});
          return;
        }
      }
    }
  } catch (err) {
    console.log('[BJ] Slug fallback failed:', err.message);
  }

  // Try Edge Function proxy as backup
  try {
    const proxyUrl = SUPABASE_URL + '/functions/v1/fetch-job-spec';
    const resp = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SUPABASE_KEY },
      body: JSON.stringify({ url: jobUrl, greenhouse_id: jobId })
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data.content) {
        bodyEl.innerHTML = data.content;
        const cachedJob = allJobs.find(j => j.greenhouse_id === jobId);
        if (cachedJob) cachedJob.content = data.content;
        return;
      }
    }
  } catch (err) {
    console.log('[BJ] Edge function fallback failed:', err.message);
  }

  // Final fallback
  bodyEl.innerHTML = `<div style="text-align:center;padding:40px;">
    <div style="color:var(--text-dim);margin-bottom:8px;font-size:14px;">Click below to view the full listing</div>
    <a href="${jobUrl}" target="_blank" rel="noopener" class="btn btn-primary" style="text-decoration:none;display:inline-block;margin-top:8px;">View on Company Site ↗</a>
  </div>`;
}

// Modal actions — sync back to feed
function modalApply(jobId, url) {
  window.open(url, '_blank');
  // Don't auto-mark as applied — the webRequest listener or manual confirmation will handle it
}

// Called when iframe detects a form submission (second load = confirmation page)
function markAppliedFromModal(jobId) {
  // Show resume picker first
  showResumePicker(jobId, function(resumeName) {
    // Update feed row
    const row = document.querySelector(`tr[data-jobid="${jobId}"]`);
    if (row) {
      const actionCell = row.querySelector('td:last-child');
      if (actionCell) actionCell.innerHTML = '<span class="job-action-btn applied-btn">Applied ✓</span>';
    }
    // Update state
    if (!appliedJobIds.includes(jobId)) {
      appliedJobIds.push(jobId);
      localStorage.setItem('bj_applied_jobs', JSON.stringify(appliedJobIds));
    }
    // Store applied date
    const dates = JSON.parse(localStorage.getItem('bj_applied_dates') || '{}');
    dates[jobId] = new Date().toISOString();
    localStorage.setItem('bj_applied_dates', JSON.stringify(dates));

    // Update pipeline meta
    const meta = getPipelineMeta();
    if (!meta[jobId]) meta[jobId] = { savedAt: new Date().toISOString(), filterTags: [] };
    meta[jobId].stage = 'applied';
    if (!meta[jobId].appliedAt) meta[jobId].appliedAt = new Date().toISOString();
    if (resumeName) meta[jobId].resumeUsed = resumeName;
    const sf = JSON.parse(localStorage.getItem('bj_saved_filters') || '[]');
    const checkedFilters = Array.from($$('.sf-check:checked')).map(cb => sf[parseInt(cb.dataset.idx)]?.name).filter(Boolean);
    meta[jobId].filterTags = checkedFilters;
    savePipelineMeta(meta);

    // Update modal UI
    const footerEl = $('#job-modal-footer');
    const bodyEl = $('#job-modal-body');
    
    bodyEl.innerHTML = `
      <div style="text-align:center;padding:60px 20px;">
        <div style="font-size:48px;margin-bottom:16px;">✓</div>
        <div style="font-size:16px;font-weight:600;color:var(--text);margin-bottom:8px;">Application Submitted</div>
        <div style="font-size:13px;color:var(--text-dim);">Tracked in your Pipeline under Applied</div>
        ${resumeName ? '<div style="font-size:12px;color:var(--purple);margin-top:8px;">Resume: ' + resumeName + '</div>' : ''}
      </div>`;
    
    footerEl.innerHTML = '<span class="job-action-btn applied-btn">Applied ✓</span><button class="job-modal-close-btn" onclick="closeJobModal()" style="margin-left:auto;">Close</button>';
    
    // Refresh pipeline in background
    renderPipelineSaved();
    updateJobStats($('#j-total').textContent, $('#j-companies').textContent, $('#j-new-login').textContent, $('#j-new').textContent);
  });
}

function modalSave(jobId, btn) {
  const idx = savedJobIds.indexOf(jobId);
  const meta = getPipelineMeta();
  if (idx >= 0) {
    savedJobIds.splice(idx, 1);
    btn.className = 'job-action-btn';
    btn.textContent = 'Add to Pipeline';
    delete meta[jobId];
  } else {
    savedJobIds.push(jobId);
    btn.className = 'job-action-btn saved-btn';
    btn.textContent = 'In Pipeline';
    if (!meta[jobId]) meta[jobId] = { stage: 'saved', savedAt: new Date().toISOString(), filterTags: [] };
  }
  savePipelineMeta(meta);
  localStorage.setItem('bj_saved_jobs', JSON.stringify(savedJobIds));
  // Sync feed row
  const row = document.querySelector(`tr[data-jobid="${jobId}"]`);
  if (row) {
    const saveBtn = row.querySelector('.job-action-btn:not(.hide-btn):not(.applied-btn)');
    if (saveBtn && !saveBtn.classList.contains('apply-btn-default')) {
      if (savedJobIds.includes(jobId)) {
        saveBtn.className = 'job-action-btn saved-btn';
        saveBtn.textContent = 'Pipeline ✓';
      } else {
        saveBtn.className = 'job-action-btn';
        saveBtn.textContent = 'Pipeline';
      }
    }
  }
  updateJobStats($('#j-total').textContent, $('#j-companies').textContent, $('#j-new-login').textContent, $('#j-new').textContent);
}

function modalHide(jobId) {
  // Get job info from current results
  const job = currentJobs.find(j => j.greenhouse_id === jobId) || {};
  showHideReasonPopup(jobId, job.title || '', job.company_name || '', null, () => {
    const row = document.querySelector(`tr[data-jobid="${jobId}"]`);
    if (row) row.style.display = 'none';
    closeJobModal();
  }, job.url || '', job.company_slug || '');
}

// Close on Escape key
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    // Close hide reason popup first if open
    const popup = document.querySelector('.hide-reason-popup');
    if (popup) { popup.remove(); return; }
    if ($('#job-modal-overlay')?.style?.display === 'flex') {
      closeJobModal();
    }
  }
});

// Close hide popup on outside click
document.addEventListener('click', e => {
  const popup = document.querySelector('.hide-reason-popup');
  if (popup && !popup.contains(e.target) && !e.target.classList.contains('hide-btn') && !e.target.classList.contains('hide-job-btn')) {
    popup.remove();
  }
});

function showHideReasonPopup(jobId, title, company, anchorEl, afterHide, jobUrl, companySlug) {
  // Remove any existing popup
  document.querySelectorAll('.hide-reason-popup').forEach(p => p.remove());

  const popup = document.createElement('div');
  popup.className = 'hide-reason-popup';
  popup.innerHTML = `<h4>Why hide this?</h4>` +
    HIDE_REASONS.map(r =>
      `<button class="hide-reason-btn" data-reason="${r.key}">${r.label}</button>`
    ).join('');

  // Position near the button or center of screen
  if (anchorEl) {
    const rect = anchorEl.getBoundingClientRect();
    popup.style.top = (rect.bottom + 4) + 'px';
    popup.style.left = Math.min(rect.left, window.innerWidth - 240) + 'px';
  } else {
    popup.style.top = '50%';
    popup.style.left = '50%';
    popup.style.transform = 'translate(-50%, -50%)';
  }

  popup.querySelectorAll('.hide-reason-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const reason = btn.dataset.reason;
      hiddenJobIds.push({
        id: jobId,
        reason,
        title: title || '',
        company: company || '',
        url: jobUrl || '',
        companySlug: companySlug || '',
        hiddenAt: new Date().toISOString()
      });
      localStorage.setItem('bj_hidden_jobs', JSON.stringify(hiddenJobIds));
      popup.remove();
      if (afterHide) afterHide();
    });
  });

  document.body.appendChild(popup);
}

function hideJob(jobId, btn) {
  const row = btn.closest('tr');
  const job = currentJobs.find(j => j.greenhouse_id === jobId) || {};
  showHideReasonPopup(jobId, job.title || '', job.company_name || '', btn, () => {
    if (row) row.style.display = 'none';
  }, job.url || '', job.company_slug || '');
}

function toggleSaveJob(jobId, btn) {
  const idx = savedJobIds.indexOf(jobId);
  const meta = getPipelineMeta();
  if (idx >= 0) {
    savedJobIds.splice(idx, 1);
    btn.textContent = 'Pipeline';
    btn.classList.remove('saved-btn');
    delete meta[jobId];
  } else {
    savedJobIds.push(jobId);
    btn.textContent = 'Pipeline ✓';
    btn.classList.add('saved-btn');
    if (!meta[jobId]) meta[jobId] = { stage: 'saved', savedAt: new Date().toISOString(), filterTags: [] };
  }
  savePipelineMeta(meta);
  localStorage.setItem('bj_saved_jobs', JSON.stringify(savedJobIds));
  $('#j-saved').textContent = savedJobIds.length.toLocaleString();
}

