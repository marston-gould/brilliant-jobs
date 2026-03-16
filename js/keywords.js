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
  'looking','join','exciting',
  // EEO / legal boilerplate — appears in nearly every JD, not a real skill
  'race','color','religion','national','origin','sex','sexual','orientation','gender','identity',
  'age','disability','veteran','status','marital','citizenship','creed','ancestry','genetic',
  'pregnancy','ethnicity','expression','protected','discrimination','harassment','accommodation',
  'equal','opportunity','employer','affirmative','action','comply','compliance','prohibit',
  'diverse','diversity','inclusive','inclusion','equitable','equity','belonging',
  'applicant','applicants','qualified','regardless','offer','offers','offered',
  'mission','vision','values','culture','committed','commitment','believe','believes',
  'proud','invite','encouraged','welcome','welcomes','apply','consideration',
  // Generic job posting filler
  'company','team','work','working','role','position','job','hire','hiring','candidate','candidates',
  'experience','years','year','strong','great','good','best','new','well','high','key','part',
  'multiple','various','include','including','includes','required','requirements','qualifications',
  'also','may','must','shall','please','note','currently','within','across','ensure','support',
  'provide','help','take','make','use','using','used','need','needs','like','want','day'
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
    if (!raw || isContentUnavailable(raw)) continue;
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

  // EEO and legal boilerplate bigrams/trigrams to exclude
  const EEO_PHRASES = new Set([
    'national origin','sexual orientation','gender identity','gender expression',
    'marital status','veteran status','disability status','citizenship status',
    'genetic information','equal opportunity','affirmative action','protected class',
    'protected veteran','race color','color religion','religion national',
    'age disability','pregnancy discrimination','reasonable accommodation',
    'equal employment','employment opportunity','regardless race','regardless gender',
    'diverse candidates','inclusive workplace','diversity equity','equity inclusion',
  ]);

  // Minimum threshold: must appear in at least 2 JDs (or 10% of jobs, whichever is higher)
  const minCount = Math.max(2, Math.ceil(jobsWithContent * 0.10));

  const sortAndFilter = (counts) => Object.entries(counts)
    .filter(([term, count]) => count >= minCount && !KW_GENERIC.has(term) && !EEO_PHRASES.has(term))
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
// readinessCache declared in globals.ts (shell chunk) — just refresh from LS in case it changed
readinessCache = safeReadLS('bj_readiness', null);
var filterCorpusCache = {}; // filterName → { skills: [[term,count],...], bigrams: [...] }
var readinessRunning = false;

function scoreToGrade(score) {
  // Returns numeric score string with color — no letter grades
  var s = score != null ? Math.round(score) : 0;
  var color = s >= 80 ? 'var(--green)' : s >= 60 ? '#22c55e' : s >= 40 ? 'var(--warm)' : 'var(--red)';
  return { grade: s + '%', color: color };
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
    // Only fetch from Greenhouse API — other ATS platforms don't support this endpoint
    if (job.ats_source && job.ats_source !== 'greenhouse') continue;
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
          enrichJob(job.greenhouse_id, { content: job.content });
          fetched++;
        }
      } else if (resp.status === 404 || resp.status === 410) {
        // Listing removed from ATS — mark so we never retry
        job.content = '<!-- unavailable -->';
        enrichJob(job.greenhouse_id, { content: job.content });
      }
      await new Promise(function(r){ setTimeout(r, 200); });
    } catch(e) { reportError('keywords:skip', e); }
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
  if (!job.content || isContentUnavailable(job.content)) return null;

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
  // Session 5: If no resume found via saved filter, check prompt-derived filter assignments
  if (!resume && typeof _savedPrompts !== 'undefined' && _savedPrompts) {
    for (var pi = 0; pi < _savedPrompts.length; pi++) {
      var prompt = _savedPrompts[pi];
      if (!prompt.derived_filters || !prompt.resume_id) continue;
      // Check if prompt's derived_filters match this job's filter context
      var promptFilterName = prompt.name;
      for (var pri = 0; pri < resumes.length; pri++) {
        if (!resumes[pri].archived && resumes[pri].id === prompt.resume_id && resumes[pri].keywords && resumes[pri].keywords.length > 0) {
          resume = resumes[pri];
          matchedFilterName = promptFilterName;
          break;
        }
      }
      if (resume) break;
      // Also check by filter name in resume's filterIds
      for (var pri2 = 0; pri2 < resumes.length; pri2++) {
        if (!resumes[pri2].archived && (resumes[pri2].filterIds || []).includes(promptFilterName) && resumes[pri2].keywords && resumes[pri2].keywords.length > 0) {
          resume = resumes[pri2];
          matchedFilterName = promptFilterName;
          break;
        }
      }
      if (resume) break;
    }
  }

  if (!resume || !resume.keywords || !resume.keywords.length) return null;

  var resumeTerms = new Set(resume.keywords.map(function(k){ return k[0].toLowerCase(); }));
  var resumeText = (resume.extractedText || '').toLowerCase();

  var jdTerms = [];
  var termSource = 'content';

  // Prefer AI-extracted jd_skills — cleaner signal than raw word frequency
  if (job.jd_skills && job.jd_skills.length >= 5) {
    jdTerms = job.jd_skills.map(function(s){ return s.toLowerCase().trim(); }).filter(Boolean);
    // Also add jd_requirements if available
    if (job.jd_requirements && job.jd_requirements.length > 0) {
      var reqTerms = job.jd_requirements.map(function(r){ return r.toLowerCase().trim(); });
      // Add unique ones
      reqTerms.forEach(function(r){ if (jdTerms.indexOf(r) < 0) jdTerms.push(r); });
    }
    termSource = 'ai_skills';
  } else {
    // Fallback: raw word frequency from JD content
    var text = stripHtmlToText(job.content);
    var words = tokenize(text);
    var termCounts = {};
    for (var w = 0; w < words.length; w++) {
      var word = words[w];
      if (!KW_STOPWORDS.has(word) && !KW_GENERIC.has(word) && word.length > 2) {
        termCounts[word] = (termCounts[word] || 0) + 1;
      }
    }
    jdTerms = Object.entries(termCounts)
      .sort(function(a, b) { return b[1] - a[1]; })
      .slice(0, 40)
      .map(function(e) { return e[0]; });
  }

  if (jdTerms.length === 0) return null;

  var matched = 0;
  var topMatched = [];
  var topMissing = [];

  for (var t = 0; t < jdTerms.length; t++) {
    var term = jdTerms[t];
    // Match if term appears in resume keywords or anywhere in extracted text
    var found = resumeTerms.has(term) || resumeText.includes(term);
    if (found) {
      matched++;
      topMatched.push(term);
    } else {
      topMissing.push(term);
    }
  }

  var score = jdTerms.length > 0 ? Math.round((matched / jdTerms.length) * 100) : null;
  return score !== null ? {
    score: score,
    resumeName: resume.name,
    topMatched: topMatched,
    topMissing: topMissing,
    termSource: termSource,
    total: jdTerms.length
  } : null;
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
      if (cell) cell.innerHTML = matchBadge(result, job.greenhouse_id);
    }
  }
}

