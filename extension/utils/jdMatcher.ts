// utils/jdMatcher.ts — JD-to-Resume Instant Match Scoring
// v3.8.0: Phase 10 (P9) — Extracts keywords from JD text,
// compares against stored resume text, returns compatibility score.
//
// This runs in the service worker (background.js) context.
// It receives JD text from contentScript.js and compares against
// the user's active resume text stored in chrome.storage.local.

var BJ_JD_MATCHER = (function () {
  'use strict';

  // ── Stopwords to ignore in keyword extraction ──
  const STOPWORDS = new Set([
    'a','an','the','and','or','but','in','on','at','to','for','of','with',
    'by','from','as','is','was','are','were','be','been','being','have',
    'has','had','do','does','did','will','would','shall','should','may',
    'might','can','could','that','which','who','whom','this','these',
    'those','it','its','we','our','you','your','they','their','he','she',
    'him','her','not','no','nor','if','then','than','too','very','just',
    'about','above','after','again','all','also','am','any','because',
    'before','between','both','during','each','few','more','most','other',
    'over','own','same','so','some','such','through','under','until','up',
    'what','when','where','while','how','into','out','only','get','new',
    'well','also','one','two','work','working','including','etc','e.g',
    'i.e','per','via','within','across','along','among','around','able',
    'like','use','using','used','make','made','need','must','role','join',
    'team','company','position','looking','seek','seeking','candidates',
    'candidate','opportunity','responsibilities','requirements','required',
    'preferred','qualifications','benefits','salary','compensation',
    'apply','application','equal','employer','diversity','inclusive',
    'experience','years','year','strong','excellent','good','great',
    'minimum','plus','bonus','full','time','part','remote','hybrid',
    'office','location','based','currently','ideal','description'
  ]);

  // ── N-gram extraction (unigrams + bigrams) ──
  function extractKeywords(text) {
    if (!text || typeof text !== 'string') return [];

    const cleaned = text
      .toLowerCase()
      .replace(/[^a-z0-9\s\-\+\#\.]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const words = cleaned.split(' ').filter(w => w.length > 2);

    // Unigrams (excluding stopwords)
    const unigrams = words.filter(w => !STOPWORDS.has(w) && w.length > 2);

    // Bigrams
    const bigrams = [];
    for (let i = 0; i < words.length - 1; i++) {
      const bigram = words[i] + ' ' + words[i + 1];
      // Keep bigrams where at least one word is meaningful
      if (!STOPWORDS.has(words[i]) || !STOPWORDS.has(words[i + 1])) {
        bigrams.push(bigram);
      }
    }

    // Frequency map
    const freq = {};
    unigrams.forEach(w => { freq[w] = (freq[w] || 0) + 1; });
    bigrams.forEach(b => { freq[b] = (freq[b] || 0) + 1; });

    // Sort by frequency, take top keywords
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 80)
      .map(([term, count]) => ({ term, count }));
  }

  // ── Tech keyword patterns (high-value matches) ──
  const TECH_PATTERNS = [
    /\b(python|javascript|typescript|java|c\+\+|c#|ruby|go|rust|swift|kotlin|scala|php|perl|r)\b/gi,
    /\b(react|angular|vue|node\.?js|express|django|flask|spring|rails|laravel)\b/gi,
    /\b(aws|azure|gcp|docker|kubernetes|terraform|ansible|jenkins|ci\/cd)\b/gi,
    /\b(sql|postgres|mysql|mongodb|redis|elasticsearch|dynamodb|cassandra)\b/gi,
    /\b(machine\s?learning|deep\s?learning|nlp|computer\s?vision|ai|ml)\b/gi,
    /\b(agile|scrum|kanban|devops|sre|microservices|api|rest|graphql)\b/gi,
    /\b(figma|sketch|adobe|photoshop|illustrator|ux|ui)\b/gi,
    /\b(excel|tableau|power\s?bi|looker|analytics|data\s?science)\b/gi,
    /\b(pmp|cpa|cfa|mba|phd|cissp|aws\s?certified|google\s?certified)\b/gi,
    /\b(salesforce|hubspot|marketo|sap|oracle|workday|servicenow)\b/gi,
  ];

  function extractTechKeywords(text) {
    if (!text) return [];
    const found = new Set();
    for (const pattern of TECH_PATTERNS) {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(m => found.add(m.toLowerCase().trim()));
      }
    }
    return Array.from(found);
  }

  // ── Compute match score between JD and resume ──
  function computeMatch(jdText, resumeText) {
    if (!jdText || !resumeText) {
      return { score: 0, matched: [], missing: [], techMatched: [], techMissing: [], confidence: 'none' };
    }

    const jdKeywords = extractKeywords(jdText);
    const resumeLower = resumeText.toLowerCase();

    // Check each JD keyword against resume
    const matched = [];
    const missing = [];

    for (const { term, count } of jdKeywords) {
      if (resumeLower.includes(term)) {
        matched.push({ term, count });
      } else {
        missing.push({ term, count });
      }
    }

    // Tech keyword matching (higher weight)
    const jdTech = extractTechKeywords(jdText);
    const techMatched = jdTech.filter(t => resumeLower.includes(t));
    const techMissing = jdTech.filter(t => !resumeLower.includes(t));

    // Score calculation:
    // - General keyword match: 60% weight
    // - Tech keyword match: 40% weight
    const generalTotal = jdKeywords.length || 1;
    const generalScore = matched.length / generalTotal;

    const techTotal = jdTech.length || 1;
    const techScore = jdTech.length > 0 ? techMatched.length / techTotal : generalScore;

    const rawScore = (generalScore * 0.6) + (techScore * 0.4);
    const score = Math.round(rawScore * 100);

    // Confidence based on keyword count
    let confidence = 'low';
    if (jdKeywords.length >= 20 && jdTech.length >= 3) confidence = 'high';
    else if (jdKeywords.length >= 10) confidence = 'medium';

    return {
      score: Math.min(score, 100),
      matched: matched.slice(0, 20),
      missing: missing.slice(0, 20),
      techMatched,
      techMissing,
      totalJdKeywords: jdKeywords.length,
      totalTechKeywords: jdTech.length,
      confidence,
    };
  }

  // ── Load resume text from storage ──
  async function getActiveResumeText() {
    try {
      const data = await chrome.storage.local.get(['bj_active_resume_text', 'bj_resumes']);

      // Direct text cache
      if (data.bj_active_resume_text) {
        return data.bj_active_resume_text;
      }

      // Fallback: check resume metadata
      if (data.bj_resumes) {
        const resumes = typeof data.bj_resumes === 'string'
          ? JSON.parse(data.bj_resumes)
          : data.bj_resumes;
        const active = Array.isArray(resumes)
          ? resumes.find(r => r.active || r.isDefault)
          : null;
        if (active && active.extractedText) {
          return active.extractedText;
        }
      }

      return null;
    } catch (e) {
      console.warn('[BJ_JD_MATCHER] Failed to load resume text:', e.message);
      return null;
    }
  }

  // ── Main: match JD against active resume ──
  async function matchJD(jdText) {
    const resumeText = await getActiveResumeText();
    if (!resumeText) {
      return {
        score: 0,
        error: 'no_resume',
        message: 'No active resume found. Upload a resume in the dashboard.',
      };
    }
    return computeMatch(jdText, resumeText);
  }

  // ── Cache JD match result for the current tab ──
  const _jdCache = {};

  async function matchAndCache(tabId, jdText, url) {
    const result = await matchJD(jdText);
    _jdCache[tabId] = {
      ...result,
      url,
      matchedAt: new Date().toISOString(),
    };
    return result;
  }

  function getCachedMatch(tabId) {
    return _jdCache[tabId] || null;
  }

  function clearCache(tabId) {
    delete _jdCache[tabId];
  }

  return {
    extractKeywords,
    extractTechKeywords,
    computeMatch,
    matchJD,
    matchAndCache,
    getCachedMatch,
    clearCache,
    getActiveResumeText,
  };
})();
