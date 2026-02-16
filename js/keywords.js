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


// ============================================================
// RESUME READINESS ANALYSIS (P4 v2)
// ============================================================
// Scores how well a resume covers the keywords in matching JDs
// for each assigned filter. Runs at the resume level, not the feed.

var jobMatchScores = {}; // greenhouse_id → score (0-100)
var readinessCache = JSON.parse(localStorage.getItem('bj_readiness') || 'null');
var filterCorpusCache = {}; // filterName → { skills: [[term,count],...], bigrams: [...] }
var readinessRunning = false;

function scoreToGrade(score) {
  if (score >= 90) return { grade: 'A+', color: 'var(--green)' };
  if (score >= 80) return { grade: 'A', color: 'var(--green)' };
  if (score >= 70) return { grade: 'B+', color: '#22c55e' };
  if (score >= 60) return { grade: 'B', color: 'var(--warm)' };
  if (score >= 50) return { grade: 'C+', color: 'var(--warm)' };
  if (score >= 40) return { grade: 'C', color: '#f97316' };
  if (score >= 30) return { grade: 'D', color: 'var(--red)' };
  return { grade: 'F', color: 'var(--red)' };
}

// Fetch up to `limit` JDs for a given saved filter
async function fetchFilterJDs(sf, limit) {
  limit = limit || 80;
  let query = sb.from('ats_jobs').select('greenhouse_id, title, content, company_slug, url');
  query = buildFilterQuery(sf, query, null);
  query = query.not('content', 'is', null);
  query = query.limit(limit);
  query = query.order('updated_at', { ascending: false });

  const { data, error } = await query;
  if (error) { console.log('[BJ] fetchFilterJDs error:', error.message); return []; }
  return data || [];
}

// Batch-fetch JD content from Greenhouse API for jobs missing it
async function batchFetchJDContent(jobs, maxFetch) {
  maxFetch = maxFetch || 30;
  var fetched = 0;
  for (var i = 0; i < jobs.length; i++) {
    var job = jobs[i];
    if (job.content || fetched >= maxFetch) continue;
    try {
      var urlMatch = (job.url || '').match(/boards\.greenhouse\.io\/([^\/]+)\/jobs\/(\d+)/);
      if (!urlMatch && job.company_slug) urlMatch = [null, job.company_slug, job.greenhouse_id];
      if (!urlMatch) continue;
      var apiUrl = 'https://boards-api.greenhouse.io/v1/boards/' + urlMatch[1] + '/jobs/' + urlMatch[2];
      var resp = await fetch(apiUrl);
      if (resp.ok) {
        var data = await resp.json();
        if (data.content) {
          job.content = decodeJobContent(data.content);
          sb.from('ats_jobs').update({ content: job.content }).eq('greenhouse_id', job.greenhouse_id).then(function(){});
          fetched++;
        }
      }
      await new Promise(function(r){ setTimeout(r, 200); });
    } catch (e) { /* skip */ }
  }
  return fetched;
}

// Score a resume against a set of JDs
// Returns { score, matched, total, topMissing, topMatched, bigramMatched, bigramMissing, jdsAnalyzed }
function scoreResumeVsJDs(resume, jds) {
  if (!resume || !resume.keywords || !resume.keywords.length || !jds || !jds.length) return null;

  var jdsWithContent = jds.filter(function(j){ return j.content; });
  if (jdsWithContent.length < 3) return null;

  var ngrams = extractNgrams(jdsWithContent, 50);
  var topTerms = ngrams.skills.slice(0, 40);
  if (topTerms.length === 0) return null;

  var resumeTerms = new Set(resume.keywords.map(function(k){ return k[0].toLowerCase(); }));
  var resumeText = (resume.extractedText || '').toLowerCase();

  var matched = 0;
  var topMissing = [];
  var topMatched = [];

  for (var i = 0; i < topTerms.length; i++) {
    var term = topTerms[i][0];
    var count = topTerms[i][1];
    var found = resumeTerms.has(term) || resumeText.includes(term);
    if (found) { matched++; topMatched.push({ term: term, count: count }); }
    else { topMissing.push({ term: term, count: count }); }
  }

  // Bigram scoring
  var topBigrams = ngrams.bigrams.slice(0, 25);
  var bigramMatched = [];
  var bigramMissing = [];
  for (var b = 0; b < topBigrams.length; b++) {
    var bi = topBigrams[b][0];
    var bc = topBigrams[b][1];
    var biFound = resumeText.includes(bi);
    if (biFound) { bigramMatched.push({ term: bi, count: bc }); }
    else { bigramMissing.push({ term: bi, count: bc }); }
  }

  var total = topTerms.length;
  var score = total > 0 ? Math.round((matched / total) * 100) : 0;

  return {
    score: score, matched: matched, total: total,
    topMissing: topMissing, topMatched: topMatched,
    bigramMatched: bigramMatched, bigramMissing: bigramMissing,
    jdsAnalyzed: jdsWithContent.length
  };
}