function matchBadge(result, jobId) {
  if (!result) return '<span style="color:var(--text-faint);font-size:10px;">\u2014</span>';
  var score = typeof result === 'number' ? result : result.score;
  var rName = typeof result === 'object' ? (result.resumeName || '') : '';
  var color = score >= 80 ? 'var(--green)' : score >= 60 ? '#22c55e' : score >= 40 ? 'var(--warm)' : 'var(--red)';
  var tooltip = score + '% match' + (rName ? ' \u00b7 ' + rName.replace(/"/g, '&quot;') : '');
  var clickAttr = jobId ? ' onclick="event.stopPropagation();showScoreExplainer(\'' + jobId + '\')" style="font-family:var(--mono);font-size:11px;font-weight:600;color:' + color + ';cursor:pointer;text-decoration:underline dotted;"' : ' style="font-family:var(--mono);font-size:11px;font-weight:600;color:' + color + ';cursor:help;"';
  return '<span title="' + tooltip + '" ' + clickAttr + '>' + score + '</span>';
}

// Main readiness analysis — runs automatically on Resumes page load, or manually via button
// ─── Resume selector for readiness analysis ───
var _resumeSelectOpen = false;
var _selectedResumeIdxs = null; // null = all, Set = specific indexes

function toggleResumeSelector() {
  var dd = document.getElementById('resume-select-dropdown');
  if (!dd) return;
  _resumeSelectOpen = !_resumeSelectOpen;
  dd.style.display = _resumeSelectOpen ? '' : 'none';
  if (_resumeSelectOpen) populateResumeSelector();
}

function populateResumeSelector() {
  var list = document.getElementById('resume-select-list');
  if (!list) return;
  var eligible = [];
  for (var i = 0; i < resumes.length; i++) {
    if (!resumes[i].archived && resumes[i].textStatus === 'ready' && resumes[i].keywords && resumes[i].keywords.length > 0) {
      eligible.push(i);
    }
  }
  if (eligible.length === 0) {
    list.innerHTML = '<div style="font-size:11px;color:var(--text-faint);padding:8px;">No eligible resumes</div>';
    return;
  }
  var html = '';
  eligible.forEach(function(ri) {
    var r = resumes[ri];
    var checked = !_selectedResumeIdxs || _selectedResumeIdxs.has(ri) ? 'checked' : '';
    html += '<label style="display:flex;align-items:center;gap:8px;padding:4px 0;cursor:pointer;font-size:12px;color:var(--text-dim);">';
    html += '<input type="checkbox" ' + checked + ' onchange="onResumeSelectChange(' + ri + ', this.checked)" style="accent-color:var(--accent);">';
    html += '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (r.name || 'Resume ' + (ri + 1)) + '</span>';
    html += '</label>';
  });
  list.innerHTML = html;
}

function onResumeSelectChange(ri, checked) {
  if (!_selectedResumeIdxs) {
    // First deselection — initialize set with all eligible
    _selectedResumeIdxs = new Set();
    for (var i = 0; i < resumes.length; i++) {
      if (!resumes[i].archived && resumes[i].textStatus === 'ready' && resumes[i].keywords && resumes[i].keywords.length > 0) {
        _selectedResumeIdxs.add(i);
      }
    }
  }
  if (checked) _selectedResumeIdxs.add(ri);
  else _selectedResumeIdxs.delete(ri);
}

function selectAllResumes(all) {
  _selectedResumeIdxs = all ? null : new Set();
  populateResumeSelector();
}

// Close dropdown on outside click
document.addEventListener('click', function(e) {
  if (_resumeSelectOpen && !e.target.closest('#resume-select-wrap')) {
    _resumeSelectOpen = false;
    var dd = document.getElementById('resume-select-dropdown');
    if (dd) dd.style.display = 'none';
  }
});

// ─── AI-powered resume scoring (credit-gated) ───
async function fetchAIScore(params) {
  if (window._aiScoreDisabled) return null;
  try {
    // Credit gate: require 3 credits for AI scoring (admins bypass)
    if (typeof requireCredits === 'function') {
      var hasCredits = await requireCredits(3, 'Resume AI Score');
      if (!hasCredits) return null;
    }

    var session = await sb.auth.getSession();
    if (!session.data.session) return null;

    // Debit credits before calling (admin gets free pass via RPC)
    if (typeof debitCreditsForAction === 'function') {
      var debitResult = await debitCreditsForAction(3, 'claude', 'AI resume score');
      if (debitResult && !debitResult.success && !debitResult.admin) {
        return null; // insufficient credits — requireCredits already showed toast
      }
    }

    var res = await fetch(SUPABASE_URL + '/functions/v1/score-resume', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + session.data.session.access_token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(params)
    });

    // ─── 5.2: Batch queue path for expired_free users ───
    if (res.status === 202 && res.headers.get('X-Score-Queued') === 'true') {
      var queueData = await res.json();
      if (queueData.queued && queueData.queue_id) {
        _startScoreQueuePoll(queueData.queue_id, params);
      }
      return null;
    }

    if (!res.ok) {
      console.log('[BJ] AI score HTTP', res.status);
      if (res.status === 406 || res.status === 404) {
        window._aiScoreDisabled = true;
        console.warn('[BJ] AI scoring disabled — Edge Function returned ' + res.status + '. Redeploy with: supabase functions deploy score-resume --no-verify-jwt');
      }
      return null;
    }
    var data = await res.json();
    if (data.error) { console.log('[BJ] AI score error:', data.error); return null; }

    // ─── Premium tier response ───
    if (data.tier === 'premium' || data.tier === 'basic_fallback') {
      return {
        score: data.overall_score || data.match_score,
        matched: null,
        total: null,
        topMissing: (data.gap_analysis || []).map(function(g) { return { term: g.requirement + ' (' + g.severity + ')', count: null }; }),
        topMatched: (data.strength_map || []).map(function(s) { return { term: s.area, count: null }; }),
        bigramMatched: [],
        bigramMissing: [],
        jdsAnalyzed: data.jds_analyzed,
        ai: true,
        premium: data.tier === 'premium',
        partial: data.partial || false,
        fitStatus: data.fit_status,
        summary: data.executive_summary,
        dimensionScores: data.dimension_scores,
        strengthMap: data.strength_map,
        gapAnalysis: data.gap_analysis,
        resumeProfile: data.resume_profile,
        jdProfile: data.jd_profile,
        coaching: data.coaching,
        coreRequirements: data.jd_profile ? (data.jd_profile.core_requirements || []).map(function(cr) {
          var hasEvidence = (data.strength_map || []).some(function(s) { return s.area && s.area.toLowerCase().includes(cr.skill.toLowerCase()); });
          return { skill: cr.skill, prevalence: cr.prevalence_pct, resume_evidence: hasEvidence ? 'strong' : 'missing' };
        }) : [],
        recommendations: data.coaching ? {
          missing_tools: (data.coaching.missing_keyword_injections || []).map(function(k) { return k.keyword; }),
          title_translation: (data.coaching.title_translations || []).map(function(t) { return t.current_title + ' → ' + t.suggested_title; }),
          format: data.coaching.format_improvements || [],
          impact_quantification: (data.coaching.achievement_prompts || []).map(function(a) { return a.weak_bullet; }),
        } : null,
        levelFit: data.level_fit,
        differentialInsight: data.calibration_note,
        careerTrajectory: data.career_trajectory_assessment,
        scopeComparison: typeof data.scope_comparison === 'object' ? data.scope_comparison.delta : data.scope_comparison,
        industryDetected: data.industry_detected,
        agentsUsed: data.agents_used,
        passesCompleted: data.passes_completed,
        timingMs: data.timing_ms,
        upgradePrompt: data.upgrade_prompt
      };
    }

    // ─── Basic tier response (unchanged) ───
    return {
      score: data.match_score,
      matched: null,
      total: null,
      topMissing: (data.recommendations && (data.recommendations.missing_tools || data.recommendations.missing_skills) || data.key_gaps || []).map(function(s) { return { term: s, count: null }; }),
      topMatched: (data.key_matches || []).map(function(s) { return { term: s, count: null }; }),
      bigramMatched: [],
      bigramMissing: [],
      jdsAnalyzed: data.jds_analyzed,
      ai: true,
      premium: false,
      fitStatus: data.fit_status,
      summary: data.analysis_summary,
      coreRequirements: data.core_requirements,
      recommendations: data.recommendations,
      levelFit: data.level_fit,
      differentialInsight: data.differential_insight,
      careerTrajectory: data.career_trajectory_assessment,
      scopeComparison: data.scope_comparison,
      upgradePrompt: data.upgrade_prompt
    };
  } catch (e) {
    reportError('keywords', e);
    console.error('[BJ] AI score error, falling back to ngram:', e);
    return null;
  }
}

async function runReadinessAnalysis(opts) {
  opts = opts || {};
  var silent = opts.silent || false;
  var singleResumeIdx = typeof opts.resumeIndex === 'number' ? opts.resumeIndex : null;
  var btn = singleResumeIdx !== null ? document.getElementById('rc-score-' + singleResumeIdx) : document.getElementById('readiness-run-btn');
  var statusEl = document.getElementById('readiness-status');
  var resultsEl = document.getElementById('readiness-results');

  if (readinessRunning) return;
  readinessRunning = true;

  if (!silent && btn) { btn.disabled = true; btn.textContent = 'Scoring…'; }

  var sf = safeReadLS('bj_saved_filters', []);

  // Extract keywords now if missing (e.g. backfilled resumes that loaded before keywords bundle)
  for (var ki = 0; ki < resumes.length; ki++) {
    var kr = resumes[ki];
    if (!kr.archived && kr.extractedText && kr.extractedText.length > 100 &&
        typeof extractResumeKeywords === 'function' && (!kr.keywords || kr.keywords.length === 0)) {
      resumes[ki].keywords = extractResumeKeywords(kr.extractedText);
      resumes[ki].textStatus = 'ready';
    }
  }

  var hasEligible = false;
  for (var i = 0; i < resumes.length; i++) {
    if (!resumes[i].archived && resumes[i].textStatus === 'ready' && resumes[i].keywords && resumes[i].keywords.length > 0) {
      hasEligible = true; break;
    }
  }

  if (!hasEligible) {
    if (resultsEl) resultsEl.innerHTML = '<div style="font-size:13px;color:var(--text-faint);padding:16px 0;">Upload a resume and wait for keyword extraction to complete before analyzing readiness.</div>';
    if (!silent && btn) { btn.disabled = false; btn.textContent = 'Score Resume'; }
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

    // Single-resume mode: only analyze the requested resume
    if (singleResumeIdx !== null && ri !== singleResumeIdx) continue;
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

      var filterScore = null;

      // Try AI scoring for Pro users
      var userPlan = window._bjUserPlan || 'free';
      var jdsWithContentAI = jds.filter(function(j){ return j.content; });
      var analysisTier = opts.tier || 'basic';
      if ((userPlan === 'pro' || userPlan === 'enterprise') && r.extractedText && jdsWithContentAI.length >= 3) {
        if (statusEl) statusEl.textContent = (analysisTier === 'premium' ? 'Deep AI analysis' : 'AI scoring') + ' for "' + filter.name + '"\u2026';
        filterScore = await fetchAIScore({
          resume_text: r.extractedText,
          resume_keywords: r.keywords,
          mode: 'corpus',
          tier: analysisTier,
          filter_name: filter.name,
          job_ids: jdsWithContentAI.map(function(j) { return j.greenhouse_id; }),
          max_jds: 20
        });
      }

      // Fallback to ngram scoring
      if (!filterScore) {
        filterScore = scoreResumeVsJDs(r, jds);
      }
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
  saveUserData('bj_readiness', JSON.stringify(readinessCache));

  // Update resume cards with grades
  updateResumeCardGrades(scores);

  // Update readiness panel (detailed breakdown)
  renderReadinessResults(scores);

  // Clear feed match cache so scores recompute with new corpus
  jobMatchScores = {};

  if (statusEl) statusEl.textContent = 'Analyzed ' + totalFiltersAnalyzed + ' filter' + (totalFiltersAnalyzed !== 1 ? 's' : '') + ', fetched ' + totalJDsFetched + ' new JDs';
  if (btn) { btn.disabled = false; btn.textContent = singleResumeIdx !== null ? 'Re-score' : 'Score All'; }
  readinessRunning = false;

  // v5.17: PostHog completion events
  if (window.posthog && singleResumeIdx !== null && scores[singleResumeIdx]) {
    var _sc = scores[singleResumeIdx];
    if (_lastScoreMode === 'coaching' || (opts.tier === 'premium')) {
      posthog.capture('resume_coaching_complete', { resume_id: singleResumeIdx, score: _sc.overallScore, credits_used: 5 });
    } else {
      posthog.capture('resume_quick_score_complete', { resume_id: singleResumeIdx, score: _sc.overallScore });
    }
  }

  // v6.05: Fire CV score notification (score-sequence Edge Function)
  if (typeof window.triggerScoreNotification === 'function') {
    (async function() {
      try {
        var _user = typeof sb !== 'undefined' ? (await sb.auth.getUser()).data.user : null;
        if (!_user) return;
        // Fire for each resume that was scored
        for (var _ri in scores) {
          var _sd = scores[_ri];
          if (!_sd || !_sd.overallScore) continue;
          // Use first filter's top job as context
          var _filterNames = Object.keys(_sd.filters || {});
          var _jobTitle = null, _companyName = null, _jobId = null, _analysisSummary = null;
          if (_filterNames.length > 0) {
            var _fd = _sd.filters[_filterNames[0]];
            _analysisSummary = {
              strengths: (_fd.topMatched || []).map(function(m) { return m.term; }),
              gaps: (_fd.topMissing || []).map(function(m) { return { skill: m.term, recommendation: 'Add to resume' }; }),
              missing_skills: (_fd.topMissing || []).map(function(m) { return m.term; })
            };
            // Try to get job context from jdCache
            if (typeof jdCache !== 'undefined') {
              for (var _jk in jdCache) {
                if (jdCache[_jk] && jdCache[_jk].title) {
                  _jobTitle = jdCache[_jk].title;
                  _companyName = jdCache[_jk].company_name || jdCache[_jk].company || null;
                  _jobId = _jk;
                  break;
                }
              }
            }
          }
          window.triggerScoreNotification(_user.id, _jobId || 'readiness-' + _ri, _sd.overallScore, _analysisSummary, _jobTitle, _companyName);
        }
      } catch(e) { reportError('keywords', e); console.warn('[score-notif] Hook error:', e.message); }
    })();
  }

  // v5.17: Show upsell card after Quick Score for non-Pro users
  if (singleResumeIdx !== null && _lastScoreMode === 'quick') {
    var tier = typeof getUserTier === 'function' ? getUserTier() : 'free';
    var credits = typeof getUserCredits === 'function' ? getUserCredits() : 0;
    if (tier !== 'pro' || credits < 5) {
      _showUpsellCard(singleResumeIdx, tier, credits);
    }
  }
}

// ============================================================
// v5.17: Resume Score Button UX — Single Entry Point
// ============================================================

var _lastScoreMode = 'quick';

/**
 * Handle Score Resume button click — routes by tier.
 * Free/Starter/Pro-no-credits → Quick Score + upsell
 * Pro with credits → Selection modal
 */
window.handleScoreClick = function(resumeIndex) {
  var tier = typeof getUserTier === 'function' ? getUserTier() : 'free';
  var credits = typeof getUserCredits === 'function' ? getUserCredits() : 0;

  // PostHog: resume_score_clicked
  if (window.posthog) posthog.capture('resume_score_clicked', { tier: tier, has_credits: credits >= 5, resume_id: resumeIndex });

  if (tier === 'pro' && credits >= 5) {
    _showScoreModal(resumeIndex);
  } else {
    _lastScoreMode = 'quick';
    var btn = document.getElementById('rc-score-' + resumeIndex);
    if (btn) { btn.disabled = true; btn.textContent = 'Scoring\u2026'; }
    runReadinessAnalysis({ resumeIndex: resumeIndex });
  }
};

/** Pro user selection modal */
function _showScoreModal(resumeIndex) {
  var existing = document.getElementById('bj-score-modal-overlay');
  if (existing) existing.remove();

  var lastMode = localStorage.getItem('bj_score_mode') || 'quick';

  var overlay = document.createElement('div');
  overlay.id = 'bj-score-modal-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:99990;display:flex;align-items:center;justify-content:center;';
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

  overlay.innerHTML = '<div style="background:var(--card);border-radius:12px;padding:24px;max-width:420px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.3);">' +
    '<div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:16px;">Choose scoring mode</div>' +
    '<div style="display:flex;gap:12px;">' +
      '<div id="score-opt-quick" onclick="_selectScoreMode(\'quick\',' + resumeIndex + ')" style="flex:1;padding:16px;border-radius:8px;border:2px solid ' + (lastMode === 'quick' ? 'var(--accent)' : 'var(--border)') + ';cursor:pointer;transition:border-color 0.2s;">' +
        '<div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:4px;">Quick Score</div>' +
        '<div style="font-size:11px;color:var(--text-dim);margin-bottom:8px;">Keyword match against this job\u2019s requirements</div>' +
        '<span style="font-size:10px;padding:2px 8px;border-radius:4px;background:rgba(74,154,107,0.15);color:#4a9a6b;font-weight:600;">Free</span>' +
      '</div>' +
      '<div id="score-opt-coaching" onclick="_selectScoreMode(\'coaching\',' + resumeIndex + ')" style="flex:1;padding:16px;border-radius:8px;border:2px solid ' + (lastMode === 'coaching' ? 'var(--indigo)' : 'var(--border)') + ';cursor:pointer;transition:border-color 0.2s;">' +
        '<div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:4px;">AI Coaching</div>' +
        '<div style="font-size:11px;color:var(--text-dim);margin-bottom:8px;">Section-by-section analysis with rewrite suggestions</div>' +
        '<span style="font-size:10px;padding:2px 8px;border-radius:4px;background:rgba(99,102,241,0.15);color:var(--indigo);font-weight:600;">5 credits</span>' +
      '</div>' +
    '</div>' +
    '<div style="margin-top:16px;text-align:right;">' +
      '<button onclick="document.getElementById(\'bj-score-modal-overlay\').remove()" style="padding:6px 14px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--text-dim);cursor:pointer;font-size:12px;margin-right:8px;">Cancel</button>' +
    '</div>' +
  '</div>';

  document.body.appendChild(overlay);
}

/** Handle mode selection from the Pro modal */
window._selectScoreMode = function(mode, resumeIndex) {
  localStorage.setItem('bj_score_mode', mode);
  _lastScoreMode = mode;

  var credits = typeof getUserCredits === 'function' ? getUserCredits() : 0;
  if (window.posthog) posthog.capture('resume_score_mode_selected', { mode: mode, credits_remaining: credits });

  var overlay = document.getElementById('bj-score-modal-overlay');
  if (overlay) overlay.remove();

  var btn = document.getElementById('rc-score-' + resumeIndex);
  if (btn) { btn.disabled = true; btn.textContent = 'Scoring\u2026'; }

  if (mode === 'coaching') {
    runReadinessAnalysis({ resumeIndex: resumeIndex, tier: 'premium' });
  } else {
    runReadinessAnalysis({ resumeIndex: resumeIndex });
  }
};

/** Contextual upsell card for Free/Starter users after Quick Score */
function _showUpsellCard(resumeIndex, tier, credits) {
  // Check dismissal
  var dismissed = localStorage.getItem('bj_score_upsell_dismissed');
  if (dismissed) {
    var dismissedAt = new Date(dismissed).getTime();
    if (Date.now() - dismissedAt < 7 * 24 * 60 * 60 * 1000) return; // 7-day cool-off
  }

  var container = document.getElementById('ai-panel-content-' + resumeIndex);
  if (!container) return;

  // Don't double-add
  if (container.querySelector('.bj-upsell-card')) return;

  var ctaLabel = (tier === 'pro' && credits < 5) ? 'Buy credits to unlock' : 'Unlock AI Coaching \u2014 5 credits';
  var ctaDest = (tier === 'pro' && credits < 5) ? 'credits' : 'pricing';
  var _upsellShownAt = Date.now();

  if (window.posthog) posthog.capture('resume_coaching_upsell_shown', { tier: tier, quick_score_value: true });

  var card = document.createElement('div');
  card.className = 'bj-upsell-card';
  card.style.cssText = 'margin-top:12px;padding:14px;border:1px solid rgba(99,102,241,0.25);border-radius:8px;background:rgba(99,102,241,0.05);position:relative;';
  card.innerHTML =
    '<button onclick="this.parentElement.remove();localStorage.setItem(\'bj_score_upsell_dismissed\',new Date().toISOString());' +
      'if(window.posthog)posthog.capture(\'resume_coaching_upsell_dismissed\',{tier:\'' + escapeHtml(tier) + '\',seconds_visible:Math.round((Date.now()-' + _upsellShownAt + ')/1000)});" ' +
      'style="position:absolute;top:6px;right:8px;background:none;border:none;color:var(--text-faint);cursor:pointer;font-size:14px;padding:2px 6px;" title="Dismiss">\u00d7</button>' +
    '<div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:4px;">Want deeper insights?</div>' +
    '<div style="font-size:11px;color:var(--text-dim);margin-bottom:10px;">AI Coaching analyzes your resume section-by-section and suggests specific rewrites to match this role.</div>' +
    '<button onclick="if(window.posthog)posthog.capture(\'resume_coaching_upsell_accepted\',{tier:\'' + escapeHtml(tier) + '\',destination:\'' + ctaDest + '\'});' +
      'document.querySelector(\'[data-page=billing]\')?.click();" ' +
      'style="background:linear-gradient(135deg,#4d8eff,#7c3aed);color:#fff;border:none;border-radius:6px;padding:8px 16px;font-size:12px;font-weight:600;cursor:pointer;">' +
      escapeHtml(ctaLabel) + '</button>';

  container.appendChild(card);
}

// Reset upsell dismissal on resume upload (per spec)
var _origAddResume = window.addResume;
if (typeof _origAddResume === 'function') {
  window.addResume = function() {
    localStorage.removeItem('bj_score_upsell_dismissed');
    return _origAddResume.apply(this, arguments);
  };
}

// Update grade display on each resume card in-place
function updateResumeCardGrades(scores) {
  if (!scores) return;
  var indices = Object.keys(scores);
  for (var si = 0; si < indices.length; si++) {
    var ri = indices[si];
    var data = scores[ri];
    // Grade display moved entirely to side panel — no inline card grade
  }
  // Update side panels (the primary readiness display)
  updateReadinessSidePanels(scores);
}

// Build the inline grade + insights HTML for a resume card
function buildInlineGrade(ri, data) {
  if (!data) return '';
  var g = scoreToGrade(data.overallScore);
  var filterNames = Object.keys(data.filters);
  var detailId = 'rc-insights-' + ri;

  var html = '<div style="padding:8px 10px;border-radius:8px;background:var(--bg-main);border:1px solid var(--border);margin-bottom:6px;">';

  // Top row: score + CTA
  html += '<div style="display:flex;align-items:center;gap:8px;">';
  html += '<span style="font-family:var(--mono);font-size:22px;font-weight:800;color:' + g.color + ';line-height:1;">' + data.overallScore + '%</span>';

  // Per-filter mini scores
  if (filterNames.length > 0) {
    html += '<div style="display:flex;gap:4px;margin-left:4px;">';
    for (var fi = 0; fi < filterNames.length; fi++) {
      var fname = filterNames[fi];
      var fs = data.filters[fname];
      var fg = scoreToGrade(fs.score);
      html += '<span title="' + escapeHtml(fname) + ': ' + fs.score + '% (' + fs.matched + '/' + fs.total + ' terms)" style="font-size:9px;padding:1px 5px;border-radius:4px;background:' + fg.color + '15;color:' + fg.color + ';font-weight:600;font-family:var(--mono);cursor:help;">' + fg.grade + '</span>';
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
    html += '<span style="font-family:var(--mono);font-size:11px;font-weight:700;color:' + fg2.color + ';">' + fg2.grade + '</span>';
    html += '<span style="font-size:11px;font-weight:600;color:var(--text);">' + escapeHtml(fname2) + '</span>';
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
      html += '<div style="font-family:var(--mono);font-size:11px;font-weight:700;color:' + lg.color + ';">' + lg.grade + '</div>';
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

// Build readiness side panel for a single resume (positioned beside card in row layout)
function buildReadinessSide(ri, data) {
  if (!data) return '';
  var g = scoreToGrade(data.overallScore);
  var filterNames = Object.keys(data.filters);
  var overallLabel = data.overallScore >= 70 ? 'Ready' : data.overallScore >= 40 ? 'Gaps' : 'Weak';

  var html = '<div class="readiness-side" id="readiness-side-' + ri + '">';

  // Header with score and re-analyze button (only if multiple filters to show aggregate)
  if (filterNames.length > 1) {
    html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">';
    html += '<div style="font-family:var(--mono);font-size:26px;font-weight:700;color:' + g.color + ';line-height:1;">' + data.overallScore + '%</div>';
    html += '<div style="font-size:10px;color:' + g.color + ';font-weight:600;">' + overallLabel + '</div>';
    html += '<button class="btn btn-sm btn-secondary" id="rc-score-' + ri + '" onclick="handleScoreClick(' + ri + ')" style="margin-left:auto;font-size:10px;padding:3px 10px;">Re-score</button>';
    html += '</div>';
  } else {
    html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">';
    html += '<div style="font-family:var(--mono);font-size:26px;font-weight:700;color:' + g.color + ';line-height:1;">' + data.overallScore + '%</div>';
    html += '<div style="font-size:10px;color:' + g.color + ';font-weight:600;">' + overallLabel + '</div>';
    html += '<button class="btn btn-sm btn-secondary" id="rc-score-' + ri + '" onclick="handleScoreClick(' + ri + ')" style="margin-left:auto;font-size:10px;padding:3px 10px;">Re-score</button>';
    html += '</div>';
  }

  // Per-filter breakdown
  for (var fi = 0; fi < filterNames.length; fi++) {
    var fname = filterNames[fi];
    var fs = data.filters[fname];
    var fc = fs.score >= 70 ? 'var(--green)' : fs.score >= 40 ? 'var(--warm)' : 'var(--red)';
    var detailId = 'rds-detail-' + ri + '-' + fi;

    html += '<div style="margin-bottom:10px;padding-bottom:10px;' + (fi < filterNames.length - 1 ? 'border-bottom:1px solid var(--border);' : '') + '">';
    html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">';
    if (filterNames.length > 1) {
      html += '<span style="font-family:var(--mono);font-size:12px;font-weight:600;color:' + fc + ';">' + fs.score + '%</span>';
    }
    html += '<span style="font-size:11px;font-weight:600;color:var(--text);">' + escapeHtml(fname) + '</span>';
    if (fs.ai) {
      html += '<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:rgba(77,142,255,0.15);color:#4d8eff;font-weight:600;">AI</span>';
      html += '<span style="font-size:11px;color:var(--text-faint);">' + escapeHtml(fs.fitStatus || '') + ' \u00b7 ' + fs.jdsAnalyzed + ' JDs</span>';
    } else {
      html += '<span style="font-size:9px;color:var(--text-faint);">' + fs.matched + '/' + fs.total + ' terms \u00b7 ' + fs.jdsAnalyzed + ' JDs</span>';
    }
    html += '<span onclick="document.getElementById(\'' + detailId + '\').style.display=document.getElementById(\'' + detailId + '\').style.display===\'none\'?\'\':\'none\';this.textContent=document.getElementById(\'' + detailId + '\').style.display===\'none\'?\'Show all \u25b8\':\'Hide \u25be\'" style="font-size:10px;color:var(--accent);cursor:pointer;margin-left:auto;font-weight:500;white-space:nowrap;">Show all \u25b8</span>';
    html += '</div>';

    // ─── AI results rendering ───
    if (fs.ai && fs.summary) {
      html += '<div style="font-size:13px;color:var(--text-dim);margin-bottom:8px;line-height:1.6;">' + escapeHtml(fs.summary || '') + '</div>';

      // Premium: dimension score bars
      if (fs.premium && fs.dimensionScores) {
        html += buildDimensionBarsHtml(fs.dimensionScores);
      }

      // Premium: industry detected badge
      if (fs.premium && fs.industryDetected) {
        html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">';
        html += '<span style="font-size:9px;padding:2px 6px;border-radius:3px;background:rgba(77,142,255,0.1);color:#4d8eff;font-weight:600;">PREMIUM</span>';
        html += '<span style="font-size:10px;color:var(--text-faint);">' + fs.industryDetected + ' \u00b7 ' + fs.agentsUsed + ' agents \u00b7 ' + (fs.timingMs / 1000).toFixed(1) + 's</span>';
        html += '</div>';
      }

      // Core requirements (AI)
      if (fs.coreRequirements && fs.coreRequirements.length > 0) {
        html += '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px;">';
        for (var cri = 0; cri < fs.coreRequirements.length; cri++) {
          var cr = fs.coreRequirements[cri];
          var crColor = cr.resume_evidence === 'strong' ? 'var(--green)' : cr.resume_evidence === 'partial' ? 'var(--warm)' : 'var(--red)';
          var crBg = cr.resume_evidence === 'strong' ? 'rgba(34,197,94,0.06)' : cr.resume_evidence === 'partial' ? 'rgba(245,158,11,0.06)' : 'rgba(239,68,68,0.06)';
          var crBorder = cr.resume_evidence === 'strong' ? 'rgba(34,197,94,0.2)' : cr.resume_evidence === 'partial' ? 'rgba(245,158,11,0.2)' : 'rgba(239,68,68,0.15)';
          var crIcon = cr.resume_evidence === 'strong' ? '\u2713' : cr.resume_evidence === 'partial' ? '\u25cb' : '\u2717';
          html += '<span style="font-size:11px;padding:2px 7px;border-radius:4px;background:' + crBg + ';border:1px solid ' + crBorder + ';color:' + crColor + ';">' + crIcon + ' ' + cr.skill + ' <span style="opacity:0.7">' + cr.prevalence + '%</span></span>';
        }
        html += '</div>';
      }

      // Expandable AI detail
      html += '<div id="' + detailId + '" style="display:none;margin-top:6px;">';

      // Recommendations
      if (fs.recommendations) {
        var recSections = [
          { key: 'impact_quantification', label: 'Impact & Metrics', icon: '\u25b9' },
          { key: 'missing_tools', label: 'Missing Tools & Platforms', icon: '\u25b9' },
          { key: 'title_translation', label: 'Title Adjustments', icon: '\u25b9' },
          { key: 'tone_alignment', label: 'Language & Tone', icon: '\u25b9' },
          { key: 'redundancy_fixes', label: 'Cut / Tighten', icon: '\u25b9' },
          { key: 'format', label: 'Format & Structure', icon: '\u25b9' },
          { key: 'missing_skills', label: 'Missing Skills', icon: '\u25b9' },
          { key: 'word_usage', label: 'Word Usage', icon: '\u25b9' },
        ];
        recSections.forEach(function(sec) {
          var items = fs.recommendations[sec.key];
          if (items && items.length > 0) {
            html += '<div style="font-size:11px;font-weight:600;color:var(--text-faint);margin:6px 0 4px;">' + sec.icon + ' ' + sec.label + '</div>';
            if (sec.key === 'missing_tools' || sec.key === 'missing_skills') {
              html += '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px;">';
              items.forEach(function(s) {
                html += '<span style="font-size:11px;padding:2px 7px;border-radius:4px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.15);color:var(--red);">\u2717 ' + s + '</span>';
              });
              html += '</div>';
            } else {
              items.forEach(function(tip) {
                html += '<div style="font-size:12px;color:var(--text-dim);padding-left:10px;margin-bottom:3px;line-height:1.5;">\u2192 ' + tip + '</div>';
              });
            }
          }
        });

        // Gap narrative (single string, not array)
        if (fs.recommendations.gap_narrative) {
          html += '<div style="font-size:11px;font-weight:600;color:var(--text-faint);margin:6px 0 4px;">\u25b9 Career Gap Narrative</div>';
          html += '<div style="font-size:12px;color:var(--text-dim);padding-left:10px;margin-bottom:3px;line-height:1.5;">' + fs.recommendations.gap_narrative + '</div>';
        }
      }

      // Career trajectory assessment
      if (fs.careerTrajectory) {
        html += '<div style="font-size:11px;font-weight:600;color:var(--text-faint);margin:8px 0 4px;">\u25b9 Career Trajectory</div>';
        html += '<div style="font-size:12px;color:var(--text-dim);padding-left:10px;line-height:1.5;">' + fs.careerTrajectory + '</div>';
      }

      // Scope comparison
      if (fs.scopeComparison) {
        html += '<div style="font-size:11px;font-weight:600;color:var(--text-faint);margin:8px 0 4px;">\u25b9 Scope Match</div>';
        html += '<div style="font-size:12px;color:var(--text-dim);padding-left:10px;line-height:1.5;">' + fs.scopeComparison + '</div>';
      }

      // Level fit (AI)
      if (fs.levelFit) {
        html += '<div style="font-size:11px;font-weight:600;color:var(--text-faint);margin:8px 0 4px;">\u25b9 Level Fit</div>';
        html += '<div style="font-size:12px;color:var(--text-dim);padding:6px 10px;background:var(--bg-card);border-radius:6px;border:1px solid var(--border);line-height:1.5;">';
        html += '<strong>' + fs.levelFit.best_level + '</strong> \u2014 ' + fs.levelFit.reasoning;
        html += '</div>';
      }

      // Differential insight
      if (fs.differentialInsight) {
        html += '<div style="font-size:12px;color:var(--accent);margin-top:8px;font-style:italic;line-height:1.5;">' + fs.differentialInsight + '</div>';
      }

      // Premium: coaching section
      if (fs.premium && fs.coaching) {
        html += buildPremiumCoachingHtml(fs);

        // Gap interview container (populated async after render)
        html += '<div id="gap-interview-container-' + ri + '-' + fi + '"></div>';

        // Acceptance UI (hidden until gap interview completes or is skipped)
        html += buildAcceptanceHtml(ri, fi, fs);
      }

      html += '</div>'; // close expandable
    } else {
      // ─── Ngram results rendering (fallback) ───

    // Missing terms preview
    if (fs.topMissing && fs.topMissing.length > 0) {
      html += '<div style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:4px;">';
      var previewCount = Math.min(5, fs.topMissing.length);
      for (var mi = 0; mi < previewCount; mi++) {
        var mt = typeof fs.topMissing[mi] === 'object' ? fs.topMissing[mi].term : fs.topMissing[mi];
        html += '<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.15);color:var(--red);">\u2717 ' + mt + '</span>';
      }
      if (fs.topMissing.length > 5) html += '<span style="font-size:9px;color:var(--text-faint);">+' + (fs.topMissing.length - 5) + ' more</span>';
      html += '</div>';
    }

    // Expandable: matched + missing bigrams
    html += '<div id="' + detailId + '" style="display:none;margin-top:6px;">';
    if (fs.topMatched && fs.topMatched.length > 0) {
      html += '<div style="font-size:9px;font-weight:600;color:var(--text-faint);margin-bottom:3px;">Covered:</div>';
      html += '<div style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:6px;">';
      for (var gi = 0; gi < fs.topMatched.length; gi++) {
        var gt = typeof fs.topMatched[gi] === 'object' ? fs.topMatched[gi].term : fs.topMatched[gi];
        html += '<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.2);color:var(--green);">\u2713 ' + gt + '</span>';
      }
      html += '</div>';
    }
    if (fs.bigramMissing && fs.bigramMissing.length > 0) {
      html += '<div style="font-size:9px;font-weight:600;color:var(--text-faint);margin-bottom:3px;">Missing phrases:</div>';
      html += '<div style="display:flex;flex-wrap:wrap;gap:3px;">';
      for (var bmi = 0; bmi < Math.min(10, fs.bigramMissing.length); bmi++) {
        var bmt = typeof fs.bigramMissing[bmi] === 'object' ? fs.bigramMissing[bmi].term : fs.bigramMissing[bmi];
        html += '<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.15);color:var(--red);">\u2717 ' + bmt + '</span>';
      }
      html += '</div>';
    }
    html += '</div>'; // close expandable

    } // end ngram branch

    html += '</div>'; // close filter block
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
      var lc = ls.score >= 70 ? 'var(--green)' : ls.score >= 40 ? 'var(--warm)' : 'var(--red)';
      html += '<div style="text-align:center;padding:4px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg-main);min-width:60px;">';
      html += '<div style="font-family:var(--mono);font-size:12px;font-weight:700;color:' + lc + ';">' + ls.score + '%</div>';
      html += '<div style="font-size:10px;color:var(--text-dim);">' + lbl + '</div>';
      html += '<div style="font-size:9px;color:var(--text-faint);">' + ls.jobCount + ' jobs</div>';
      html += '</div>';
    }
    html += '</div></div>';
  }

  html += '</div>';
  return html;
}

// ─── Premium coaching panel (rendered inside readiness side when premium data exists) ───
function buildPremiumCoachingHtml(fs) {
  if (!fs.coaching) return '';
  var c = fs.coaching;
  var html = '';

  // Priority actions — the headline feature
  if (c.priority_actions && c.priority_actions.length > 0) {
    html += '<div style="margin-top:10px;padding:10px;background:rgba(77,142,255,0.04);border:1px solid rgba(77,142,255,0.15);border-radius:8px;">';
    html += '<div style="font-size:11px;font-weight:700;color:#4d8eff;margin-bottom:8px;">\u2728 Top 3 Changes</div>';
    c.priority_actions.forEach(function(pa, idx) {
      html += '<div style="margin-bottom:8px;padding-bottom:8px;' + (idx < c.priority_actions.length - 1 ? 'border-bottom:1px solid rgba(77,142,255,0.1);' : '') + '">';
      html += '<div style="font-size:12px;font-weight:600;color:var(--text);line-height:1.5;">' + (idx + 1) + '. ' + pa.action + '</div>';
      html += '<div style="font-size:11px;color:var(--text-faint);margin-top:2px;">' + pa.why + '</div>';
      if (pa.expected_impact) html += '<div style="font-size:10px;color:var(--green);font-weight:600;margin-top:2px;">' + pa.expected_impact + '</div>';
      html += '</div>';
    });
    html += '</div>';
  }

  // Rewrite suggestions — before/after
  if (c.rewrite_suggestions && c.rewrite_suggestions.length > 0) {
    html += '<div style="margin-top:8px;">';
    html += '<div style="font-size:11px;font-weight:600;color:var(--text-faint);margin-bottom:4px;">\u270f\ufe0f Rewrite Suggestions</div>';
    c.rewrite_suggestions.forEach(function(rw) {
      html += '<div style="margin-bottom:8px;padding:8px;background:var(--bg-main);border-radius:6px;border:1px solid var(--border);">';
      if (rw.original_text) html += '<div style="font-size:11px;color:var(--red);text-decoration:line-through;margin-bottom:4px;line-height:1.5;">' + rw.original_text + '</div>';
      html += '<div style="font-size:11px;color:var(--green);line-height:1.5;">' + rw.suggested_text + '</div>';
      if (rw.rationale) html += '<div style="font-size:10px;color:var(--text-faint);margin-top:4px;font-style:italic;">' + rw.rationale + '</div>';
      html += '</div>';
    });
    html += '</div>';
  }

  // Gap bridging
  if (c.gap_bridging && c.gap_bridging.length > 0) {
    html += '<div style="margin-top:8px;">';
    html += '<div style="font-size:11px;font-weight:600;color:var(--text-faint);margin-bottom:4px;">\u2194 Bridge Gaps</div>';
    c.gap_bridging.forEach(function(gb) {
      html += '<div style="font-size:11px;color:var(--text-dim);margin-bottom:4px;line-height:1.5;"><strong style="color:var(--warm);">' + gb.gap + ':</strong> ' + gb.bridge_strategy + '</div>';
    });
    html += '</div>';
  }

  // Competitive positioning
  if (c.competitive_positioning) {
    html += '<div style="margin-top:8px;padding:8px;background:rgba(34,197,94,0.04);border:1px solid rgba(34,197,94,0.15);border-radius:6px;">';
    html += '<div style="font-size:11px;font-weight:600;color:var(--green);margin-bottom:4px;">\u2191 Positioning</div>';
    html += '<div style="font-size:12px;color:var(--text-dim);line-height:1.5;">' + c.competitive_positioning + '</div>';
    html += '</div>';
  }

  return html;
}

// ─── Premium dimension scores radar (simple bar visualization) ───
function buildDimensionBarsHtml(ds) {
  if (!ds) return '';
  var dims = [
    { key: 'trajectory', label: 'Trajectory', weight: '25%' },
    { key: 'impact', label: 'Impact', weight: '25%' },
    { key: 'skills', label: 'Skills', weight: '20%' },
    { key: 'alignment', label: 'Alignment', weight: '15%' },
    { key: 'education', label: 'Education', weight: '5%' },
    { key: 'presentation', label: 'Presentation', weight: '10%' }
  ];
  var html = '<div style="margin:8px 0;">';
  dims.forEach(function(d) {
    var val = ds[d.key] || 0;
    var color = val >= 70 ? 'var(--green)' : val >= 40 ? 'var(--warm)' : 'var(--red)';
    html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">';
    html += '<span style="font-size:10px;color:var(--text-faint);width:75px;text-align:right;">' + d.label + '</span>';
    html += '<div style="flex:1;height:6px;background:var(--bg-main);border-radius:3px;overflow:hidden;">';
    html += '<div style="width:' + val + '%;height:100%;background:' + color + ';border-radius:3px;"></div>';
    html += '</div>';
    html += '<span style="font-size:10px;font-family:var(--mono);color:' + color + ';width:28px;font-weight:600;">' + val + '</span>';
    html += '</div>';
  });
  html += '</div>';
  return html;
}

// ════════════════════════════════════════════════════════════
// GAP INTERVIEW + ACCEPTANCE UI (G7–G12)
// ════════════════════════════════════════════════════════════

// State for the rewrite pipeline — stored per resume index
window._bjRewriteState = {};

// G7: Fetch gap interview questions from Edge Function
async function fetchGapInterview(gapAnalysis, resumeProfile) {
  try {
    var session = await sb.auth.getSession();
    if (!session.data.session) return null;

    var res = await fetch(SUPABASE_URL + '/functions/v1/score-resume', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + session.data.session.access_token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        mode: 'gap-interview',
        gap_analysis: gapAnalysis,
        resume_profile: resumeProfile
      })
    });

    if (!res.ok) { console.log('[BJ] Gap interview HTTP', res.status); return null; }
    var data = await res.json();
    if (data.error) { console.log('[BJ] Gap interview error:', data.error); return null; }
    return data.gap_questions || [];
  } catch (e) {
    reportError('keywords', e);
    console.error('[BJ] Gap interview error:', e);
    return null;
  }
}

// G8: Build the Gap Interview UI
function buildGapInterviewHtml(ri, fi, gapQuestions) {
  if (!gapQuestions || gapQuestions.length === 0) return '';
  var stateKey = ri + '-' + fi;

  var html = '<div class="bj-gap-interview" id="gap-interview-' + stateKey + '" style="margin-top:12px;padding:12px;background:rgba(245,158,11,0.04);border:1px solid rgba(245,158,11,0.15);border-radius:8px;">';
  html += '<div style="font-size:12px;font-weight:700;color:var(--warm);margin-bottom:8px;">\ud83d\udd0d Close Your Gaps</div>';
  html += '<div style="font-size:11px;color:var(--text-dim);margin-bottom:10px;">We found gaps between your resume and target roles. Answer these questions to uncover experience you may have missed.</div>';

  gapQuestions.forEach(function(gq, gi) {
    var sevColor = gq.severity === 'critical' ? 'var(--red)' : gq.severity === 'important' ? 'var(--warm)' : 'var(--text-faint)';
    var sevBg = gq.severity === 'critical' ? 'rgba(239,68,68,0.08)' : gq.severity === 'important' ? 'rgba(245,158,11,0.08)' : 'rgba(128,128,128,0.05)';

    html += '<div style="margin-bottom:10px;padding:8px;background:' + sevBg + ';border-radius:6px;border:1px solid var(--border);">';
    html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">';
    html += '<span style="font-size:10px;padding:1px 5px;border-radius:3px;background:' + sevBg + ';color:' + sevColor + ';font-weight:600;border:1px solid ' + sevColor + ';">' + gq.severity + '</span>';
    html += '<span style="font-size:12px;font-weight:600;color:var(--text);">' + gq.gap + '</span>';
    html += '</div>';

    if (gq.hint) {
      html += '<div style="font-size:10px;color:var(--text-faint);margin-bottom:6px;font-style:italic;">' + gq.hint + '</div>';
    }

    (gq.questions || []).forEach(function(q, qi) {
      var inputId = 'gap-answer-' + stateKey + '-' + gi + '-' + qi;
      html += '<div style="margin-bottom:4px;">';
      html += '<div style="font-size:11px;color:var(--text-dim);margin-bottom:2px;">' + q + '</div>';
      html += '<input type="text" id="' + inputId + '" placeholder="Your answer (optional)" style="width:100%;padding:4px 8px;font-size:11px;background:var(--bg-main);border:1px solid var(--border);border-radius:4px;color:var(--text);outline:none;" onchange="bjUpdateGapAnswer(\'' + stateKey + '\',' + gi + ',' + qi + ',this.value)">';
      html += '</div>';
    });

    html += '</div>';
  });

  html += '<div style="display:flex;gap:8px;margin-top:8px;">';
  html += '<button class="btn btn-sm" onclick="bjSkipGapInterview(\'' + stateKey + '\')" style="font-size:10px;padding:3px 10px;color:var(--text-faint);">Skip</button>';
  html += '<button class="btn btn-sm" onclick="bjCompleteGapInterview(\'' + stateKey + '\')" style="font-size:10px;padding:3px 12px;background:var(--warm);color:#fff;font-weight:600;">Continue \u2192</button>';
  html += '</div>';
  html += '</div>';
  return html;
}

// Gap answer tracking
function bjUpdateGapAnswer(stateKey, gapIdx, questionIdx, value) {
  if (!window._bjRewriteState[stateKey]) window._bjRewriteState[stateKey] = {};
  if (!window._bjRewriteState[stateKey].gapAnswers) window._bjRewriteState[stateKey].gapAnswers = {};
  var key = gapIdx + '-' + questionIdx;
  window._bjRewriteState[stateKey].gapAnswers[key] = value;
}

function bjSkipGapInterview(stateKey) {
  var el = document.getElementById('gap-interview-' + stateKey);
  if (el) el.style.display = 'none';
  bjShowAcceptanceUI(stateKey);
}

function bjCompleteGapInterview(stateKey) {
  var el = document.getElementById('gap-interview-' + stateKey);
  if (el) el.style.display = 'none';
  bjShowAcceptanceUI(stateKey);
}

// G9-G12: Build the Acceptance UI
function bjShowAcceptanceUI(stateKey) {
  var el = document.getElementById('acceptance-ui-' + stateKey);
  if (el) el.style.display = '';
}

function buildAcceptanceHtml(ri, fi, filterScore) {
  if (!filterScore || !filterScore.premium) return '';
  var stateKey = ri + '-' + fi;

  // Initialize state
  if (!window._bjRewriteState[stateKey]) window._bjRewriteState[stateKey] = {};
  var state = window._bjRewriteState[stateKey];
  state.accepted = state.accepted || {};
  state.achievementInputs = state.achievementInputs || {};
  state.userHighlights = state.userHighlights || [];
  state.userNotes = state.userNotes || '';
  state.coverLetter = state.coverLetter || false;
  state.template = state.template || 'executive';

  var coaching = filterScore.coaching || {};
  var allRecs = [];
  var recIdx = 0;

  // Collect all recommendations into a flat list with IDs
  function addRecs(items, type, labelFn) {
    if (!items || !items.length) return;
    items.forEach(function(item, i) {
      var id = type + '-' + i;
      allRecs.push({ id: id, type: type, data: item, label: labelFn(item) });
      if (state.accepted[id] === undefined) state.accepted[id] = true; // default to accepted
    });
  }

  addRecs(coaching.priority_actions, 'priority', function(p) {
    return { title: p.action, subtitle: p.why, badge: p.expected_impact };
  });
  addRecs(coaching.rewrite_suggestions, 'rewrite', function(r) {
    return { title: r.suggested_text, subtitle: r.original_text ? 'Currently: ' + r.original_text : '', badge: r.rationale };
  });
  addRecs(coaching.missing_keyword_injections, 'keyword', function(k) {
    return { title: 'Add "' + k.keyword + '"', subtitle: k.where_to_add + ' \u2014 ' + k.how_to_phrase, badge: null };
  });
  addRecs(coaching.title_translations, 'title', function(t) {
    return { title: t.current_title + ' \u2192 ' + t.suggested_title, subtitle: t.reasoning, badge: null };
  });
  addRecs(coaching.achievement_prompts, 'achievement', function(a) {
    return { title: 'Quantify: "' + a.weak_bullet + '"', subtitle: null, questions: a.questions_to_quantify, badge: null };
  });
  addRecs(coaching.format_improvements, 'format', function(f) {
    return { title: typeof f === 'string' ? f : f.description || JSON.stringify(f), subtitle: null, badge: null };
  });
  addRecs(coaching.gap_bridging, 'gap', function(g) {
    return { title: g.gap, subtitle: g.bridge_strategy, badge: null };
  });

  if (allRecs.length === 0) return '';

  var acceptedCount = Object.keys(state.accepted).filter(function(k) { return state.accepted[k]; }).length;

  var html = '<div class="bj-acceptance-ui" id="acceptance-ui-' + stateKey + '" style="display:none;margin-top:12px;padding:12px;background:rgba(77,142,255,0.03);border:1px solid rgba(77,142,255,0.12);border-radius:8px;">';
  html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">';
  html += '<div style="font-size:13px;font-weight:700;color:#4d8eff;">\u2728 Rewrite Your Resume</div>';
  html += '<span style="font-size:10px;color:var(--text-faint);margin-left:auto;" id="accept-count-' + stateKey + '">' + acceptedCount + '/' + allRecs.length + ' accepted</span>';
  html += '</div>';

  html += '<div style="font-size:11px;color:var(--text-dim);margin-bottom:10px;">Accept the recommendations you want applied. Reject any you disagree with.</div>';

  // Select All / Deselect All
  html += '<div style="display:flex;gap:8px;margin-bottom:10px;">';
  html += '<button class="btn btn-sm" onclick="bjToggleAll(\'' + stateKey + '\',true)" style="font-size:9px;padding:2px 8px;">Select All</button>';
  html += '<button class="btn btn-sm" onclick="bjToggleAll(\'' + stateKey + '\',false)" style="font-size:9px;padding:2px 8px;">Deselect All</button>';
  html += '</div>';

  // Recommendation cards
  allRecs.forEach(function(rec) {
    var isAccepted = state.accepted[rec.id] !== false;
    var borderColor = isAccepted ? 'rgba(34,197,94,0.3)' : 'rgba(128,128,128,0.15)';
    var bgColor = isAccepted ? 'rgba(34,197,94,0.03)' : 'var(--bg-main)';
    var typeColors = { priority: '#4d8eff', rewrite: 'var(--green)', keyword: 'var(--warm)', title: '#7c3aed', achievement: '#f59e0b', format: 'var(--text-faint)', gap: 'var(--warm)' };
    var typeLabel = rec.type.charAt(0).toUpperCase() + rec.type.slice(1);

    html += '<div id="rec-card-' + stateKey + '-' + rec.id + '" style="margin-bottom:6px;padding:8px 10px;border-radius:6px;border:1px solid ' + borderColor + ';background:' + bgColor + ';transition:all 0.15s;">';
    html += '<div style="display:flex;align-items:flex-start;gap:8px;">';

    // Checkbox
    html += '<input type="checkbox" ' + (isAccepted ? 'checked' : '') + ' onchange="bjToggleRec(\'' + stateKey + '\',\'' + rec.id + '\',this.checked)" style="margin-top:2px;accent-color:var(--green);cursor:pointer;">';

    // Content
    html += '<div style="flex:1;min-width:0;">';
    html += '<div style="display:flex;align-items:center;gap:4px;margin-bottom:2px;">';
    html += '<span style="font-size:9px;padding:1px 4px;border-radius:2px;background:' + (typeColors[rec.type] || 'var(--text-faint)') + ';color:#fff;font-weight:600;">' + typeLabel + '</span>';
    if (rec.label.badge) html += '<span style="font-size:9px;color:var(--green);font-weight:600;">' + rec.label.badge + '</span>';
    html += '</div>';
    html += '<div style="font-size:12px;color:var(--text);line-height:1.5;">' + rec.label.title + '</div>';
    if (rec.label.subtitle) html += '<div style="font-size:10px;color:var(--text-faint);line-height:1.4;margin-top:1px;">' + rec.label.subtitle + '</div>';

    // Achievement prompt inputs (G10)
    if (rec.type === 'achievement' && rec.label.questions && isAccepted) {
      html += '<div style="margin-top:6px;padding:6px;background:rgba(245,158,11,0.05);border-radius:4px;">';
      rec.label.questions.forEach(function(q, qi) {
        var inputId = 'ach-input-' + stateKey + '-' + rec.id + '-' + qi;
        var savedVal = (state.achievementInputs[rec.id] || {})[qi] || '';
        html += '<div style="margin-bottom:3px;">';
        html += '<div style="font-size:10px;color:var(--text-dim);">' + q + '</div>';
        html += '<input type="text" id="' + inputId + '" value="' + savedVal.replace(/"/g, '&quot;') + '" placeholder="Your answer" style="width:100%;padding:3px 6px;font-size:11px;background:var(--bg-main);border:1px solid var(--border);border-radius:3px;color:var(--text);outline:none;" onchange="bjUpdateAchievement(\'' + stateKey + '\',\'' + rec.id + '\',' + qi + ',this.value)">';
        html += '</div>';
      });
      html += '</div>';
    }

    html += '</div>'; // content
    html += '</div>'; // flex row
    html += '</div>'; // card
  });

  // G11: User highlights & notes
  html += '<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);">';
  html += '<div style="font-size:11px;font-weight:600;color:var(--text-dim);margin-bottom:6px;">\ud83d\udcdd Your Additions</div>';
  html += '<div style="font-size:10px;color:var(--text-faint);margin-bottom:6px;">Anything else you want changed, emphasized, or excluded?</div>';
  html += '<textarea id="user-notes-' + stateKey + '" placeholder="E.g.: Emphasize my patent from 2024. Don\'t include freelance work from 2019. My title is officially Sr. Engineer but I\'ve been functioning as tech lead." style="width:100%;height:50px;padding:6px 8px;font-size:11px;background:var(--bg-main);border:1px solid var(--border);border-radius:4px;color:var(--text);outline:none;resize:vertical;font-family:inherit;" onchange="bjUpdateNotes(\'' + stateKey + '\',this.value)">' + (state.userNotes || '') + '</textarea>';

  // Highlight chips
  html += '<div style="margin-top:6px;">';
  html += '<div style="font-size:10px;color:var(--text-faint);margin-bottom:3px;">Specific highlights to include:</div>';
  html += '<div id="highlights-list-' + stateKey + '" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:4px;">';
  (state.userHighlights || []).forEach(function(h, hi) {
    html += '<span style="font-size:10px;padding:2px 6px;border-radius:3px;background:rgba(77,142,255,0.08);border:1px solid rgba(77,142,255,0.2);color:#4d8eff;">' + h + ' <span onclick="bjRemoveHighlight(\'' + stateKey + '\',' + hi + ')" style="cursor:pointer;opacity:0.6;">\u2717</span></span>';
  });
  html += '</div>';
  html += '<div style="display:flex;gap:4px;">';
  html += '<input type="text" id="highlight-input-' + stateKey + '" placeholder="Add a highlight" style="flex:1;padding:3px 6px;font-size:10px;background:var(--bg-main);border:1px solid var(--border);border-radius:3px;color:var(--text);outline:none;" onkeydown="if(event.key===\'Enter\')bjAddHighlight(\'' + stateKey + '\')">';
  html += '<button class="btn btn-sm" onclick="bjAddHighlight(\'' + stateKey + '\')" style="font-size:9px;padding:2px 8px;">+</button>';
  html += '</div>';
  html += '</div>';
  html += '</div>';

  // G12: Cover letter opt-in
  html += '<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);display:flex;align-items:center;gap:8px;">';
  html += '<input type="checkbox" id="cover-letter-' + stateKey + '" ' + (state.coverLetter ? 'checked' : '') + ' onchange="bjToggleCoverLetter(\'' + stateKey + '\',this.checked)" style="accent-color:#4d8eff;cursor:pointer;">';
  html += '<label for="cover-letter-' + stateKey + '" style="font-size:11px;color:var(--text);cursor:pointer;">Include a tailored cover letter</label>';
  html += '</div>';

  // Template selection
  html += '<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);">';
  html += '<div style="font-size:11px;font-weight:600;color:var(--text-dim);margin-bottom:6px;">Resume Template</div>';
  html += '<div style="display:flex;gap:6px;">';
  var templates = [
    { id: 'executive', name: 'Executive', desc: 'Clean, minimal', best: 'Senior roles' },
    { id: 'modern', name: 'Modern', desc: 'Two-column sidebar', best: 'Tech, creative' },
    { id: 'classic', name: 'Classic', desc: 'Traditional', best: 'Finance, legal' }
  ];
  templates.forEach(function(t) {
    var sel = (state.template || 'executive') === t.id;
    var border = sel ? '2px solid #4d8eff' : '1px solid var(--border)';
    var bg = sel ? 'rgba(77,142,255,0.05)' : 'var(--bg-main)';
    html += '<div onclick="bjSelectTemplate(\'' + stateKey + '\',\'' + t.id + '\')" style="flex:1;padding:8px;border-radius:6px;border:' + border + ';background:' + bg + ';cursor:pointer;text-align:center;">';
    html += '<div style="font-size:11px;font-weight:600;color:' + (sel ? '#4d8eff' : 'var(--text)') + ';">' + t.name + '</div>';
    html += '<div style="font-size:9px;color:var(--text-faint);">' + t.desc + '</div>';
    html += '<div style="font-size:8px;color:var(--text-faint);margin-top:2px;">Best for: ' + t.best + '</div>';
    html += '</div>';
  });
  html += '</div></div>';

  // Generate Rewrite button
  html += '<div style="margin-top:12px;text-align:center;">';
  html += '<button class="btn" id="gen-rewrite-' + stateKey + '" onclick="bjGenerateRewrite(\'' + stateKey + '\',' + ri + ',' + fi + ')" style="background:linear-gradient(135deg,#4d8eff,#7c3aed);color:#fff;font-weight:700;padding:8px 24px;font-size:12px;border-radius:6px;width:100%;">';
  html += '\u2728 Generate Rewrite</button>';
  html += '<div style="font-size:9px;color:var(--text-faint);margin-top:4px;">This will use premium credits</div>';
  html += '</div>';

  html += '</div>'; // close acceptance-ui
  return html;
}

// ─── Acceptance UI interaction handlers ───

function bjToggleRec(stateKey, recId, checked) {
  if (!window._bjRewriteState[stateKey]) window._bjRewriteState[stateKey] = {};
  if (!window._bjRewriteState[stateKey].accepted) window._bjRewriteState[stateKey].accepted = {};
  window._bjRewriteState[stateKey].accepted[recId] = checked;

  // Update card visual
  var card = document.getElementById('rec-card-' + stateKey + '-' + recId);
  if (card) {
    card.style.borderColor = checked ? 'rgba(34,197,94,0.3)' : 'rgba(128,128,128,0.15)';
    card.style.background = checked ? 'rgba(34,197,94,0.03)' : 'var(--bg-main)';
  }

  // Update count
  bjUpdateAcceptCount(stateKey);
}

function bjToggleAll(stateKey, accept) {
  var state = window._bjRewriteState[stateKey];
  if (!state || !state.accepted) return;
  Object.keys(state.accepted).forEach(function(k) {
    state.accepted[k] = accept;
    var card = document.getElementById('rec-card-' + stateKey + '-' + k);
    if (card) {
      card.style.borderColor = accept ? 'rgba(34,197,94,0.3)' : 'rgba(128,128,128,0.15)';
      card.style.background = accept ? 'rgba(34,197,94,0.03)' : 'var(--bg-main)';
      var cb = card.querySelector('input[type=checkbox]');
      if (cb) cb.checked = accept;
    }
  });
  bjUpdateAcceptCount(stateKey);
}

function bjUpdateAcceptCount(stateKey) {
  var state = window._bjRewriteState[stateKey];
  if (!state || !state.accepted) return;
  var total = Object.keys(state.accepted).length;
  var accepted = Object.keys(state.accepted).filter(function(k) { return state.accepted[k]; }).length;
  var el = document.getElementById('accept-count-' + stateKey);
  if (el) el.textContent = accepted + '/' + total + ' accepted';
}

function bjUpdateAchievement(stateKey, recId, qi, value) {
  var state = window._bjRewriteState[stateKey];
  if (!state) return;
  if (!state.achievementInputs) state.achievementInputs = {};
  if (!state.achievementInputs[recId]) state.achievementInputs[recId] = {};
  state.achievementInputs[recId][qi] = value;
}

function bjUpdateNotes(stateKey, value) {
  if (!window._bjRewriteState[stateKey]) window._bjRewriteState[stateKey] = {};
  window._bjRewriteState[stateKey].userNotes = value;
}

function bjAddHighlight(stateKey) {
  var input = document.getElementById('highlight-input-' + stateKey);
  if (!input || !input.value.trim()) return;
  var state = window._bjRewriteState[stateKey];
  if (!state) return;
  if (!state.userHighlights) state.userHighlights = [];
  state.userHighlights.push(input.value.trim());
  input.value = '';
  // Re-render highlights list
  var list = document.getElementById('highlights-list-' + stateKey);
  if (list) {
    var html = '';
    state.userHighlights.forEach(function(h, hi) {
      html += '<span style="font-size:10px;padding:2px 6px;border-radius:3px;background:rgba(77,142,255,0.08);border:1px solid rgba(77,142,255,0.2);color:#4d8eff;">' + h + ' <span onclick="bjRemoveHighlight(\'' + stateKey + '\',' + hi + ')" style="cursor:pointer;opacity:0.6;">\u2717</span></span>';
    });
    list.innerHTML = html;
  }
}

function bjRemoveHighlight(stateKey, idx) {
  var state = window._bjRewriteState[stateKey];
  if (!state || !state.userHighlights) return;
  state.userHighlights.splice(idx, 1);
  bjAddHighlight(stateKey); // Trick: re-render by calling with empty (input already cleared)
  // Actually just re-render the list
  var list = document.getElementById('highlights-list-' + stateKey);
  if (list) {
    var html = '';
    state.userHighlights.forEach(function(h, hi) {
      html += '<span style="font-size:10px;padding:2px 6px;border-radius:3px;background:rgba(77,142,255,0.08);border:1px solid rgba(77,142,255,0.2);color:#4d8eff;">' + h + ' <span onclick="bjRemoveHighlight(\'' + stateKey + '\',' + hi + ')" style="cursor:pointer;opacity:0.6;">\u2717</span></span>';
    });
    list.innerHTML = html;
  }
}

function bjToggleCoverLetter(stateKey, checked) {
  if (!window._bjRewriteState[stateKey]) window._bjRewriteState[stateKey] = {};
  window._bjRewriteState[stateKey].coverLetter = checked;
}

function bjSelectTemplate(stateKey, templateId) {
  if (!window._bjRewriteState[stateKey]) window._bjRewriteState[stateKey] = {};
  window._bjRewriteState[stateKey].template = templateId;
  // Re-render template cards to show selection
  var parent = document.getElementById('acceptance-ui-' + stateKey);
  if (!parent) return;
  var cards = parent.querySelectorAll('[onclick^="bjSelectTemplate"]');
  cards.forEach(function(card) {
    var isThis = card.getAttribute('onclick').includes("'" + templateId + "'");
    card.style.border = isThis ? '2px solid #4d8eff' : '1px solid var(--border)';
    card.style.background = isThis ? 'rgba(77,142,255,0.05)' : 'var(--bg-main)';
    var nameEl = card.querySelector('div');
    if (nameEl) nameEl.style.color = isThis ? '#4d8eff' : 'var(--text)';
  });
}

// G-S3: Call rewrite-resume Edge Function and handle download
async function bjGenerateRewrite(stateKey, ri, fi) {
  var state = window._bjRewriteState[stateKey];
  if (!state) return;

  var btn = document.getElementById('gen-rewrite-' + stateKey);
  if (btn) { btn.disabled = true; btn.textContent = 'Writing resume\u2026'; btn.style.opacity = '0.6'; }

  // Get the filter score data
  var filterNames = Object.keys(scores[ri]?.filters || {});
  var filterScore = scores[ri]?.filters[filterNames[fi]];
  if (!filterScore || !filterScore.premium) {
    if (btn) { btn.textContent = 'Error: No premium analysis found'; btn.style.background = 'var(--red)'; }
    return;
  }

  // Collect accepted recommendations with their full data
  var acceptedRecs = [];
  Object.keys(state.accepted || {}).forEach(function(k) {
    if (!state.accepted[k]) return;
    acceptedRecs.push({
      id: k,
      type: k.split('-')[0],
      user_input: (state.achievementInputs || {})[k] || null
    });
  });

  // Get resume data
  var r = resumes[ri];
  if (!r) { if (btn) { btn.textContent = 'Error: Resume not found'; } return; }

  try {
    var session = await sb.auth.getSession();
    if (!session.data.session) { if (btn) { btn.textContent = 'Not logged in'; } return; }

    if (btn) btn.textContent = 'Writing resume\u2026';

    var res = await fetch(SUPABASE_URL + '/functions/v1/rewrite-resume', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + session.data.session.access_token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        resume_text: r.extractedText || '',
        resume_profile: filterScore.resumeProfile,
        jd_profile: filterScore.jdProfile,
        accepted_recommendations: acceptedRecs,
        achievement_inputs: state.achievementInputs || {},
        gap_answers: state.gapAnswers || {},
        user_highlights: state.userHighlights || [],
        user_notes: state.userNotes || '',
        include_cover_letter: state.coverLetter || false,
        template_id: state.template || 'executive',
        filter_name: filterNames[fi] || 'General',
        coaching: filterScore.coaching
      })
    });

    if (!res.ok) {
      var errData = await res.json().catch(function() { return { error: 'Unknown error' }; });
      console.error('[BJ] Rewrite error:', errData);
      if (btn) { btn.textContent = 'Rewrite failed — try again'; btn.disabled = false; btn.style.opacity = '1'; btn.style.background = 'var(--red)'; }
      return;
    }

    var data = await res.json();
    console.log('[BJ] Rewrite complete:', data.session_id, data.timing);

    // Store the rewrite result
    state.rewriteResult = data;

    // Show results panel
    bjShowRewriteResults(stateKey, ri, fi, data);

  } catch (e) {
    reportError('keywords', e);
    console.error('[BJ] Rewrite exception:', e);
    if (btn) { btn.textContent = 'Error — try again'; btn.disabled = false; btn.style.opacity = '1'; btn.style.background = 'var(--red)'; }
  }
}

// Show rewrite results with download links
function bjShowRewriteResults(stateKey, ri, fi, data) {
  var btn = document.getElementById('gen-rewrite-' + stateKey);
  var container = document.getElementById('acceptance-ui-' + stateKey);
  if (!container) return;

  // G23: Auto-add rewritten resume to library
  var filterNames = Object.keys(scores[ri]?.filters || {});
  var fname = filterNames[fi] || 'General';
  var originalResume = resumes[ri];
  if (originalResume && data.resume_sections) {
    var roundNum = data.round_number || 1;
    var newName = (originalResume.name || 'Resume') + ' \u2014 ' + fname + ' v' + roundNum;
    var extractedText = '';
    (data.resume_sections || []).forEach(function(sec) {
      (sec.items || []).forEach(function(item) {
        if (item.content) {
          if (item.content.text) extractedText += item.content.text + ' ';
          if (item.content.bullets) extractedText += item.content.bullets.join(' ') + ' ';
          if (item.content.skills) extractedText += item.content.skills.join(' ') + ' ';
        }
      });
    });
    resumes.push({
      name: newName, source: 'rewrite', rewrite_session_id: data.session_id,
      rewrite_round: roundNum, filterIds: [fname], levelLabel: originalResume.levelLabel || '',
      extractedText: extractedText.trim(), textStatus: 'ready', tier: 'premium',
      tier_history: [
        { action: 'analyzed', tier: 'premium', timestamp: new Date().toISOString() },
        { action: 'rewritten', tier: 'premium', round: roundNum, timestamp: new Date().toISOString() }
      ],
      storagePath: data.resume_path, size: 0, lastModified: Date.now(), archived: false
    });
    if (typeof saveResumes === 'function') saveResumes();
    console.log('[BJ] Auto-saved rewritten resume:', newName);
  }

  // G24: Save cover letter to database
  if (data.cover_letter && data.cover_letter_path) {
    bjSaveCoverLetter(data, fname);
  }

  var html = '<div style="margin-top:12px;padding:12px;background:rgba(34,197,94,0.04);border:1px solid rgba(34,197,94,0.15);border-radius:8px;">';
  html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">';
  html += '<div style="font-size:13px;font-weight:700;color:var(--green);">\u2705 Rewrite Complete</div>';
  html += '<span style="font-size:9px;padding:2px 6px;border-radius:3px;background:linear-gradient(135deg,#4d8eff,#7c3aed);color:#fff;font-weight:600;">\u2728 Premium</span>';
  html += '</div>';

  if (data.resume_path) {
    var resumeUrl = SUPABASE_URL + '/storage/v1/object/public/' + data.resume_path;
    html += '<a href="' + resumeUrl + '" download="resume.docx" style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;background:#4d8eff;color:#fff;border-radius:6px;font-size:12px;font-weight:600;text-decoration:none;margin-bottom:6px;margin-right:8px;">\ud83d\udcc4 Download Resume</a>';
  }
  if (data.cover_letter_path) {
    var coverUrl = SUPABASE_URL + '/storage/v1/object/public/' + data.cover_letter_path;
    html += '<a href="' + coverUrl + '" download="cover-letter.docx" style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;background:#7c3aed;color:#fff;border-radius:6px;font-size:12px;font-weight:600;text-decoration:none;margin-bottom:6px;">\ud83d\udcc4 Cover Letter</a>';
  }

  html += '<div style="font-size:10px;color:var(--green);margin:6px 0;">\u2713 Resume auto-saved to library and assigned to "' + escapeHtml(fname) + '"</div>';
  html += '<div style="margin-top:6px;font-size:11px;color:var(--text-dim);"><strong>Template:</strong> ' + (data.template_used || 'executive') + ' \u00b7 <strong>Changes:</strong> ' + (data.changes_made || []).length + ' \u00b7 <strong>Time:</strong> ' + ((data.timing?.total_ms || 0) / 1000).toFixed(1) + 's (' + (data.agents_used || 1) + ' agents)</div>';

  if (data.qa_report) {
    html += '<div style="margin-top:10px;padding:8px;background:var(--bg-main);border:1px solid var(--border);border-radius:6px;">';
    html += '<div style="font-size:11px;font-weight:600;color:var(--text-dim);margin-bottom:6px;">\ud83d\udd0d QA Review</div>';
    var acc = data.qa_report.accuracy;
    if (acc) {
      html += '<div style="font-size:11px;color:' + (acc.clean ? 'var(--green)' : 'var(--warm)') + ';">' + (acc.clean ? '\u2713' : '\u26a0') + ' Accuracy: ' + (acc.clean ? 'Clean' : acc.flag_count + ' issue(s)') + '</div>';
      if (!acc.clean && acc.flags) acc.flags.forEach(function(f) { html += '<div style="font-size:10px;color:' + (f.severity==='critical'?'var(--red)':'var(--warm)') + ';padding-left:14px;">\u2022 ' + f.issue + '</div>'; });
    }
    var bl = data.qa_report.bleed;
    if (bl) html += '<div style="font-size:11px;color:' + (bl.clean?'var(--green)':'var(--warm)') + ';">' + (bl.clean?'\u2713':'\u26a0') + ' Consistency: ' + (bl.clean?'Clean':bl.flag_count+' issue(s)') + '</div>';
    var vo = data.qa_report.voice;
    if (vo) html += '<div style="font-size:11px;color:var(--green);">\u2713 Polish: ' + (vo.auto_fixes_applied||0) + ' AI-speak fixes</div>';
    var li = data.qa_report.linkedin || data.linkedin_alignment;
    if (li) {
      html += '<div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--border);">';
      html += '<div style="font-size:11px;color:' + (li.aligned?'var(--green)':'var(--warm)') + ';">' + (li.aligned?'\u2713':'\u26a0') + ' LinkedIn: ' + (li.aligned?'Aligned':li.discrepancy_count+' discrepancy(s)') + '</div>';
      if (!li.aligned && li.discrepancies) li.discrepancies.forEach(function(d) {
        html += '<div style="font-size:10px;color:' + (d.severity==='critical'?'var(--red)':'var(--warm)') + ';padding-left:14px;">\u2022 ' + d.field + ': "' + (d.resume_value||'') + '" vs "' + (d.linkedin_value||'') + '"</div>';
      });
      html += '</div>';
    }
    html += '</div>';
  }

  if (data.cover_letter) {
    html += '<details style="margin-top:10px;"><summary style="font-size:11px;font-weight:600;color:var(--text-faint);cursor:pointer;">Cover Letter Preview (' + (data.cover_letter.word_count||'?') + ' words) <span id="cl-ai-badge-inline" style="font-size:9px;font-weight:600;padding:2px 6px;border-radius:4px;background:rgba(148,163,184,0.1);color:#94a3b8;border:1px solid rgba(148,163,184,0.15);">\ud83d\udd04 Scoring\u2026</span></summary>';
    html += '<div style="padding:8px;background:var(--bg-main);border:1px solid var(--border);border-radius:0 0 6px 6px;">';
    html += '<div style="font-size:11px;color:var(--text-dim);font-style:italic;">' + (escapeHtml(data.cover_letter.salutation||'')) + '</div>';
    (data.cover_letter.paragraphs||[]).forEach(function(p) { html += '<div style="font-size:11px;color:var(--text-dim);margin-top:6px;line-height:1.5;">' + escapeHtml(p) + '</div>'; });
    html += '<div style="font-size:11px;color:var(--text-dim);margin-top:8px;">' + (escapeHtml(data.cover_letter.closing||'')) + '</div>';
    html += '</div></details>';
  }

  // G31: Feedback button
  html += '<div style="margin-top:12px;text-align:center;">';
  html += '<button class="btn btn-sm" onclick="bjShowFeedbackUI(\'' + stateKey + '\')" style="font-size:11px;padding:6px 16px;border:1px solid var(--border);">\u2b50 Rate & Request Revision</button>';
  html += '</div>';

  // Feedback UI container (hidden initially)
  html += '<div id="feedback-ui-' + stateKey + '" style="display:none;"></div>';

  html += '</div>';
  if (btn) btn.style.display = 'none';
  var resultsDiv = document.createElement('div');
  resultsDiv.innerHTML = html;
  container.appendChild(resultsDiv);
  if (typeof renderResumeCards === 'function') setTimeout(function() { renderResumeCards(); }, 500);
}