// Score resume against JDs partitioned by level
function scoreResumeByLevel(resume, jds) {
  if (!resume || !resume.keywords || !resume.keywords.length || !jds || !jds.length) return {};
  var hierarchy = levelHierarchy && levelHierarchy.length ? levelHierarchy : [];
  if (hierarchy.length === 0) return {};

  var buckets = {};
  for (var i = 0; i < jds.length; i++) {
    if (!jds[i].content) continue;
    var lvl = getJobLevel(jds[i].title, hierarchy);
    var label = lvl ? lvl.label : 'Unclassified';
    if (!buckets[label]) buckets[label] = [];
    buckets[label].push(jds[i]);
  }

  var results = {};
  var labels = Object.keys(buckets);
  for (var k = 0; k < labels.length; k++) {
    var label = labels[k];
    if (buckets[label].length < 3) continue;
    var s = scoreResumeVsJDs(resume, buckets[label]);
    if (s) { s.jobCount = buckets[label].length; results[label] = s; }
  }
  return results;
}

// Score a single job against the best resume for its filter
function computeJobMatchScore(job) {
  if (!job.content) return null;

  var filterNums = job._filterNums || [];
  if (filterNums.length === 0) return null;

  // Find the resume assigned to the first matching filter
  var resume = null;
  var matchedFilterName = null;
  for (var i = 0; i < savedFilters.length; i++) {
    if (filterNums.some(function(fn){ return fn.num == (i + 1); })) {
      // Find a resume that has this filter in its filterIds
      var filterName = savedFilters[i].name;
      for (var ri = 0; ri < resumes.length; ri++) {
        if (!resumes[ri].archived && (resumes[ri].filterIds || []).includes(filterName) && resumes[ri].keywords && resumes[ri].keywords.length > 0) {
          resume = resumes[ri];
          matchedFilterName = filterName;
          break;
        }
      }
      if (resume) break;
    }
  }
  if (!resume || !resume.keywords || !resume.keywords.length) return null;

  var text = stripHtmlToText(job.content);
  var words = tokenize(text);

  // Count term frequency within this job (not arbitrary Set order)
  var termCounts = {};
  for (var w = 0; w < words.length; w++) {
    var word = words[w];
    if (!KW_STOPWORDS.has(word) && !KW_GENERIC.has(word) && word.length > 2) {
      termCounts[word] = (termCounts[word] || 0) + 1;
    }
  }

  // Rank by frequency — top repeated terms are the real requirements
  var jdTerms = Object.entries(termCounts)
    .sort(function(a, b) { return b[1] - a[1]; })
    .slice(0, 40)
    .map(function(e) { return e[0]; });

  if (jdTerms.length === 0) return null;

  var resumeTerms = new Set(resume.keywords.map(function(k){ return k[0].toLowerCase(); }));
  var resumeText = (resume.extractedText || '').toLowerCase();

  var matched = 0;
  for (var t = 0; t < jdTerms.length; t++) {
    if (resumeTerms.has(jdTerms[t]) || resumeText.includes(jdTerms[t])) matched++;
  }
  var score = jdTerms.length > 0 ? Math.round((matched / jdTerms.length) * 100) : null;
  return score !== null ? { score: score, resumeName: resume.name } : null;
}