// ════════════════════════════════════════════════════════════
// FEEDBACK + ITERATION (G31–G36)
// ════════════════════════════════════════════════════════════

function bjShowFeedbackUI(stateKey) {
  var el = document.getElementById('feedback-ui-' + stateKey);
  if (!el) return;

  var state = window._bjRewriteState[stateKey] || {};
  var fb = state.feedback || { overall: 0, accuracy: 0, relevance: 0, voice: 0, formatting: 0, text: '' };

  var html = '<div style="margin-top:10px;padding:12px;background:rgba(245,158,11,0.04);border:1px solid rgba(245,158,11,0.15);border-radius:8px;">';
  html += '<div style="font-size:12px;font-weight:700;color:var(--warm);margin-bottom:8px;">How did we do?</div>';

  // Star ratings for 5 dimensions
  var dims = [
    { key: 'overall', label: 'Overall quality' },
    { key: 'accuracy', label: 'Accuracy' },
    { key: 'relevance', label: 'Relevance' },
    { key: 'voice', label: 'Voice & tone' },
    { key: 'formatting', label: 'Formatting' }
  ];

  dims.forEach(function(dim) {
    html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">';
    html += '<span style="font-size:11px;color:var(--text-dim);width:90px;">' + dim.label + '</span>';
    for (var s = 1; s <= 5; s++) {
      var filled = s <= (fb[dim.key] || 0);
      html += '<span onclick="bjSetRating(\'' + stateKey + '\',\'' + dim.key + '\',' + s + ')" style="cursor:pointer;font-size:16px;color:' + (filled ? '#f59e0b' : 'var(--border)') + ';" id="star-' + stateKey + '-' + dim.key + '-' + s + '">\u2605</span>';
    }
    html += '<span style="font-size:10px;color:var(--text-faint);" id="star-val-' + stateKey + '-' + dim.key + '">' + (fb[dim.key] || '-') + '/5</span>';
    html += '</div>';
  });

  // Qualitative feedback
  html += '<div style="margin-top:8px;">';
  html += '<div style="font-size:11px;color:var(--text-dim);margin-bottom:3px;">What would you change?</div>';
  html += '<textarea id="feedback-text-' + stateKey + '" placeholder="E.g.: The skills section feels too generic. I want more emphasis on my AWS work. The second bullet under Company B sounds robotic." style="width:100%;height:60px;padding:6px 8px;font-size:11px;background:var(--bg-main);border:1px solid var(--border);border-radius:4px;color:var(--text);outline:none;resize:vertical;font-family:inherit;">' + (fb.text || '') + '</textarea>';
  html += '</div>';

  html += '<div style="display:flex;gap:8px;margin-top:10px;">';
  html += '<button class="btn btn-sm" onclick="bjSubmitFeedback(\'' + stateKey + '\')" style="font-size:11px;padding:6px 16px;background:var(--warm);color:#fff;font-weight:600;">Submit Feedback</button>';
  html += '<button class="btn btn-sm" onclick="document.getElementById(\'feedback-ui-' + stateKey + '\').style.display=\'none\'" style="font-size:11px;padding:6px 12px;color:var(--text-faint);">Cancel</button>';
  html += '</div>';

  html += '</div>';
  el.innerHTML = html;
  el.style.display = '';
}

function bjSetRating(stateKey, dim, value) {
  var state = window._bjRewriteState[stateKey] || {};
  if (!state.feedback) state.feedback = {};
  state.feedback[dim] = value;
  window._bjRewriteState[stateKey] = state;

  // Update stars visual
  for (var s = 1; s <= 5; s++) {
    var star = document.getElementById('star-' + stateKey + '-' + dim + '-' + s);
    if (star) star.style.color = s <= value ? '#f59e0b' : 'var(--border)';
  }
  var valEl = document.getElementById('star-val-' + stateKey + '-' + dim);
  if (valEl) valEl.textContent = value + '/5';
}

async function bjSubmitFeedback(stateKey) {
  var state = window._bjRewriteState[stateKey] || {};
  var textEl = document.getElementById('feedback-text-' + stateKey);
  if (textEl) state.feedback.text = textEl.value;

  if (!state.feedback.overall) {
    alert('Please rate overall quality before submitting.');
    return;
  }

  // Save feedback to database
  if (state.rewriteResult && state.rewriteResult.session_id) {
    try {
      var session = await sb.auth.getSession();
      if (session.data.session) {
        var SRK = session.data.session.access_token;
        var { error: fbErr } = await sb.from('rewrite_rounds')
          .update({
            rating_overall: state.feedback.overall,
            rating_accuracy: state.feedback.accuracy,
            rating_relevance: state.feedback.relevance,
            rating_voice: state.feedback.voice,
            rating_formatting: state.feedback.formatting,
            feedback_text: state.feedback.text
          })
          .eq('session_id', state.rewriteResult.session_id)
          .eq('round_number', state.rewriteResult.round_number || 1);
        if (fbErr) reportError('keywords:rewrite-feedback', fbErr);
      }
    } catch(e) { reportError('keywords', e); console.error('[BJ] Feedback save error:', e); }
  }

  // G33: Call Revision Assessor
  var feedbackEl = document.getElementById('feedback-ui-' + stateKey);
  if (feedbackEl) feedbackEl.innerHTML = '<div style="padding:12px;text-align:center;font-size:11px;color:var(--text-faint);">Analyzing your feedback\u2026</div>';

  try {
    var assessSession = await sb.auth.getSession();
    if (!assessSession.data.session) return;

    var assessRes = await fetch(SUPABASE_URL + '/functions/v1/score-resume', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + assessSession.data.session.access_token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        mode: 'revision-assess',
        resume_sections: state.rewriteResult?.resume_sections,
        feedback: state.feedback
      })
    });

    var assessment = null;
    if (assessRes.ok) {
      var assessData = await assessRes.json();
      assessment = assessData;
    }

    // Show assessment
    bjShowRevisionAssessment(stateKey, state.feedback, assessment);

  } catch (e) {
    reportError('keywords', e);
    console.error('[BJ] Revision assessment error:', e);
    bjShowRevisionAssessment(stateKey, state.feedback, null);
  }
}

function bjShowRevisionAssessment(stateKey, feedback, assessment) {
  var feedbackEl = document.getElementById('feedback-ui-' + stateKey);
  if (!feedbackEl) return;

  var html = '<div style="margin-top:10px;padding:12px;background:rgba(77,142,255,0.04);border:1px solid rgba(77,142,255,0.15);border-radius:8px;">';
  html += '<div style="font-size:12px;font-weight:700;color:#4d8eff;margin-bottom:6px;">\ud83d\udcca Revision Assessment</div>';

  html += '<div style="font-size:11px;color:var(--text-dim);margin-bottom:3px;">Your ratings: ';
  ['overall','accuracy','relevance','voice','formatting'].forEach(function(d) {
    if (feedback[d]) html += d + ': ' + feedback[d] + '/5  ';
  });
  html += '</div>';

  if (assessment && assessment.revision_recommended !== undefined) {
    var confColor = assessment.confidence === 'high' ? 'var(--green)' : assessment.confidence === 'medium' ? 'var(--warm)' : 'var(--text-faint)';
    html += '<div style="margin-top:8px;padding:8px;background:var(--bg-main);border-radius:6px;">';
    html += '<div style="font-size:12px;font-weight:600;color:' + (assessment.revision_recommended ? 'var(--green)' : 'var(--text-faint)') + ';">';
    html += assessment.revision_recommended ? '\u2713 A revision is likely to improve your resume' : '\u2014 A revision may not meaningfully improve the result';
    html += '</div>';
    html += '<div style="font-size:10px;color:' + confColor + ';margin-top:2px;">Confidence: ' + (assessment.confidence || 'unknown') + '</div>';
    if (assessment.confidence_reason) html += '<div style="font-size:10px;color:var(--text-faint);margin-top:2px;">' + assessment.confidence_reason + '</div>';
    if (assessment.suggestion_to_user) html += '<div style="font-size:10px;color:var(--warm);margin-top:4px;">\ud83d\udca1 ' + assessment.suggestion_to_user + '</div>';
    if (assessment.estimated_improvements) {
      html += '<div style="margin-top:6px;">';
      assessment.estimated_improvements.forEach(function(imp) {
        html += '<div style="font-size:10px;color:var(--text-dim);">' + imp.area + ': ' + imp.current_rating + '/5 \u2192 ~' + imp.estimated_after + '/5</div>';
      });
      html += '</div>';
    }
    html += '</div>';
  }

  html += '<div style="display:flex;gap:8px;margin-top:10px;">';
  html += '<button class="btn btn-sm" onclick="bjRequestRevision(\'' + stateKey + '\')" style="font-size:11px;padding:6px 16px;background:linear-gradient(135deg,#4d8eff,#7c3aed);color:#fff;font-weight:600;">\u2728 Request Revision</button>';
  html += '<button class="btn btn-sm" onclick="document.getElementById(\'feedback-ui-' + stateKey + '\').innerHTML=\'<div style=padding:8px;font-size:11px;color:var(--green);text-align:center>\u2713 Feedback saved. Thanks!</div>\'" style="font-size:11px;padding:6px 12px;color:var(--text-faint);">I\'m satisfied</button>';
  html += '</div>';
  html += '</div>';

  feedbackEl.innerHTML = html;
}

// G34: Revision loop — re-runs rewrite pipeline with feedback
async function bjRequestRevision(stateKey) {
  var state = window._bjRewriteState[stateKey] || {};
  if (!state.rewriteResult) return;

  // Update feedback context for the next round
  state.previousFeedback = {
    ratings: state.feedback,
    previous_sections: state.rewriteResult.resume_sections,
    round_number: (state.rewriteResult.round_number || 1) + 1
  };

  // Re-trigger the rewrite with feedback context injected
  var parts = stateKey.split('-');
  var ri = parseInt(parts[0]);
  var fi = parseInt(parts[1]);

  var btn = document.getElementById('feedback-ui-' + stateKey);
  if (btn) btn.innerHTML = '<div style="padding:12px;text-align:center;font-size:11px;color:var(--warm);">Generating revision\u2026 This may take 30-60 seconds.</div>';

  var filterNames = Object.keys(scores[ri]?.filters || {});
  var filterScore = scores[ri]?.filters[filterNames[fi]];
  if (!filterScore) return;

  var acceptedRecs = [];
  Object.keys(state.accepted || {}).forEach(function(k) {
    if (state.accepted[k]) acceptedRecs.push({ id: k, type: k.split('-')[0], user_input: (state.achievementInputs||{})[k] || null });
  });

  var r = resumes[ri];
  try {
    var session = await sb.auth.getSession();
    if (!session.data.session) return;

    var res = await fetch(SUPABASE_URL + '/functions/v1/rewrite-resume', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + session.data.session.access_token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        resume_text: r?.extractedText || '',
        resume_profile: filterScore.resumeProfile,
        jd_profile: filterScore.jdProfile,
        accepted_recommendations: acceptedRecs,
        achievement_inputs: state.achievementInputs || {},
        gap_answers: state.gapAnswers || {},
        user_highlights: state.userHighlights || [],
        user_notes: state.userNotes || '',
        include_cover_letter: state.coverLetter || false,
        template_id: state.template || 'executive',
        filter_name: filterNames[fi] || 'General',
        coaching: filterScore.coaching,
        previous_feedback: state.previousFeedback,
        round_number: (state.rewriteResult.round_number || 1) + 1
      })
    });

    if (!res.ok) {
      if (btn) btn.innerHTML = '<div style="padding:8px;font-size:11px;color:var(--red);">Revision failed. Try again.</div>';
      return;
    }

    var data = await res.json();
    state.rewriteResult = data;

    // Clear old results and show new ones
    var container = document.getElementById('acceptance-ui-' + stateKey);
    if (container) {
      var oldResults = container.querySelectorAll('div[style*="rgba(34,197,94"]');
      oldResults.forEach(function(el) { el.remove(); });
    }
    bjShowRewriteResults(stateKey, ri, fi, data);

  } catch (e) {
    reportError('keywords', e);
    console.error('[BJ] Revision error:', e);
    if (btn) btn.innerHTML = '<div style="padding:8px;font-size:11px;color:var(--red);">Error: ' + escapeHtml(e.message) + '</div>';
  }
}

async function bjInitRewriteFlow(ri, fi, filterScore) {
  var stateKey = ri + '-' + fi;

  // Only for premium results with coaching
  if (!filterScore || !filterScore.premium || !filterScore.coaching) return;

  // Check if gap interview container exists
  var gapContainer = document.getElementById('gap-interview-container-' + stateKey);
  if (!gapContainer) return;

  // Fetch gap interview questions
  if (filterScore.gapAnalysis && filterScore.gapAnalysis.length > 0) {
    gapContainer.innerHTML = '<div style="font-size:10px;color:var(--text-faint);padding:8px;">Loading gap questions\u2026</div>';
    var gapQuestions = await fetchGapInterview(filterScore.gapAnalysis, filterScore.resumeProfile);
    if (gapQuestions && gapQuestions.length > 0) {
      gapContainer.innerHTML = buildGapInterviewHtml(ri, fi, gapQuestions);
      window._bjRewriteState[stateKey] = window._bjRewriteState[stateKey] || {};
      window._bjRewriteState[stateKey].gapQuestions = gapQuestions;
    } else {
      gapContainer.innerHTML = '';
      bjShowAcceptanceUI(stateKey);
    }
  } else {
    gapContainer.innerHTML = '';
    bjShowAcceptanceUI(stateKey);
  }
}

// Update readiness side panels after analysis completes
function updateReadinessSidePanels(scores) {
  if (!scores) return;
  var indices = Object.keys(scores);
  for (var si = 0; si < indices.length; si++) {
    var ri = indices[si];
    // Legacy: readiness-side-{ri} inside old layout
    var existing = document.getElementById('readiness-side-' + ri);
    if (existing) {
      var tmp = document.createElement('div');
      tmp.innerHTML = buildReadinessSide(ri, scores[ri]);
      existing.replaceWith(tmp.firstChild);
    }

    // New row layout: ai-panel-content-{ri}
    var panelContent = document.getElementById('ai-panel-content-' + ri);
    if (panelContent) {
      panelContent.innerHTML = buildReadinessSide(ri, scores[ri]);
    }

    // Update inline score badge on new-resume-item row
    var nriEl = document.getElementById('nri-' + ri);
    if (nriEl && scores[ri]) {
      var scoreBadge = nriEl.querySelector('.nri-score');
      if (scoreBadge) {
        var s = scores[ri].overallScore;
        scoreBadge.className = 'nri-score ' + (s >= 70 ? 'high' : s >= 40 ? 'mid' : 'low');
        scoreBadge.textContent = s + '%';
      }
    }

    // Initialize gap interview + acceptance UI for premium results
    var data = scores[ri];
    if (data && data.filters) {
      var filterNames = Object.keys(data.filters);
      for (var fi = 0; fi < filterNames.length; fi++) {
        var fs = data.filters[filterNames[fi]];
        if (fs && fs.premium && fs.coaching) {
          bjInitRewriteFlow(ri, fi, fs);
        }
      }
    }
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
      html += '<span style="font-size:12px;font-weight:600;color:var(--text);">' + escapeHtml(fname) + '</span>';
      html += '<span style="font-size:10px;color:var(--text-faint);">' + fs.matched + '/' + fs.total + ' terms \u00b7 ' + fs.jdsAnalyzed + ' JDs</span>';
      html += '<span onclick="document.getElementById(\'' + detailId + '\').style.display=document.getElementById(\'' + detailId + '\').style.display===\'none\'?\'\':\'none\';this.textContent=document.getElementById(\'' + detailId + '\').style.display===\'none\'?\'Show keywords \u25b8\':\'Hide keywords \u25be\'" style="font-size:10px;color:var(--accent);cursor:pointer;margin-left:auto;font-weight:500;">Show keywords \u25b8</span>';
      html += '</div>';

      // ATS-003: Match rate progress bar
      if (fs.total > 0) {
        var matchPct = Math.round((fs.matched / fs.total) * 100);
        var barColor = matchPct >= 75 ? 'var(--green)' : matchPct >= 50 ? 'var(--warm)' : 'var(--red)';
        html += '<div class="sg-match-rate" style="margin-bottom:8px;">';
        html += '<div class="sg-match-rate-track"><div class="sg-match-rate-fill" style="width:' + matchPct + '%;background:' + barColor + ';"></div></div>';
        html += '</div>';
      }

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
  var sf = safeReadLS('bj_saved_filters', []);
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
      if (btn) { btn.disabled = false; btn.textContent = 'Score All'; }

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
    // Log click signal (fire-and-forget)
    if (typeof sb !== 'undefined' && sb.auth) {
      Promise.resolve(sb.rpc('log_feed_signal', { p_greenhouse_id: link.dataset.jobid, p_signal_type: 'click' })).catch(e => reportError('keywords:signal-click', e));
    }
  }
  // "→" click in preview snippet opens modal
  const more = e.target.closest('.preview-more');
  if (more && more.dataset.jobid) {
    e.preventDefault();
    openJobModal(more.dataset.jobid);
  }
});