// Batch-compute match scores for visible jobs
function computeVisibleJobScores() {
  for (var i = 0; i < currentJobs.length; i++) {
    var job = currentJobs[i];
    if (!job.content || jobMatchScores[job.greenhouse_id] !== undefined) continue;
    var result = computeJobMatchScore(job);
    if (result !== null) {
      jobMatchScores[job.greenhouse_id] = result;
      var cell = document.querySelector('tr[data-jobid="' + job.greenhouse_id + '"] .jt-match');
      if (cell) cell.innerHTML = matchBadge(result);
    }
  }
}

function matchBadge(result) {
  if (!result) return '<span style="color:var(--text-faint);font-size:10px;">\u2014</span>';
  var score = typeof result === 'number' ? result : result.score;
  var rName = typeof result === 'object' ? (result.resumeName || '') : '';
  var g = scoreToGrade(score);
  var tooltip = score + '% match' + (rName ? ' · ' + rName.replace(/"/g, '&quot;') : '');
  return '<span title="' + tooltip + '" style="font-family:var(--mono);font-size:11px;font-weight:600;color:' + g.color + ';cursor:help;">' + g.grade + '</span>';
}

// Main readiness analysis — runs automatically on Resumes page load, or manually via button
async function runReadinessAnalysis(opts) {
  opts = opts || {};
  var silent = opts.silent || false; // true = background run, no button state changes
  var btn = document.getElementById('readiness-run-btn');
  var statusEl = document.getElementById('readiness-status');
  var resultsEl = document.getElementById('readiness-results');

  if (readinessRunning) return;
  readinessRunning = true;

  if (!silent && btn) { btn.disabled = true; btn.textContent = 'Analyzing\u2026'; }

  var sf = JSON.parse(localStorage.getItem('bj_saved_filters') || '[]');

  var hasEligible = false;
  for (var i = 0; i < resumes.length; i++) {
    if (!resumes[i].archived && resumes[i].textStatus === 'ready' && resumes[i].keywords && resumes[i].keywords.length > 0) {
      hasEligible = true; break;
    }
  }

  if (!hasEligible) {
    if (resultsEl) resultsEl.innerHTML = '<div style="font-size:13px;color:var(--text-faint);padding:16px 0;">Upload a resume and wait for keyword extraction to complete before analyzing readiness.</div>';
    if (!silent && btn) { btn.disabled = false; btn.textContent = 'Analyze'; }
    readinessRunning = false;
    return;
  }

  // Show loading state on resume cards
  document.querySelectorAll('.rc-grade-slot').forEach(function(el) {
    el.innerHTML = '<div style="font-size:10px;color:var(--text-faint);font-style:italic;">Analyzing\u2026</div>';
  });

  var scores = {};
  var totalFiltersAnalyzed = 0;
  var totalJDsFetched = 0;

  for (var ri = 0; ri < resumes.length; ri++) {
    var r = resumes[ri];
    if (r.archived || r.textStatus !== 'ready' || !r.keywords || !r.keywords.length) continue;

    var assignedFilterNames = r.filterIds || [];
    if (assignedFilterNames.length === 0) continue;
    var assignedFilters = sf.filter(function(f){ return assignedFilterNames.includes(f.name); });

    scores[ri] = { filters: {}, levels: {}, overallScore: 0, resumeName: r.name };

    var allJDsForLevel = [];
    var seenIds = new Set();

    for (var fi = 0; fi < assignedFilters.length; fi++) {
      var filter = assignedFilters[fi];
      if (statusEl) statusEl.textContent = 'Fetching JDs for "' + filter.name + '"\u2026';

      var jds = await fetchFilterJDs(filter, 80);

      var withContent = jds.filter(function(j){ return j.content; }).length;
      if (withContent < 30 && jds.length > withContent) {
        if (statusEl) statusEl.textContent = 'Fetching specs for "' + filter.name + '" (' + withContent + '/' + jds.length + ')\u2026';
        var fetched = await batchFetchJDContent(jds, Math.min(30, 50 - withContent));
        totalJDsFetched += fetched;
      }

      var filterScore = scoreResumeVsJDs(r, jds);
      if (filterScore) {
        scores[ri].filters[filter.name] = filterScore;
        totalFiltersAnalyzed++;

        // Cache the corpus ngrams for this filter (used by feed scoring)
        var jdsWithContent = jds.filter(function(j){ return j.content; });
        if (jdsWithContent.length >= 3) {
          var corpus = extractNgrams(jdsWithContent, 50);
          filterCorpusCache[filter.name] = {
            skills: corpus.skills,
            bigrams: corpus.bigrams,
            jobCount: jdsWithContent.length
          };
        }
      }

      for (var ji = 0; ji < jds.length; ji++) {
        if (!seenIds.has(jds[ji].greenhouse_id)) {
          seenIds.add(jds[ji].greenhouse_id);
          allJDsForLevel.push(jds[ji]);
        }
      }
    }

    scores[ri].levels = scoreResumeByLevel(r, allJDsForLevel);

    var filterScoreValues = Object.keys(scores[ri].filters).map(function(k){ return scores[ri].filters[k].score; });
    scores[ri].overallScore = filterScoreValues.length > 0
      ? Math.round(filterScoreValues.reduce(function(a, b){ return a + b; }, 0) / filterScoreValues.length)
      : 0;
  }

  readinessCache = { lastRun: new Date().toISOString(), scores: scores };
  localStorage.setItem('bj_readiness', JSON.stringify(readinessCache));

  // Update resume cards with grades
  updateResumeCardGrades(scores);

  // Update readiness panel (detailed breakdown)
  renderReadinessResults(scores);

  // Clear feed match cache so scores recompute with new corpus
  jobMatchScores = {};

  if (statusEl) statusEl.textContent = 'Analyzed ' + totalFiltersAnalyzed + ' filter' + (totalFiltersAnalyzed !== 1 ? 's' : '') + ', fetched ' + totalJDsFetched + ' new JDs';
  if (btn) { btn.disabled = false; btn.textContent = 'Re-analyze'; }
  readinessRunning = false;
}

// Update grade display on each resume card in-place
function updateResumeCardGrades(scores) {
  if (!scores) return;
  var indices = Object.keys(scores);
  for (var si = 0; si < indices.length; si++) {
    var ri = indices[si];
    var data = scores[ri];
    var slot = document.getElementById('rc-grade-' + ri);
    if (!slot) continue;
    slot.innerHTML = buildInlineGrade(ri, data);
  }
}

// Build the inline grade + insights HTML for a resume card
function buildInlineGrade(ri, data) {
  if (!data) return '';
  var g = scoreToGrade(data.overallScore);
  var filterNames = Object.keys(data.filters);
  var detailId = 'rc-insights-' + ri;

  var html = '<div style="padding:8px 10px;border-radius:8px;background:var(--bg-main);border:1px solid var(--border);margin-bottom:6px;">';

  // Top row: letter grade + score + CTA
  html += '<div style="display:flex;align-items:center;gap:8px;">';
  html += '<span style="font-family:var(--mono);font-size:22px;font-weight:800;color:' + g.color + ';line-height:1;">' + g.grade + '</span>';
  html += '<span style="font-family:var(--mono);font-size:12px;color:var(--text-dim);">' + data.overallScore + '%</span>';

  // Per-filter mini scores
  if (filterNames.length > 0) {
    html += '<div style="display:flex;gap:4px;margin-left:4px;">';
    for (var fi = 0; fi < filterNames.length; fi++) {
      var fname = filterNames[fi];
      var fs = data.filters[fname];
      var fg = scoreToGrade(fs.score);
      html += '<span title="' + fname + ': ' + fs.score + '% (' + fs.matched + '/' + fs.total + ' terms)" style="font-size:9px;padding:1px 5px;border-radius:4px;background:' + fg.color + '15;color:' + fg.color + ';font-weight:600;font-family:var(--mono);cursor:help;">' + fg.grade + '</span>';
    }
    html += '</div>';
  }

  html += '<span onclick="toggleInlineInsights(\'' + detailId + '\',this)" style="font-size:10px;color:var(--accent);cursor:pointer;margin-left:auto;font-weight:500;white-space:nowrap;">View insights \u25b8</span>';
  html += '</div>';

  // Expandable insights section
  html += '<div id="' + detailId + '" style="display:none;margin-top:8px;padding-top:8px;border-top:1px solid var(--border);">';

  // Per-filter breakdown
  for (var fi2 = 0; fi2 < filterNames.length; fi2++) {
    var fname2 = filterNames[fi2];
    var fs2 = data.filters[fname2];
    var fg2 = scoreToGrade(fs2.score);

    html += '<div style="margin-bottom:10px;">';
    html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">';
    html += '<span style="font-family:var(--mono);font-size:11px;font-weight:700;color:' + fg2.color + ';">' + fg2.grade + ' ' + fs2.score + '%</span>';
    html += '<span style="font-size:11px;font-weight:600;color:var(--text);">' + fname2 + '</span>';
    html += '<span style="font-size:9px;color:var(--text-faint);">' + fs2.matched + '/' + fs2.total + ' terms \u00b7 ' + fs2.jdsAnalyzed + ' JDs</span>';
    html += '</div>';

    // Missing terms — the actionable insight
    if (fs2.topMissing && fs2.topMissing.length > 0) {
      html += '<div style="font-size:9px;font-weight:600;color:var(--text-faint);margin-bottom:3px;">Missing from your resume:</div>';
      html += '<div style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:4px;">';
      for (var mi = 0; mi < fs2.topMissing.length; mi++) {
        var mt = typeof fs2.topMissing[mi] === 'object' ? fs2.topMissing[mi].term : fs2.topMissing[mi];
        var mc = typeof fs2.topMissing[mi] === 'object' ? fs2.topMissing[mi].count : '';
        html += '<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.15);color:var(--red);">\u2717 ' + mt;
        if (mc) html += ' <span style="font-family:var(--mono);font-size:8px;opacity:0.7;">' + mc + '</span>';
        html += '</span>';
      }
      html += '</div>';
    }

    // Matched terms
    if (fs2.topMatched && fs2.topMatched.length > 0) {
      html += '<div style="font-size:9px;font-weight:600;color:var(--text-faint);margin-bottom:3px;">Covered:</div>';
      html += '<div style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:4px;">';
      for (var gi = 0; gi < fs2.topMatched.length; gi++) {
        var gt = typeof fs2.topMatched[gi] === 'object' ? fs2.topMatched[gi].term : fs2.topMatched[gi];
        html += '<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.2);color:var(--green);">\u2713 ' + gt + '</span>';
      }
      html += '</div>';
    }

    // Missing bigrams
    if (fs2.bigramMissing && fs2.bigramMissing.length > 0) {
      html += '<div style="font-size:9px;font-weight:600;color:var(--text-faint);margin-bottom:3px;">Missing phrases:</div>';
      html += '<div style="display:flex;flex-wrap:wrap;gap:3px;">';
      for (var bmi = 0; bmi < Math.min(10, fs2.bigramMissing.length); bmi++) {
        var bmt = typeof fs2.bigramMissing[bmi] === 'object' ? fs2.bigramMissing[bmi].term : fs2.bigramMissing[bmi];
        html += '<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.15);color:var(--red);">\u2717 ' + bmt + '</span>';
      }
      html += '</div>';
    }

    html += '</div>';
  }

  // Level fit
  var levelLabels = Object.keys(data.levels || {});
  if (levelLabels.length > 0) {
    html += '<div style="padding-top:6px;border-top:1px solid var(--border);">';
    html += '<div style="font-size:9px;font-weight:600;color:var(--text-faint);margin-bottom:4px;">Level Fit</div>';
    html += '<div style="display:flex;flex-wrap:wrap;gap:6px;">';
    for (var li = 0; li < levelLabels.length; li++) {
      var lbl = levelLabels[li];
      var ls = data.levels[lbl];
      var lg = scoreToGrade(ls.score);
      html += '<div style="padding:4px 8px;border-radius:6px;background:var(--bg-card);border:1px solid var(--border);text-align:center;">';
      html += '<div style="font-family:var(--mono);font-size:11px;font-weight:700;color:' + lg.color + ';">' + lg.grade + ' ' + ls.score + '%</div>';
      html += '<div style="font-size:9px;color:var(--text-dim);">' + lbl + ' <span style="color:var(--text-faint);">(' + ls.jobCount + ')</span></div>';
      html += '</div>';
    }
    html += '</div></div>';
  }

  html += '</div>'; // close insights
  html += '</div>'; // close outer container

  return html;
}

function toggleInlineInsights(detailId, el) {
  var detail = document.getElementById(detailId);
  if (!detail) return;
  if (detail.style.display === 'none') {
    detail.style.display = '';
    el.textContent = 'Hide insights \u25be';
  } else {
    detail.style.display = 'none';
    el.textContent = 'View insights \u25b8';
  }
}

function renderReadinessResults(scores) {
  var el = document.getElementById('readiness-results');
  if (!el) return;
  if (!scores || Object.keys(scores).length === 0) {
    el.innerHTML = '<div style="font-size:13px;color:var(--text-faint);padding:12px 0;">No resumes with assigned filters found. Assign resumes to filters in the cards below, then analyze.</div>';
    return;
  }

  var html = '';
  var indices = Object.keys(scores);
  for (var si = 0; si < indices.length; si++) {
    var ri = indices[si];
    var data = scores[ri];
    var overallColor = data.overallScore >= 70 ? 'var(--green)' : data.overallScore >= 40 ? 'var(--warm)' : 'var(--red)';
    var overallLabel = data.overallScore >= 70 ? 'Ready' : data.overallScore >= 40 ? 'Gaps' : 'Weak';

    html += '<div style="border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:12px;background:var(--bg-input);">';
    html += '<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">';
    html += '<div style="font-family:var(--mono);font-size:28px;font-weight:700;color:' + overallColor + ';">' + data.overallScore + '%</div>';
    html += '<div><div style="font-size:13px;font-weight:600;color:var(--text);">' + data.resumeName + '</div>';
    html += '<div style="font-size:11px;color:' + overallColor + ';font-weight:500;">' + overallLabel + '</div></div></div>';

    // Per-filter breakdown
    var filterNames = Object.keys(data.filters);
    for (var fi = 0; fi < filterNames.length; fi++) {
      var fname = filterNames[fi];
      var fs = data.filters[fname];
      var fc = fs.score >= 70 ? 'var(--green)' : fs.score >= 40 ? 'var(--warm)' : 'var(--red)';
      var detailId = 'rd-detail-' + ri + '-' + fi;
      html += '<div style="margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--border);">';

      // Score header row
      html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">';
      html += '<span style="font-family:var(--mono);font-size:13px;font-weight:600;color:' + fc + ';">' + fs.score + '%</span>';
      html += '<span style="font-size:12px;font-weight:600;color:var(--text);">' + fname + '</span>';
      html += '<span style="font-size:10px;color:var(--text-faint);">' + fs.matched + '/' + fs.total + ' terms \u00b7 ' + fs.jdsAnalyzed + ' JDs</span>';
      html += '<span onclick="document.getElementById(\'' + detailId + '\').style.display=document.getElementById(\'' + detailId + '\').style.display===\'none\'?\'\':\'none\';this.textContent=document.getElementById(\'' + detailId + '\').style.display===\'none\'?\'Show keywords \u25b8\':\'Hide keywords \u25be\'" style="font-size:10px;color:var(--accent);cursor:pointer;margin-left:auto;font-weight:500;">Show keywords \u25b8</span>';
      html += '</div>';

      // Inline missing preview (top 5 missing, always visible)
      if (fs.topMissing.length > 0) {
        html += '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:4px;">';
        var previewCount = Math.min(5, fs.topMissing.length);
        for (var mi = 0; mi < previewCount; mi++) {
          var mt = typeof fs.topMissing[mi] === 'object' ? fs.topMissing[mi].term : fs.topMissing[mi];
          html += '<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.15);color:var(--red);">\u2717 ' + mt + '</span>';
        }
        if (fs.topMissing.length > 5) {
          html += '<span style="font-size:10px;color:var(--text-faint);">+' + (fs.topMissing.length - 5) + ' more</span>';
        }
        html += '</div>';
      }

      // Expandable keyword detail
      html += '<div id="' + detailId + '" style="display:none;margin-top:10px;">';

      // Legend
      html += '<div style="font-size:9px;color:var(--text-faint);margin-bottom:8px;">';
      html += '<span style="color:var(--green);">\u2713 green</span> = in your resume \u00a0 ';
      html += '<span style="color:var(--red);">\u2717 red</span> = missing \u2014 add these to improve your match';
      html += '</div>';

      // Skills (unigrams)
      html += '<div style="font-size:10px;font-weight:600;color:var(--text-dim);margin-bottom:4px;">Skills &amp; Tools</div>';
      html += '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px;">';
      // Matched first
      for (var gi = 0; gi < fs.topMatched.length; gi++) {
        var gterm = typeof fs.topMatched[gi] === 'object' ? fs.topMatched[gi].term : fs.topMatched[gi];
        var gcount = typeof fs.topMatched[gi] === 'object' ? fs.topMatched[gi].count : '';
        html += '<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.2);color:var(--green);">';
        html += '\u2713 ' + gterm;
        if (gcount) html += ' <span style="font-family:var(--mono);font-size:9px;opacity:0.7;">' + gcount + '</span>';
        html += '</span>';
      }
      // Then missing
      for (var ri2 = 0; ri2 < fs.topMissing.length; ri2++) {
        var rterm = typeof fs.topMissing[ri2] === 'object' ? fs.topMissing[ri2].term : fs.topMissing[ri2];
        var rcount = typeof fs.topMissing[ri2] === 'object' ? fs.topMissing[ri2].count : '';
        html += '<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.15);color:var(--red);">';
        html += '\u2717 ' + rterm;
        if (rcount) html += ' <span style="font-family:var(--mono);font-size:9px;opacity:0.7;">' + rcount + '</span>';
        html += '</span>';
      }
      html += '</div>';

      // Bigrams (2-word phrases)
      var hasBigrams = (fs.bigramMatched && fs.bigramMatched.length > 0) || (fs.bigramMissing && fs.bigramMissing.length > 0);
      if (hasBigrams) {
        html += '<div style="font-size:10px;font-weight:600;color:var(--text-dim);margin-bottom:4px;">2-Word Phrases</div>';
        html += '<div style="display:flex;flex-wrap:wrap;gap:4px;">';
        var bm = fs.bigramMatched || [];
        for (var bi = 0; bi < bm.length; bi++) {
          var bt = typeof bm[bi] === 'object' ? bm[bi].term : bm[bi];
          var bcc = typeof bm[bi] === 'object' ? bm[bi].count : '';
          html += '<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.2);color:var(--green);">';
          html += '\u2713 ' + bt;
          if (bcc) html += ' <span style="font-family:var(--mono);font-size:9px;opacity:0.7;">' + bcc + '</span>';
          html += '</span>';
        }
        var bmiss = fs.bigramMissing || [];
        for (var bmi = 0; bmi < bmiss.length; bmi++) {
          var bmt = typeof bmiss[bmi] === 'object' ? bmiss[bmi].term : bmiss[bmi];
          var bmcc = typeof bmiss[bmi] === 'object' ? bmiss[bmi].count : '';
          html += '<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.15);color:var(--red);">';
          html += '\u2717 ' + bmt;
          if (bmcc) html += ' <span style="font-family:var(--mono);font-size:9px;opacity:0.7;">' + bmcc + '</span>';
          html += '</span>';
        }
        html += '</div>';
      }

      html += '</div>'; // close detail
      html += '</div>'; // close filter block
    }

    // Level analysis
    var levelLabels = Object.keys(data.levels);
    if (levelLabels.length > 0) {
      html += '<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);">';
      html += '<div style="font-size:11px;font-weight:600;color:var(--text-dim);margin-bottom:8px;">Level Fit</div>';
      html += '<div style="display:flex;flex-wrap:wrap;gap:8px;">';
      for (var li = 0; li < levelLabels.length; li++) {
        var lbl = levelLabels[li];
        var ls = data.levels[lbl];
        var lc = ls.score >= 70 ? 'var(--green)' : ls.score >= 40 ? 'var(--warm)' : 'var(--red)';
        html += '<div style="padding:6px 10px;border-radius:8px;background:var(--bg-card);border:1px solid var(--border);text-align:center;min-width:80px;">';
        html += '<div style="font-family:var(--mono);font-size:14px;font-weight:700;color:' + lc + ';">' + ls.score + '%</div>';
        html += '<div style="font-size:10px;color:var(--text-dim);">' + lbl + '</div>';
        html += '<div style="font-size:9px;color:var(--text-faint);">' + ls.jobCount + ' jobs</div>';
        html += '</div>';
      }
      html += '</div></div>';
    }

    html += '</div>';
  }

  el.innerHTML = html;
}

// Show readiness panel on Resumes page when there are cached results
function initReadinessPanel() {
  var panel = document.getElementById('readiness-panel');
  if (!panel) return;
  var sf = JSON.parse(localStorage.getItem('bj_saved_filters') || '[]');
  var hasAssigned = resumes.some(function(r, i){
    return !r.archived && r.keywords && r.keywords.length > 0 && (r.filterIds || []).length > 0;
  });
  if (hasAssigned) {
    panel.style.display = '';
    if (readinessCache && readinessCache.scores) {
      // Show cached results immediately
      updateResumeCardGrades(readinessCache.scores);
      renderReadinessResults(readinessCache.scores);
      var statusEl = document.getElementById('readiness-status');
      if (statusEl && readinessCache.lastRun) {
        var ago = Math.round((Date.now() - new Date(readinessCache.lastRun).getTime()) / 60000);
        statusEl.textContent = ago < 60 ? ago + 'm ago' : ago < 1440 ? Math.round(ago / 60) + 'h ago' : Math.round(ago / 1440) + 'd ago';
      }
      var btn = document.getElementById('readiness-run-btn');
      if (btn) btn.textContent = 'Re-analyze';

      // Auto-refresh if cache is older than 24 hours
      var cacheAge = readinessCache.lastRun ? Date.now() - new Date(readinessCache.lastRun).getTime() : Infinity;
      if (cacheAge > 24 * 60 * 60 * 1000) {
        setTimeout(function(){ runReadinessAnalysis({ silent: true }); }, 500);
      }
    } else {
      // No cache — auto-run in background
      setTimeout(function(){ runReadinessAnalysis({ silent: false }); }, 500);
    }
  } else {
    panel.style.display = 'none';
  }
}

// Stubs for removed functions
function toggleKeywordPanel() {}
function refreshKeywordsIfOpen() {
  // After job rows render, compute match scores for visible jobs
  computeVisibleJobScores();
}

// Scroll to readiness panel and expand the detail for a given resume
function scrollToReadinessDetail(resumeIdx) {
  var panel = document.getElementById('readiness-panel');
  if (!panel) return;
  panel.style.display = '';
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Expand all detail sections for this resume
  if (readinessCache && readinessCache.scores && readinessCache.scores[resumeIdx]) {
    var filterCount = Object.keys(readinessCache.scores[resumeIdx].filters).length;
    for (var fi = 0; fi < filterCount; fi++) {
      var detailEl = document.getElementById('rd-detail-' + resumeIdx + '-' + fi);
      if (detailEl) detailEl.style.display = '';
    }
  }
}

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