// Global preview toggle — shows/hides JD snippets on cards
function initPreviewToggle() {
  const toggle = $('#preview-toggle');
  if (!toggle) return;

  // Restore saved preference
  if (localStorage.getItem('bj_show_previews') === '1') {
    toggle.checked = true;
  }

  toggle.addEventListener('change', () => {
    localStorage.setItem('bj_show_previews', toggle.checked ? '1' : '0');
    // PostHog
    if (typeof posthog !== 'undefined') posthog.capture('feed_preview_jd_toggle', { enabled: toggle.checked });
    // Re-render feed with/without snippets
    if (typeof searchJobs === 'function') {
      searchJobs(typeof _currentFeedPage !== 'undefined' ? _currentFeedPage : 0);
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
  const snippetEls = document.querySelectorAll('.job-snippet-text[data-preview-id], .jc-snippet[data-preview-id]');
  if (!snippetEls.length) return;

  for (const el of snippetEls) {
    const jobId = el.dataset.previewId;
    if (el.dataset.loaded === '1') continue; // Already loaded

    const job = allJobs.find(j => j.greenhouse_id === jobId);
    let content = job?.content || null;

    if (content) {
      // Already cached — render immediately
      const snippet = extractSnippet(content, 300);
      el.textContent = snippet;
      const arrow = document.createElement('span');
      arrow.className = 'preview-more';
      arrow.dataset.jobid = jobId;
      arrow.textContent = ' →';
      el.appendChild(arrow);
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
              enrichJob(jobId, { content });

              // Extract salary while we have it
              if (job && !job.salary_min) {
                const salary = parseSalaryFromContent(content);
                if (salary) {
                  job.salary_min = salary.min;
                  job.salary_max = salary.max;
                  job.salary_currency = salary.currency || 'USD'; job.salary_rate = salary.rate || 'yr';
                  enrichJob(jobId, { salary: { min: salary.min, max: salary.max, raw: salary.raw, currency: salary.currency || 'USD', rate: salary.rate || 'yr' } });
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
        el.textContent = snippet;
        const arrow = document.createElement('span');
        arrow.className = 'preview-more';
        arrow.dataset.jobid = jobId;
        arrow.textContent = ' →';
        el.appendChild(arrow);
        // Content just arrived — compute match score for this job
        computeVisibleJobScores();
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
// Check if job content is a sentinel indicating the ATS listing was removed (404/410)
function isContentUnavailable(content) {
  return content === '<!-- unavailable -->';
}

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
  // A10: Sanitize decoded HTML via DOMPurify to prevent XSS from ATS-sourced content
  return typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(html, { USE_PROFILES: { html: true }, ADD_ATTR: ['target'] }) : html;
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
    const data = await safeQuery(() => sb.from('ats_jobs').select('*').eq('greenhouse_id', jobId).single(), { label: 'keywords:ats_jobs', fallback: null });
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

  // CRON-COST-OPT T3: On-demand enrichment if jd_skills is null
  if (job.jd_skills === null && job.content) {
    try {
      fetch(SUPABASE_URL + '/functions/v1/enrich-job-ondemand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SUPABASE_KEY },
        body: JSON.stringify({ trigger: 'job_view', greenhouse_id: jobId }),
      }).catch(() => {}); // fire-and-forget
    } catch (_) { /* non-fatal */ }
  }

  // Populate header
  titleEl.textContent = job.title || 'Untitled';
  const metaParts = [job.company_name, formatLocation(job.location, job.loc_display)].filter(Boolean);
  if (job.department) metaParts.push(job.department);
  metaEl.textContent = metaParts.join('  \u00b7  ');
  extLink.href = jobUrl;

  // Populate body — robust decode that handles any level of HTML encoding
  const rawContent = job.content || job.description || null;
  if (rawContent && !isContentUnavailable(rawContent)) {
    bodyEl.innerHTML = decodeJobContent(rawContent);
    // Parse salary from cached content if not already parsed
    if (!job.salary_min) {
      const salary = parseSalaryFromContent(rawContent);
      if (salary) {
        job.salary_min = salary.min;
        job.salary_max = salary.max;
        job.salary_currency = salary.currency || 'USD'; job.salary_rate = salary.rate || 'yr';
        console.log(`[BJ] Salary extracted (cached): ${salary.currency || 'USD'} $${(salary.min/1000).toFixed(0)}k-$${(salary.max/1000).toFixed(0)}k from "${salary.raw}"`);
        enrichJob(jobId, { salary: { min: salary.min, max: salary.max, raw: salary.raw, currency: salary.currency || 'USD', rate: salary.rate || 'yr' } });
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
  // AI Score button (Pro users with assigned resume)
  var userPlan = window._bjUserPlan || 'free';
  if (userPlan === 'pro' || userPlan === 'enterprise') {
    footerHtml += '<button class="job-action-btn" onclick="aiScoreJob(\'' + jobId + '\')" id="ai-score-btn" style="padding:4px 10px;font-size:11px;border-color:var(--accent);color:var(--accent);">AI Score</button>';
  }
  footerHtml += '<button class="job-modal-close-btn" onclick="closeJobModal()" style="margin-left:auto;">Close</button>';
  // Referral Outreach button — v7.06
  footerHtml += '<button class="job-action-btn" onclick="openReferralOutreachModal(window._modalJobId)" style="padding:4px 10px;font-size:11px;border-color:#7c9ef7;color:#7c9ef7;" title="Request a referral from a connection at this company">Request Referral</button>';
  footerEl.innerHTML = footerHtml;

  // AI score result container
  var aiContainer = document.createElement('div');
  aiContainer.id = 'ai-score-result';
  footerEl.parentNode.insertBefore(aiContainer, footerEl);
}

// ─── Per-job AI scoring from modal ───
async function aiScoreJob(jobId) {
  var btn = document.getElementById('ai-score-btn');
  var resultEl = document.getElementById('ai-score-result');
  if (btn) { btn.disabled = true; btn.textContent = 'Scoring\u2026'; }

  // Find assigned resume for this job's filter
  var resume = null;
  var storedResumes = safeReadLS('bj_resumes', []);
  if (storedResumes.length > 0) resume = storedResumes[0]; // Use first resume as default

  if (!resume || !resume.extractedText) {
    if (resultEl) resultEl.innerHTML = '<div style="font-size:12px;color:var(--text-faint);padding:8px 0;">No resume text available for AI scoring</div>';
    if (btn) { btn.disabled = false; btn.textContent = 'AI Score'; }
    return;
  }

  var result = await fetchAIScore({
    resume_text: resume.extractedText,
    resume_keywords: resume.keywords || [],
    mode: 'single',
    job_ids: [jobId],
    max_jds: 1
  });

  if (btn) { btn.disabled = false; btn.textContent = 'AI Score'; }

  if (!result || !result.ai) {
    if (resultEl) resultEl.innerHTML = '<div style="font-size:12px;color:var(--red);padding:8px 0;">AI scoring failed — try again</div>';
    return;
  }

  // Render rich result
  var g = scoreToGrade(result.score);
  var html = '<div style="margin:8px 0;padding:12px;background:var(--bg-input);border-radius:8px;border:1px solid var(--border);">';
  html += '<div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">';
  html += '<span style="font-size:28px;font-weight:700;color:' + g.color + ';font-family:var(--mono)">' + g.grade + '</span>';
  html += '<span style="font-size:14px;color:var(--text)">' + (result.fitStatus || '') + '</span>';
  html += '</div>';
  html += '<p style="font-size:12px;color:var(--text-dim);margin-bottom:8px">' + (result.summary || '') + '</p>';

  if (result.topMissing && result.topMissing.length > 0) {
    html += '<div style="font-size:11px;color:var(--text-faint);margin-bottom:4px">Missing skills:</div>';
    html += '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">';
    result.topMissing.forEach(function(s) {
      html += '<span style="font-size:10px;padding:2px 8px;border-radius:4px;background:rgba(239,68,68,0.15);color:var(--red);border:1px solid rgba(239,68,68,0.2)">' + s.term + '</span>';
    });
    html += '</div>';
  }

  if (result.recommendations && result.recommendations.word_usage) {
    html += '<div style="font-size:11px;color:var(--text-faint);margin-bottom:4px">Rewrite tips:</div>';
    result.recommendations.word_usage.forEach(function(tip) {
      html += '<div style="font-size:11px;color:var(--text-dim);padding-left:8px">\u2192 ' + tip + '</div>';
    });
  }

  html += '</div>';
  if (resultEl) resultEl.innerHTML = html;

  // PostHog
  if (typeof posthog !== 'undefined') {
    posthog.capture('ai_score_completed', { mode: 'single', score: result.score, ai: true });
  }
}


// ─── Score Explainer Panel ────────────────────────────────────────────
// Shows a popup explaining exactly why a job scored the way it did.
// Tells user: which terms matched, which are missing, and what data source was used.
window.showScoreExplainer = function(jobId) {
  var result = jobMatchScores[jobId];
  if (!result) return;

  var job = currentJobs && currentJobs.find(function(j){ return j.greenhouse_id === jobId; });
  var jobTitle = job ? job.title : jobId;
  var score = result.score;
  var color = score >= 80 ? 'var(--green)' : score >= 60 ? '#22c55e' : score >= 40 ? 'var(--warm)' : 'var(--red)';

  var matched = result.topMatched || [];
  var missing = result.topMissing || [];
  var source = result.termSource || 'content';
  var total = result.total || (matched.length + missing.length);
  var resumeName = result.resumeName || '';

  // Source label
  var sourceLabel = source === 'ai_skills'
    ? '<span style="color:var(--green);font-weight:600;">AI-extracted skills</span>'
    : '<span style="color:var(--warm);font-weight:600;">word frequency fallback</span> <span style="color:var(--text-faint);font-size:10px;">(no AI skills yet — add credits to improve)</span>';

  var pill = function(t, hit) {
    var bg = hit ? 'rgba(34,197,94,.12)' : 'rgba(239,68,68,.10)';
    var col = hit ? 'var(--green)' : 'var(--red)';
    var icon = hit ? '✓' : '✗';
    return '<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:4px;background:' + bg + ';color:' + col + ';font-size:11px;font-weight:500;margin:2px;">' + icon + ' ' + escapeHtml(t) + '</span>';
  };

  var matchedHtml = matched.slice(0, 20).map(function(t){ return pill(t, true); }).join('');
  var missingHtml = missing.slice(0, 20).map(function(t){ return pill(t, false); }).join('');

  // Build overall tip
  var tip = '';
  if (score < 40) {
    tip = 'Very low match. Your resume likely needs these terms added or the role may be a poor fit.';
  } else if (score < 60) {
    tip = 'Below average. Adding a few of the missing terms to your resume could meaningfully improve your score.';
  } else if (score < 80) {
    tip = 'Decent match. You cover most of the basics but a tailored rewrite could push this higher.';
  } else {
    tip = 'Strong match. Your resume aligns well with this role\'s requirements.';
  }

  var html = [
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">',
      '<div>',
        '<div style="font-size:13px;font-weight:700;color:var(--text);">Score Breakdown</div>',
        '<div style="font-size:11px;color:var(--text-faint);margin-top:1px;">' + escapeHtml(jobTitle) + (resumeName ? ' · ' + escapeHtml(resumeName) : '') + '</div>',
      '</div>',
      '<div style="font-family:var(--mono);font-size:28px;font-weight:800;color:' + color + ';">' + score + '%</div>',
    '</div>',
    '<div style="font-size:11px;color:var(--text-dim);margin-bottom:12px;padding:8px 10px;background:var(--bg-input);border-radius:6px;">',
      'Scored against: ' + sourceLabel + ' · ' + matched.length + '/' + total + ' terms matched',
    '</div>',
    tip ? '<div style="font-size:12px;color:var(--text-dim);margin-bottom:12px;font-style:italic;">' + tip + '</div>' : '',
    matched.length > 0 ? [
      '<div style="font-size:10px;font-weight:700;color:var(--text-faint);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Matched (' + matched.length + ')</div>',
      '<div style="display:flex;flex-wrap:wrap;margin-bottom:12px;">' + matchedHtml + '</div>',
    ].join('') : '',
    missing.length > 0 ? [
      '<div style="font-size:10px;font-weight:700;color:var(--text-faint);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Missing from your resume (' + Math.min(missing.length, 20) + ')</div>',
      '<div style="display:flex;flex-wrap:wrap;margin-bottom:12px;">' + missingHtml + '</div>',
    ].join('') : '',
    missing.length > 0 ? '<div style="font-size:11px;color:var(--text-faint);margin-top:4px;">Use Boost to rewrite your resume targeting these terms.</div>' : '',
  ].join('');

  // Render into a popup overlay
  var overlay = document.createElement('div');
  overlay.id = 'score-explainer-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;';
  overlay.addEventListener('click', function(e){ if (e.target === overlay) overlay.remove(); });

  var modal = document.createElement('div');
  modal.style.cssText = 'background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:20px 24px;width:520px;max-width:92vw;max-height:80vh;overflow-y:auto;box-shadow:0 16px 40px rgba(0,0,0,.3);animation:fadeIn .15s ease;position:relative;';
  modal.innerHTML = html;

  var closeBtn = document.createElement('button');
  closeBtn.innerHTML = '&times;';
  closeBtn.style.cssText = 'position:absolute;top:14px;right:16px;background:none;border:none;font-size:22px;cursor:pointer;color:var(--text-faint);line-height:1;';
  closeBtn.addEventListener('click', function(){ overlay.remove(); });
  modal.appendChild(closeBtn);

  // Boost button if score < 85
  if (score < 85 && job && typeof boostMatch === 'function') {
    var boostBtn = document.createElement('button');
    boostBtn.className = 'btn btn-primary';
    boostBtn.style.cssText = 'margin-top:12px;width:100%;justify-content:center;';
    boostBtn.textContent = 'Boost Resume for this Role';
    boostBtn.addEventListener('click', function(){
      overlay.remove();
      boostMatch(jobId, jobTitle, job.company_name);
    });
    modal.appendChild(boostBtn);
  }

  overlay.appendChild(modal);
  // Remove existing
  var existing = document.getElementById('score-explainer-overlay');
  if (existing) existing.remove();
  document.body.appendChild(overlay);
};

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
    if (job?.content && !isContentUnavailable(job.content)) {
      bodyEl.innerHTML = decodeJobContent(job.content);
    } else if (job?.content && isContentUnavailable(job.content)) {
      bodyEl.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-faint);font-size:13px;">This job listing is no longer available on the company\'s careers page.</div>';
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
      } catch(e) { reportError('keywords:keywords', e); }
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
  // Normalize space-separated thousands to comma-separated (e.g. "$95 000" → "$95,000")
  text = text.replace(/(\$|£|€|CA\$|AU\$|US\$)\s*(\d{1,3})((?:\s\d{3})+)(?=\.\d{2}|\s|$|[^0-9])/g, function(m, sym, first, rest) {
    return sym + first + rest.replace(/\s/g, ',');
  });

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
    // "$120,000 - $150,000" or "$77 - $96" or "$77.00 to $96.00" or "$49,530 USD to $149,243 USD"
    new RegExp(currSym + '\\s*([\\d,]+(?:\\.\\d{2})?)\\s*(?:USD|CAD|GBP|EUR|AUD)?\\s*(?:[-–—]|to)\\s*' + currSym + '?\\s*([\\d,]+(?:\\.\\d{2})?)\\s*(?:per\\s+(?:year|hour|hr|week|wk|month|mo|day|session|visit)|annually|annual|hourly|weekly|monthly|\\/\\s*(?:yr|year|hr|hour|h|wk|week|mo|month|mth|day|d)|USD|CAD|GBP|EUR)?', 'gi'),
    // "$120k - $150k"
    new RegExp(currSym + '\\s*(\\d+(?:\\.\\d+)?)\\s*[kK]\\s*(?:USD|CAD|GBP|EUR|AUD)?\\s*(?:[-–—]|to)\\s*' + currSym + '?\\s*(\\d+(?:\\.\\d+)?)\\s*[kK]', 'gi'),
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
    // Standalone "$45/hr" or "$60/hour" or "$5,000/mo" — no keyword prefix needed when rate is explicit
    new RegExp(currSym + '\\s*([\\d,]+(?:\\.\\d{2})?)\\s*\\/\\s*(?:hr|hour|h|wk|week|mo|month|mth|day|d|yr|year)', 'gi'),
    // Standalone "$45 per hour" or "$60 per week"
    new RegExp(currSym + '\\s*([\\d,]+(?:\\.\\d{2})?)\\s+per\\s+(?:hour|hr|week|wk|month|mo|day|session|visit|year|yr|annum)', 'gi'),
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


// Detect if ATS returned 200 but content indicates listing is dead
function isDeadJobContent(html) {
  if (!html || html.length < 20) return false;
  var text = html.replace(/<[^>]+>/g, ' ').toLowerCase().trim();
  // Only flag if content is very short (error page, not a real JD)
  if (text.length > 500) return false;
  var deadPatterns = [
    'no longer accepting applications',
    'position has been filled',
    'this job is no longer available',
    'job not found',
    'page not found',
    'this position is no longer open',
    'this role has been filled',
    'sorry, this job has been closed',
    'this posting has expired'
  ];
  return deadPatterns.some(function(p) { return text.indexOf(p) >= 0; });
}

// ─── Dead Job Handler ───
// When ATS returns 404/410, the listing has been removed.
// Close in DB, remove from feed, update counts.
function handleDeadJob(jobId, bodyEl) {
  console.log('[BJ] Dead job detected:', jobId);
  
  // Update local cache
  const cachedJob = allJobs.find(j => j.greenhouse_id === jobId);
  if (cachedJob) {
    cachedJob.content = '<!-- unavailable -->';
    cachedJob.status = 'closed';
  }
  
  // Close in DB via edge function (status + content)
  enrichJob(jobId, { content: '<!-- unavailable -->', status: 'closed' });
  
  // Remove from feed DOM
  const feedRow = document.querySelector(`tr[data-jobid="${jobId}"]`);
  if (feedRow) {
    feedRow.style.transition = 'opacity 0.3s';
    feedRow.style.opacity = '0';
    setTimeout(() => {
      feedRow.remove();
      // Also remove snippet row if present
      const snippetRow = document.querySelector(`tr.job-snippet-row[data-jobid="${jobId}"]`);
      if (snippetRow) snippetRow.remove();
    }, 300);
  }
  
  // Remove from allJobs array so it doesn't reappear
  const idx = allJobs.findIndex(j => j.greenhouse_id === jobId);
  if (idx >= 0) allJobs.splice(idx, 1);
  
  // Also remove from currentJobs if present
  if (typeof currentJobs !== 'undefined') {
    const cidx = currentJobs.findIndex(j => j.greenhouse_id === jobId);
    if (cidx >= 0) currentJobs.splice(cidx, 1);
  }
  
  // Update feed count
  const totalEl = document.getElementById('j-total');
  if (totalEl) {
    const cur = parseInt(totalEl.textContent.replace(/,/g, '')) || 0;
    if (cur > 0) totalEl.textContent = (cur - 1).toLocaleString();
  }
  
  // Show message in modal
  if (bodyEl) {
    bodyEl.innerHTML = '<div style="text-align:center;padding:40px;">' +
      '<div style="margin-bottom:16px;">' +
        '<svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">' +
          '<circle cx="24" cy="20" r="14" stroke="var(--text-faint)" stroke-width="1.5" stroke-dasharray="3 3" opacity="0.5"/>' +
          '<path d="M20 34h8M21 37h6M24 6v2M24 14a4 4 0 0 0-4 4c0 3 2 5 2 7h4c0-2 2-4 2-7a4 4 0 0 0-4-4z" stroke="var(--text-faint)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.4"/>' +
          '<line x1="10" y1="10" x2="38" y2="38" stroke="var(--warm)" stroke-width="1.5" stroke-linecap="round" opacity="0.7"/>' +
        '</svg>' +
      '</div>' +
      '<div style="color:var(--text);font-size:14px;font-weight:600;margin-bottom:6px;">This Brilliant opportunity has dimmed</div>' +
      '<div style="color:var(--text-faint);font-size:12px;line-height:1.6;max-width:320px;margin:0 auto;">' +
      'The listing is no longer live on the company\'s careers page. ' +
      'It\'s been removed from your feed and marked as closed.<br><br>' +
      '<span style="font-size:11px;opacity:0.7;">Don\'t worry — we\'re tracking 285,000+ jobs. Your next match is out there.</span></div></div>';
  }
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
          // Check if ATS returned a dead-listing page disguised as content
          if (isDeadJobContent(htmlContent)) {
            handleDeadJob(jobId, bodyEl);
            return;
          }
          bodyEl.innerHTML = htmlContent;
          // Also show department/location from API if available
          const meta = [];
          if (data.departments?.length) meta.push(data.departments.map(d => d.name).join(', '));
          if (data.offices?.length) meta.push(data.offices.map(o => o.name).join(', '));
          if (meta.length) {
            bodyEl.innerHTML = `<div style="font-size:11px;color:var(--text-faint);margin-bottom:16px;padding-bottom:10px;border-bottom:1px solid var(--border);">${escapeHtml(meta.join('  ·  '))}</div>` + bodyEl.innerHTML;
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
          enrichJob(jobId, { content: updateData.content, salary: updateData.salary_min ? { min: updateData.salary_min, max: updateData.salary_max, raw: updateData.salary_raw, currency: updateData.salary_currency, rate: updateData.salary_rate } : undefined });
          return;
        }
      } else if (resp.status === 404 || resp.status === 410) {
        // Listing removed — close job and remove from feed
        handleDeadJob(jobId, bodyEl);
        return;
      }
    }
  } catch(err) { reportError('keywords', err); console.log('[BJ] Greenhouse API fetch failed:', err.message);
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
          if (isDeadJobContent(htmlContent)) {
            handleDeadJob(jobId, bodyEl);
            return;
          }
          bodyEl.innerHTML = htmlContent;
          const meta = [];
          if (data.departments?.length) meta.push(data.departments.map(d => d.name).join(', '));
          if (data.offices?.length) meta.push(data.offices.map(o => o.name).join(', '));
          if (meta.length) {
            bodyEl.innerHTML = `<div style="font-size:11px;color:var(--text-faint);margin-bottom:16px;padding-bottom:10px;border-bottom:1px solid var(--border);">${escapeHtml(meta.join('  ·  '))}</div>` + bodyEl.innerHTML;
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
          enrichJob(jobId, { content: updateData.content, salary: updateData.salary_min ? { min: updateData.salary_min, max: updateData.salary_max, raw: updateData.salary_raw, currency: updateData.salary_currency, rate: updateData.salary_rate } : undefined });
          return;
        }
      } else if (resp.status === 404 || resp.status === 410) {
        handleDeadJob(jobId, bodyEl);
        return;
      }
    }
  } catch(err) { reportError('keywords', err); console.log('[BJ] Slug fallback failed:', err.message);
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
        bodyEl.innerHTML = typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(data.content, { USE_PROFILES: { html: true }, ADD_ATTR: ['target'] }) : data.content;
        const cachedJob = allJobs.find(j => j.greenhouse_id === jobId);
        if (cachedJob) cachedJob.content = data.content;
        return;
      }
    }
  } catch(err) { reportError('keywords', err); console.log('[BJ] Edge function fallback failed:', err.message);
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
  // Log apply signal
  if (typeof sb !== 'undefined' && sb.auth) {
    Promise.resolve(sb.rpc('log_feed_signal', { p_greenhouse_id: jobId, p_signal_type: 'apply' })).catch(e => reportError('keywords:signal-apply', e));
  }
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
      saveUserData('bj_applied_jobs', JSON.stringify(appliedJobIds));
    }
    // Store applied date
    const dates = safeReadLS('bj_applied_dates', {});
    dates[jobId] = new Date().toISOString();
    saveUserData('bj_applied_dates', JSON.stringify(dates));

    // Update pipeline meta
    const meta = getPipelineMeta();
    if (!meta[jobId]) meta[jobId] = { savedAt: new Date().toISOString(), filterTags: [] };
    meta[jobId].stage = 'applied';
    if (!meta[jobId].appliedAt) meta[jobId].appliedAt = new Date().toISOString();
    if (resumeName) meta[jobId].resumeUsed = resumeName;
    const sf = safeReadLS('bj_saved_filters', []);
    const checkedFilters = Array.from($$('.sf-check:checked')).map(cb => sf[parseInt(cb.dataset.idx)]?.name).filter(Boolean);
    meta[jobId].filterTags = checkedFilters;
    if (typeof savePipelineMeta === 'function') savePipelineMeta(meta);

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
    updateJobStats($('#j-total').textContent, $('#j-companies').textContent, ($('#j-new-login')||{textContent:'0'}).textContent, $('#j-new').textContent);
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
  if (typeof savePipelineMeta === 'function') savePipelineMeta(meta);
  saveUserData('bj_saved_jobs', JSON.stringify(savedJobIds));
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
  updateJobStats($('#j-total').textContent, $('#j-companies').textContent, ($('#j-new-login')||{textContent:'0'}).textContent, $('#j-new').textContent);
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

function showHideReasonPopup(jobId, title, company, anchorEl, afterHide, jobUrl, companySlug, filterIdxs) {
  // Remove any existing popup
  document.querySelectorAll('.hide-reason-popup').forEach(p => p.remove());

  const popup = document.createElement('div');
  popup.className = 'hide-reason-popup';
  popup.innerHTML = `<h4>Why doesn't this belong?</h4>` +
    `<div style="font-size:10px;color:var(--text-faint);margin:-6px 0 8px;line-height:1.4;">This trains your exclusion filters — hide 3+ and we'll suggest patterns to auto-remove similar jobs.</div>` +
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
        hiddenAt: new Date().toISOString(),
        filterIdxs: filterIdxs || []
      });
      saveUserData('bj_hidden_jobs', JSON.stringify(hiddenJobIds));
      popup.remove();
      if (afterHide) afterHide();
      bjUpdateImproveButton();
    });
  });

  document.body.appendChild(popup);
}

function hideJob(jobId, btn) {
  const row = btn.closest('tr');
  const job = currentJobs.find(j => j.greenhouse_id === jobId) || {};
  // Log hide signal
  if (typeof sb !== 'undefined' && sb.auth) {
    Promise.resolve(sb.rpc('log_feed_signal', { p_greenhouse_id: jobId, p_signal_type: 'hide' })).catch(e => reportError('keywords:signal-hide', e));
  }
  // Track which filter(s) were active when this job was hidden
  var activeFilterIdxs = [];
  if (typeof savedFilters !== 'undefined') {
    var sel = safeReadLS('bj_sf_selected', []);
    if (sel.length > 0) activeFilterIdxs = sel.map(Number).filter(function(n) { return !isNaN(n) && n >= 0; });
  }
  showHideReasonPopup(jobId, job.title || '', job.company_name || '', btn, () => {
    if (row) row.style.display = 'none';
  }, job.url || '', job.company_slug || '', activeFilterIdxs);
}

function toggleSaveJob(jobId, btn) {
  const idx = savedJobIds.indexOf(jobId);
  const meta = typeof getPipelineMeta === 'function' ? getPipelineMeta() : (window._pipelineMetaFallback || (window._pipelineMetaFallback = {}));
  if (idx >= 0) {
    // Remove from pipeline
    savedJobIds.splice(idx, 1);
    if (btn) { btn.textContent = 'Pipeline'; btn.classList.remove('saved-btn'); }
    delete meta[jobId];
    // Remove from Supabase
    if (typeof sb !== 'undefined' && typeof currentUser !== 'undefined' && currentUser?.id) {
      sb.from('user_pipeline').delete()
        .eq('user_id', currentUser.id)
        .eq('job_id', jobId)
        .then(() => {})
        .catch(e => reportError('keywords:pipeline-delete', e));
    }
  } else {
    // Add to pipeline
    savedJobIds.push(jobId);
    if (btn) { btn.textContent = 'Pipeline ✓'; btn.classList.add('saved-btn'); }
    // Log save signal
    if (typeof sb !== 'undefined' && sb.auth) {
      Promise.resolve(sb.rpc('log_feed_signal', { p_greenhouse_id: jobId, p_signal_type: 'save' })).catch(e => reportError('keywords:signal-save', e));
    }
    // Look up job data from feed for title/company
    var feedJob = (window._feedJobMap || {})[jobId] || {};
    // Determine which saved filters matched this job
    var _filterTags = [];
    var _filterNums = feedJob._filterNums || [];
    if (_filterNums.length > 0 && typeof savedFilters !== 'undefined') {
      _filterNums.forEach(function(fn) {
        var idx = typeof fn.num === 'number' ? fn.num - 1 : parseInt(fn.num) - 1;
        if (idx >= 0 && savedFilters[idx] && savedFilters[idx].name) {
          _filterTags.push(savedFilters[idx].name);
        }
      });
    }
    if (!meta[jobId]) meta[jobId] = {
      stage: 'saved',
      savedAt: new Date().toISOString(),
      filterTags: _filterTags,
      title: feedJob.title || '',
      companyName: feedJob.company_name || '',
      company: feedJob.company_name || '',
      jobUrl: feedJob.apply_url || feedJob.url || '',
      atsSource: feedJob.ats_source || 'greenhouse',
      companySlug: (feedJob.company_name || '').toLowerCase().replace(/[^a-z0-9]/g, '-') || jobId
    };
    // Persist to Supabase directly (pipeline chunk may not be loaded yet)
    if (typeof sb !== 'undefined' && typeof currentUser !== 'undefined' && currentUser?.id) {
      var entry = meta[jobId];
      sb.from('user_pipeline')
        .upsert({
          user_id: currentUser.id,
          job_id: jobId,
          ats_source: entry.atsSource || 'greenhouse',
          company_slug: entry.companySlug || entry.company || jobId,
          company_domain: null,
          job_title: entry.title || 'Untitled',
          job_url: entry.jobUrl || null,
          stage: entry.stage || 'saved',
          saved_at: entry.savedAt || new Date().toISOString(),
          applied_at: null,
          responded_at: null,
          interview_at: null,
          offer_at: null,
          hired_at: null,
          rejected_at: null,
          archived_at: null,
          auto_advanced: false,
          auto_advanced_source: null,
          notes: null,
          filter_tags: entry.filterTags || [],
          resume_used: null,
          match_score: null,
          company_name: entry.companyName || entry.company || null,
          salary_estimate: null
        }, { onConflict: 'user_id, job_id, ats_source' })
        .select('id')
        .single()
        .then(function(res) {
          if (res.error) { reportError('keywords:pipeline-save', res.error); console.error('[BJ] Pipeline save error:', res.error); }
          else { console.log('[BJ] Pipeline entry saved:', jobId); }
        })
        .catch(function(e) { reportError('keywords:pipeline-save', e); });
    }
    // AF-006: Log save to activity log
    if (typeof logDashboardActivity === 'function') {
      logDashboardActivity('saved', {
        jobTitle: feedJob.title || '',
        company: feedJob.company_name || '',
        jobUrl: feedJob.apply_url || feedJob.url || '',
        metadata: { surface: 'feed' }
      });
    }
  }
  if (typeof savePipelineMeta === 'function') savePipelineMeta(meta);
  saveUserData('bj_saved_jobs', JSON.stringify(savedJobIds));
  var savedEl = $('#j-saved');
  if (savedEl) savedEl.textContent = savedJobIds.length.toLocaleString();
  // Refresh My Applications view if pipeline chunk is loaded
  if (typeof renderPipeline === 'function') renderPipeline();
}


// ════════════════════════════════════════════════════════════
// IMPROVE FILTERS FROM HIDDEN JOBS (E18 — frontend wiring)
// ════════════════════════════════════════════════════════════

// Show/hide the Improve Filters button based on hidden job count
function bjUpdateImproveButton() {
  var btn = document.getElementById('improve-filters-btn');
  if (!btn) return;
  var count = (typeof hiddenJobIds !== 'undefined' ? hiddenJobIds : []).length;
  if (count >= 3) {
    btn.style.display = '';
    btn.textContent = '\ud83d\udd27 ' + count + ' hidden \u2014 generate exclusions';
  } else {
    btn.style.display = 'none';
  }
}

// Call on page load and after every hide
document.addEventListener('DOMContentLoaded', function() {
  setTimeout(bjUpdateImproveButton, 500);
});

// Main handler — batch analyze recent hidden jobs
async function bjImproveFiltersFromHidden() {
  var btn = document.getElementById('improve-filters-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Analyzing\u2026'; btn.style.opacity = '0.7'; }

  try {
    var session = await sb.auth.getSession();
    if (!session.data.session) { alert('Please sign in to use AI features.'); return; }

    // Get resume text (most recent non-archived)
    var resumesWithText = (typeof resumes !== 'undefined' ? resumes : []).filter(function(r) {
      return r.extractedText && r.extractedText.length > 100 && !r.archived;
    });
    if (resumesWithText.length === 0) {
      alert('Upload a resume first (Resumes tab) for AI to compare against.');
      if (btn) { btn.disabled = false; bjUpdateImproveButton(); }
      return;
    }
    var resume = resumesWithText[resumesWithText.length - 1];

    // Get recent hidden jobs (last 10)
    var recent = hiddenJobIds.slice(-10);
    if (recent.length === 0) { return; }

    // Get current filter pills for context
    var filterPills = null;
    if (typeof savedFilters !== 'undefined' && savedFilters.length > 0) {
      filterPills = savedFilters[0]; // use first saved filter as context
    }

    // Batch analyze — call for each hidden job in parallel (up to 5 concurrent)
    var allSuggestions = { what_not: [], where_not: [], who_not: [] };
    var batch = recent.slice(0, 5);

    var promises = batch.map(function(hj) {
      return fetch(SUPABASE_URL + '/functions/v1/analyze-hidden-job', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + session.data.session.access_token,
          'apikey': SUPABASE_KEY
        },
        body: JSON.stringify({
          job_id: hj.id,
          resume_text: resume.extractedText.slice(0, 6000),
          filter_pills: filterPills
        })
      }).then(function(r) { return r.ok ? r.json() : null; }).catch(function() { return null; });
    });

    var results = await Promise.all(promises);

    // Aggregate and deduplicate suggestions
    var seenWhat = new Set();
    var seenWhere = new Set();
    var seenWho = new Set();

    results.forEach(function(r) {
      if (!r) return;
      (r.what_not || []).forEach(function(s) {
        var key = s.term.toLowerCase();
        if (!seenWhat.has(key)) { seenWhat.add(key); allSuggestions.what_not.push(s); }
      });
      (r.where_not || []).forEach(function(s) {
        var key = s.term.toLowerCase();
        if (!seenWhere.has(key)) { seenWhere.add(key); allSuggestions.where_not.push(s); }
      });
      (r.who_not || []).forEach(function(s) {
        var key = s.term.toLowerCase();
        if (!seenWho.has(key)) { seenWho.add(key); allSuggestions.who_not.push(s); }
      });
    });

    var totalSuggestions = allSuggestions.what_not.length + allSuggestions.where_not.length + allSuggestions.who_not.length;

    if (totalSuggestions === 0) {
      if (btn) { btn.disabled = false; btn.textContent = 'No suggestions found'; setTimeout(bjUpdateImproveButton, 2000); }
      return;
    }

    // Show results in a modal
    bjShowImproveSuggestions(allSuggestions, batch.length);

    if (btn) { btn.disabled = false; bjUpdateImproveButton(); }

  } catch (e) {
    reportError('keywords', e);
    console.error('[BJ] Improve filters error:', e);
    if (btn) { btn.disabled = false; bjUpdateImproveButton(); }
  }
}

function bjShowImproveSuggestions(suggestions, jobsAnalyzed) {
  // Remove any existing modal
  var existing = document.getElementById('improve-suggestions-modal');
  if (existing) existing.remove();

  var total = suggestions.what_not.length + suggestions.where_not.length + suggestions.who_not.length;

  var html = '<div id="improve-suggestions-modal" style="position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;" onclick="if(event.target===this)this.remove()">';
  html += '<div style="background:var(--bg-card);border-radius:12px;max-width:500px;width:90%;max-height:80vh;overflow-y:auto;padding:24px;">';

  html += '<div style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:4px;">\ud83d\udd27 Filter Improvement Suggestions</div>';
  html += '<div style="font-size:11px;color:var(--text-faint);margin-bottom:16px;">Based on analysis of ' + jobsAnalyzed + ' hidden jobs \u00b7 ' + total + ' suggestions</div>';

  // What NOT
  if (suggestions.what_not.length > 0) {
    html += '<div style="margin-bottom:12px;">';
    html += '<div style="font-size:12px;font-weight:600;color:var(--red);margin-bottom:6px;">WHAT NOT \u2014 Title exclusions</div>';
    suggestions.what_not.forEach(function(s) {
      html += '<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:rgba(239,68,68,0.05);border:1px solid rgba(239,68,68,0.15);border-radius:6px;margin-bottom:4px;">';
      html += '<input type="checkbox" checked data-type="what_not" data-term="' + s.term.replace(/"/g, '&quot;') + '" style="accent-color:var(--red);cursor:pointer;">';
      html += '<div><div style="font-size:12px;font-weight:600;color:var(--text);">' + s.term + '</div>';
      html += '<div style="font-size:10px;color:var(--text-faint);">' + s.reason + '</div></div>';
      html += '</div>';
    });
    html += '</div>';
  }

  // Where NOT
  if (suggestions.where_not.length > 0) {
    html += '<div style="margin-bottom:12px;">';
    html += '<div style="font-size:12px;font-weight:600;color:var(--warm);margin-bottom:6px;">WHERE NOT \u2014 Location exclusions</div>';
    suggestions.where_not.forEach(function(s) {
      html += '<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:rgba(245,158,11,0.05);border:1px solid rgba(245,158,11,0.15);border-radius:6px;margin-bottom:4px;">';
      html += '<input type="checkbox" checked data-type="where_not" data-term="' + s.term.replace(/"/g, '&quot;') + '" style="accent-color:var(--warm);cursor:pointer;">';
      html += '<div><div style="font-size:12px;font-weight:600;color:var(--text);">' + s.term + '</div>';
      html += '<div style="font-size:10px;color:var(--text-faint);">' + s.reason + '</div></div>';
      html += '</div>';
    });
    html += '</div>';
  }

  // Who NOT
  if (suggestions.who_not.length > 0) {
    html += '<div style="margin-bottom:12px;">';
    html += '<div style="font-size:12px;font-weight:600;color:#7c3aed;margin-bottom:6px;">WHO NOT \u2014 Company exclusions</div>';
    suggestions.who_not.forEach(function(s) {
      html += '<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:rgba(124,58,237,0.05);border:1px solid rgba(124,58,237,0.15);border-radius:6px;margin-bottom:4px;">';
      html += '<input type="checkbox" checked data-type="who_not" data-term="' + s.term.replace(/"/g, '&quot;') + '" style="accent-color:#7c3aed;cursor:pointer;">';
      html += '<div><div style="font-size:12px;font-weight:600;color:var(--text);">' + s.term + '</div>';
      html += '<div style="font-size:10px;color:var(--text-faint);">' + s.reason + '</div></div>';
      html += '</div>';
    });
    html += '</div>';
  }

  html += '<div style="display:flex;gap:8px;margin-top:16px;">';
  html += '<button onclick="bjApplyImproveSuggestions()" style="flex:1;padding:10px;background:var(--green);color:#fff;border:none;border-radius:6px;font-weight:700;font-size:12px;cursor:pointer;">Apply Selected</button>';
  html += '<button onclick="document.getElementById(\'improve-suggestions-modal\').remove()" style="padding:10px 16px;background:var(--bg-main);color:var(--text-faint);border:1px solid var(--border);border-radius:6px;font-size:12px;cursor:pointer;">Cancel</button>';
  html += '</div>';

  html += '</div></div>';

  document.body.insertAdjacentHTML('beforeend', html);
}

function bjApplyImproveSuggestions() {
  var modal = document.getElementById('improve-suggestions-modal');
  if (!modal) return;

  var checkboxes = modal.querySelectorAll('input[type=checkbox]:checked');
  if (checkboxes.length === 0) { modal.remove(); return; }

  // Collect selected suggestions
  var whatNot = [];
  var whereNot = [];
  var whoNot = [];

  checkboxes.forEach(function(cb) {
    var type = cb.dataset.type;
    var term = cb.dataset.term;
    if (type === 'what_not') whatNot.push(term);
    if (type === 'where_not') whereNot.push(term);
    if (type === 'who_not') whoNot.push(term);
  });

  // Apply to the first saved filter's tuning config
  // This integrates with the existing Search Tuning system
  if (typeof savedFilters !== 'undefined' && savedFilters.length > 0) {
    var filter = savedFilters[0];

    // Add to title exclusions
    if (whatNot.length > 0) {
      if (!filter.titleExclusions) filter.titleExclusions = [];
      whatNot.forEach(function(term) {
        if (!filter.titleExclusions.includes(term)) filter.titleExclusions.push(term);
      });
    }

    // Add to location exclusions
    if (whereNot.length > 0) {
      if (!filter.locationExclusions) filter.locationExclusions = [];
      whereNot.forEach(function(term) {
        if (!filter.locationExclusions.includes(term)) filter.locationExclusions.push(term);
      });
    }

    // Add to company exclusions
    if (whoNot.length > 0) {
      if (!filter.companyExclusions) filter.companyExclusions = [];
      whoNot.forEach(function(term) {
        if (!filter.companyExclusions.includes(term)) filter.companyExclusions.push(term);
      });
    }

    saveUserData('bj_saved_filters', JSON.stringify(savedFilters));
    console.log('[BJ] Applied NOT suggestions:', { whatNot, whereNot, whoNot });
  }

  modal.remove();

  // Show confirmation and refresh feed
  var toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--green);color:#fff;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600;z-index:10000;';
  toast.textContent = '\u2713 ' + checkboxes.length + ' exclusion(s) applied to your filter';
  document.body.appendChild(toast);
  setTimeout(function() { toast.remove(); }, 3000);

  // Refresh the feed with new exclusions
  if (typeof refreshFeed === 'function') refreshFeed();
}

// ════════════════════════════════════════════════════════════
// G23: AUTO-ADD REWRITE TO RESUME LIBRARY
// G26: TIER PROVENANCE TRACKING
// ════════════════════════════════════════════════════════════

function bjAddRewriteToLibrary(ri, fi, data, filterName) {
  var original = resumes[ri];
  if (!original) return;

  var round = 1;
  resumes.forEach(function(r) {
    if (r.source === 'rewrite' && r.basedOn === original.id) {
      round = Math.max(round, (r.rewrite_round || 0) + 1);
    }
  });

  var id = 'res_rw_' + data.session_id.slice(0, 8) + '_' + round;
  var name = (original.name || 'Resume') + ' \u2014 ' + (filterName || 'Rewrite') + ' v' + round;

  var newResume = {
    id: id,
    name: name,
    fileName: name + '.docx',
    size: '',
    filterIds: filterName ? [filterName] : (original.filterIds || []).slice(),
    uploadedAt: new Date().toLocaleDateString(),
    levelLabel: original.levelLabel || '',
    levelColor: original.levelColor || '',
    archived: false,
    extractedText: '',
    keywords: original.keywords || [],
    textStatus: 'ready',
    source: 'rewrite',
    basedOn: original.id,
    rewrite_session_id: data.session_id,
    rewrite_round: round,
    analysis_tier: 'premium',
    rewrite_tier: 'premium',
    tier_history: [
      { action: 'analyzed', tier: 'premium', timestamp: new Date().toISOString() },
      { action: 'rewritten', tier: 'premium', round: round, timestamp: new Date().toISOString() }
    ],
    resume_path: data.resume_path,
    qa_clean: data.qa_report ? (data.qa_report.accuracy?.clean && data.qa_report.bleed?.clean) : null,
    changes_count: (data.changes_made || []).length,
    template_used: data.template_used
  };

  // Extract text from resume sections for keyword analysis
  if (data.resume_sections) {
    var textParts = [];
    (data.resume_sections || []).forEach(function(section) {
      (section.items || []).forEach(function(item) {
        if (item.content) {
          if (item.content.text) textParts.push(item.content.text);
          if (item.content.title) textParts.push(item.content.title);
          if (item.content.company) textParts.push(item.content.company);
          if (item.content.bullets) textParts.push(item.content.bullets.join(' '));
          if (item.content.skills) textParts.push(item.content.skills.join(', '));
          if (item.content.degree) textParts.push(item.content.degree);
        }
      });
    });
    newResume.extractedText = textParts.join('\n');
    if (typeof extractResumeKeywords === 'function') {
      newResume.keywords = extractResumeKeywords(newResume.extractedText);
    }
  }

  resumes.push(newResume);
  saveResumes();
  if (typeof renderResumes === 'function') renderResumes();
  console.log('[BJ] Rewrite added to library:', id, name);
  return id;
}

// ════════════════════════════════════════════════════════════
// G24-G25: COVER LETTER SAVE + ARCHIVE
// ════════════════════════════════════════════════════════════

async function bjSaveCoverLetter(data, filterName) {
  if (!data.cover_letter || !data.cover_letter_path) return;
  try {
    var session = await sb.auth.getSession();
    if (!session.data.session) return;
    var { error } = await sb.from('cover_letters').insert({
      user_id: session.data.session.user.id,
      session_id: data.session_id,
      round_number: 1,
      filter_name: filterName || '',
      paragraphs: data.cover_letter.paragraphs || [],
      salutation: data.cover_letter.salutation || '',
      closing: data.cover_letter.closing || '',
      word_count: data.cover_letter.word_count || 0,
      storage_path: data.cover_letter_path,
      tier: 'premium',
      analysis_tier: 'premium'
    });
    if (error) console.error('[BJ] Cover letter save error:', error);
    else {
      console.log('[BJ] Cover letter saved');
      // v6.40: Score cover letter for AI content after save
      var clText = (data.cover_letter.salutation || '') + '\n' +
        (data.cover_letter.paragraphs || []).join('\n') + '\n' +
        (data.cover_letter.closing || '');
      if (clText.length >= 100) {
        scoreCoverLetterAI(session.data.session, clText, filterName);
      }
    }
  } catch(e) { reportError('keywords', e); console.error('[BJ] Cover letter save exception:', e); }
}

async function bjRenderCoverLetterArchive() {
  var container = document.getElementById('cover-letter-archive');
  if (!container) return;
  try {
    var session = await sb.auth.getSession();
    if (!session.data.session) { container.style.display = 'none'; return; }
    var { data: covers, error } = await sb.from('cover_letters')
      .select('*').eq('user_id', session.data.session.user.id)
      .order('created_at', { ascending: false }).limit(20);
    if (error || !covers || covers.length === 0) { container.style.display = 'none'; return; }

    // v6.40: Fetch AI scores for cover letters
    var clIds = covers.map(function(c) { return c.id; });
    var aiScores = {};
    try {
      var { data: scores, error: scErr } = await sb.from('content_ai_scores')
        .select('content_id,ai_label,ai_generated_score,confidence,summary')
        .eq('content_type', 'cover_letter')
        .in('content_id', clIds);
      if (scErr) reportError('keywords:cl-ai-scores', scErr);
      if (scores) scores.forEach(function(s) { aiScores[s.content_id] = s; });
    } catch(e) { reportError('keywords', e); console.warn('[ai-score] CL score fetch error:', e.message); }

    container.style.display = '';
    var html = '<div style="border-top:1px solid var(--border);padding-top:12px;margin-top:12px;">';
    html += '<div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:8px;">Cover Letters (' + covers.length + ')</div>';
    covers.forEach(function(cl, idx) {
      var date = cl.created_at ? new Date(cl.created_at).toLocaleDateString() : '';
      var tierBadge = cl.tier === 'premium'
        ? '<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:linear-gradient(135deg,rgba(77,142,255,0.1),rgba(124,58,237,0.1));border:1px solid rgba(77,142,255,0.2);color:#4d8eff;font-weight:600;">\u2728 Premium</span>'
        : '<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:rgba(148,163,184,0.1);color:#94a3b8;font-weight:600;">AI Basic</span>';
      var downloadUrl = SUPABASE_URL + '/storage/v1/object/public/' + cl.storage_path;

      // v6.40: AI detection badge for cover letter
      var aiBadge = '';
      var aiData = aiScores[cl.id];
      if (aiData && aiData.ai_label) {
        var aiColors = { human: { bg:'rgba(34,197,94,0.1)', text:'#22c55e', border:'rgba(34,197,94,0.15)', icon:'\u2705' },
          mixed: { bg:'rgba(234,179,8,0.1)', text:'#eab308', border:'rgba(234,179,8,0.15)', icon:'\u26a0\ufe0f' },
          ai_generated: { bg:'rgba(239,68,68,0.1)', text:'#ef4444', border:'rgba(239,68,68,0.15)', icon:'\ud83e\udd16' } };
        var ac = aiColors[aiData.ai_label] || aiColors.mixed;
        var aiPct = Math.round((aiData.ai_generated_score || 0) * 100);
        var labelText = aiData.ai_label === 'human' ? 'Human' : aiData.ai_label === 'mixed' ? 'Mixed' : 'AI-Generated';
        aiBadge = ' <span style="font-size:9px;font-weight:600;padding:2px 6px;border-radius:4px;background:' + ac.bg + ';color:' + ac.text + ';border:1px solid ' + ac.border + ';cursor:help;" title="AI Detection: ' + labelText + ' (' + aiPct + '% AI)\n' + (aiData.summary || '').replace(/"/g, '&quot;') + '">' + ac.icon + ' ' + labelText + ' ' + aiPct + '%</span>';
      }

      // v6.40: Rescore button for cover letter
      var clText = (cl.salutation || '') + '\n' + (cl.paragraphs || []).join('\n') + '\n' + (cl.closing || '');
      var rescoreBtn = '';
      if (clText.length >= 100) {
        rescoreBtn = ' <button onclick="event.stopPropagation();bjRescoreCoverLetter(\'' + cl.id + '\')" ' +
          'id="cl-rescore-btn-' + cl.id + '" ' +
          'style="font-size:9px;font-weight:600;padding:2px 6px;border-radius:4px;background:rgba(99,102,241,0.1);color:#6366f1;border:1px solid rgba(99,102,241,0.15);cursor:pointer;" ' +
          'title="Re-analyze for AI content">\ud83d\udd04 Rescore</button>';
      }

      html += '<div style="padding:8px;border:1px solid var(--border);border-radius:6px;margin-bottom:6px;background:var(--bg-input);">';
      html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap;">';
      html += '<span style="font-size:12px;font-weight:600;color:var(--text);">\ud83d\udcc4 ' + escapeHtml(cl.filter_name || 'General') + '</span>' + tierBadge + aiBadge + rescoreBtn;
      html += '<span style="font-size:10px;color:var(--text-faint);margin-left:auto;">' + date + ' \u00b7 ' + (cl.word_count || '?') + ' words</span></div>';
      html += '<div id="cl-preview-' + cl.id + '" style="display:none;font-size:11px;color:var(--text-dim);margin:6px 0;padding:8px;background:var(--bg-main);border-radius:4px;line-height:1.5;">';
      html += '<div style="font-style:italic;margin-bottom:4px;">' + escapeHtml(cl.salutation || '') + '</div>';
      (cl.paragraphs || []).forEach(function(p) { html += '<div style="margin-bottom:6px;">' + escapeHtml(p) + '</div>'; });
      html += '<div>' + escapeHtml(cl.closing || '') + '</div></div>';
      html += '<div style="display:flex;gap:6px;">';
      html += '<button class="btn btn-sm" onclick="var e=document.getElementById(\'cl-preview-' + cl.id + '\');e.style.display=e.style.display===\'none\'?\'\':\'none\';" style="font-size:9px;padding:2px 8px;">Preview</button>';
      html += '<a href="' + downloadUrl + '" download class="btn btn-sm" style="font-size:9px;padding:2px 8px;text-decoration:none;">Download</a>';
      html += '<button class="btn btn-sm" onclick="bjDeleteCoverLetter(\'' + cl.id + '\')" style="font-size:9px;padding:2px 8px;color:var(--red);">Delete</button>';
      html += '</div></div>';
    });
    html += '</div>';
    container.innerHTML = html;
  } catch (e) { reportError('keywords', e); console.error('[BJ] Cover letter archive error:', e); container.style.display = 'none'; }
}

async function bjDeleteCoverLetter(id) {
  if (!confirm('Delete this cover letter?')) return;
  try { var { error: delErr } = await sb.from('cover_letters').delete().eq('id', id); if (delErr) { reportError('keywords:delete-cover-letter', delErr); return; } bjRenderCoverLetterArchive(); }
  catch(e) { reportError('keywords', e); console.error('[BJ] Delete cover letter error:', e); }
}

// ════════════════════════════════════════════════════════════
// v6.40: COVER LETTER AI SCORING (Session 2.3)
// ════════════════════════════════════════════════════════════

// Score cover letter text via score-ai-content Edge Function
async function scoreCoverLetterAI(session, text, filterName) {
  try {
    if (!session || !session.access_token) {
      console.warn('[ai-score] No session, skipping cover letter scoring');
      return;
    }

    var resp = await fetch(SUPABASE_URL + '/functions/v1/score-ai-content', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + session.access_token,
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
      },
      body: JSON.stringify({
        items: [{
          content_type: 'cover_letter',
          content_id: filterName || 'cover-letter-' + Date.now(),
          text: text.substring(0, 8000),
        }]
      }),
    });

    if (!resp.ok) {
      console.warn('[ai-score] Cover letter scoring failed:', resp.status);
      return;
    }

    var data = await resp.json();
    var result = data.results && data.results[0];

    if (result) {
      // PostHog event
      if (typeof posthog !== 'undefined') {
        posthog.capture('ai_cover_letter_scored', {
          ai_label: result.ai_label,
          ai_score: result.ai_generated_score,
          confidence: result.confidence,
          text_length: text.length,
          filter_name: filterName || '',
        });
      }
      console.log('[ai-score] Cover letter scored:', result.ai_label, result.ai_generated_score);
      // Refresh archive to show badge
      bjRenderCoverLetterArchive();
    }
  } catch(e) { reportError('keywords', e); console.warn('[ai-score] Cover letter scoring error:', e.message);
  }
}

// v6.40: Rescore cover letter with 60-second cooldown (reuses resume cooldown pattern)
var _clRescoreCooldowns = {};
var CL_RESCORE_COOLDOWN_MS = 60000;

window.bjRescoreCoverLetter = async function(clId) {
  // Rate limit check
  if (_clRescoreCooldowns[clId] && Date.now() < _clRescoreCooldowns[clId]) {
    var wait = Math.ceil((_clRescoreCooldowns[clId] - Date.now()) / 1000);
    if (typeof showToast === 'function') showToast('Please wait ' + wait + 's before rescoring again', { type: 'info' });
    return;
  }

  var btn = document.getElementById('cl-rescore-btn-' + clId);
  if (btn) {
    btn.disabled = true;
    btn.style.opacity = '0.5';
    btn.style.cursor = 'not-allowed';
    btn.innerHTML = '\ud83d\udd04 Scoring\u2026';
  }

  // Set cooldown
  _clRescoreCooldowns[clId] = Date.now() + CL_RESCORE_COOLDOWN_MS;

  try {
    var session = await sb.auth.getSession();
    if (!session.data.session) { console.warn('[ai-score] No session'); return; }

    // Fetch cover letter text from DB
    var { data: cl, error } = await sb.from('cover_letters')
      .select('salutation,paragraphs,closing')
      .eq('id', clId).single();
    if (error || !cl) { console.warn('[ai-score] CL fetch error:', error); return; }

    var clText = (cl.salutation || '') + '\n' + (cl.paragraphs || []).join('\n') + '\n' + (cl.closing || '');
    if (clText.length < 100) {
      if (typeof showToast === 'function') showToast('Cover letter text too short for AI scoring', { type: 'warning' });
      return;
    }

    var resp = await fetch(SUPABASE_URL + '/functions/v1/score-ai-content', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + session.data.session.access_token,
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
      },
      body: JSON.stringify({
        items: [{
          content_type: 'cover_letter',
          content_id: clId,
          text: clText.substring(0, 8000),
        }]
      }),
    });

    if (!resp.ok) {
      console.warn('[ai-score] CL rescore failed:', resp.status);
      return;
    }

    var data = await resp.json();
    var result = data.results && data.results[0];
    if (result) {
      console.log('[ai-score] Cover letter rescored:', clId, result.ai_label, result.ai_generated_score);
      if (typeof posthog !== 'undefined') {
        posthog.capture('ai_cover_letter_rescored', {
          cover_letter_id: clId,
          ai_label: result.ai_label,
          ai_score: result.ai_generated_score,
          confidence: result.confidence,
        });
      }
    }
  } catch(e) { reportError('keywords', e); console.warn('[ai-score] CL rescore error:', e.message);
  } finally {
    // Start cooldown timer on button
    _startClRescoreCooldown(clId);
    // Refresh archive to show updated badge
    bjRenderCoverLetterArchive();
  }
};

// v6.40: Cooldown timer for cover letter rescore button
function _startClRescoreCooldown(clId) {
  var interval = setInterval(function() {
    var btn = document.getElementById('cl-rescore-btn-' + clId);
    if (!btn) { clearInterval(interval); return; }
    var remaining = _clRescoreCooldowns[clId] ? _clRescoreCooldowns[clId] - Date.now() : 0;
    if (remaining <= 0) {
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.style.cursor = 'pointer';
      btn.title = 'Re-analyze for AI content';
      btn.innerHTML = '\ud83d\udd04 Rescore';
      clearInterval(interval);
    } else {
      var sec = Math.ceil(remaining / 1000);
      btn.title = 'Cooldown: wait ' + sec + 's';
      btn.innerHTML = '\ud83d\udd04 ' + sec + 's';
    }
  }, 1000);
}

// ─── FB-TRIAL-001-S6 5.2: Poll resume_score_queue for batch results ───
function _startScoreQueuePoll(queueId, originalParams) {
  // Show shimmer on the score card
  var scoreCard = document.getElementById('readiness-scores');
  if (scoreCard) {
    scoreCard.innerHTML = '<div class="score-shimmer" style="background:linear-gradient(90deg,#2a2a3a 25%,#3a3a4a 50%,#2a2a3a 75%);background-size:200% 100%;animation:shimmer 1.5s infinite;border-radius:8px;height:80px;width:100%;"></div>';
  }
  showToast('Score queued — results ready in ~2 minutes', { type: 'info' });

  var pollInterval = 10000; // 10s
  var maxAttempts = 30; // 5 minutes
  var attempts = 0;
  var poller = setInterval(async function() {
    attempts++;
    if (attempts > maxAttempts) {
      clearInterval(poller);
      if (scoreCard) scoreCard.innerHTML = '<p style="color:var(--text-muted);font-size:13px;">Score timed out — please try again.</p>';
      return;
    }
    try {
      var { data: { session } } = await sb.auth.getSession();
      if (!session) { clearInterval(poller); return; }
      var res = await fetch(SUPABASE_URL + '/functions/v1/batch-resume-scorer?action=status&queue_id=' + queueId, {
        headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }
      });
      // Alternatively query Supabase directly
      var { data: qrow } = await sb.from('resume_score_queue').select('status,result').eq('id', queueId).single();
      if (!qrow || qrow.status === 'pending' || qrow.status === 'submitted') return; // still waiting
      clearInterval(poller);
      if (qrow.status === 'completed' && qrow.result) {
        // Render score result
        if (typeof window._renderBatchScoreResult === 'function') {
          window._renderBatchScoreResult(qrow.result, originalParams);
        } else if (scoreCard) {
          var r = qrow.result;
          scoreCard.innerHTML = '<div style="padding:12px;background:var(--bg-card);border-radius:8px;">' +
            '<div style="font-size:24px;font-weight:700;color:var(--accent);">' + (r.match_score || '--') + '</div>' +
            '<div style="font-size:12px;color:var(--text-muted);margin-top:4px;">' + (r.fit_status || '') + '</div>' +
            '<div style="font-size:12px;margin-top:8px;">' + (r.analysis_summary || '') + '</div>' +
            '</div>';
        }
        showToast('Resume scored!', { type: 'success' });
      } else {
        if (scoreCard) scoreCard.innerHTML = '<p style="color:var(--warning);font-size:13px;">Scoring failed — please try again.</p>';
      }
    } catch (e) {
      console.warn('[BJ] Queue poll error:', e);
    }
  }, pollInterval);
}

// CS-P1-004 FE-005: Register keywords.js exports with BJ namespace
(function() {
  var exports = [
    'handleScoreClick', '_selectScoreMode', 'addResume', 'bjRescoreCoverLetter', 'toggleSaveJob'
  ];
  exports.forEach(function(name) {
    if (typeof window[name] === 'function') {
      window.BJ[name] = window[name];
      window.BJ._registry[name] = { module: 'keywords', registered: Date.now() };
    }
  });
})();
