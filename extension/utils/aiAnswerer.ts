// extension/utils/aiAnswerer.ts — AI-powered form question answerer
// v1.1: Added answer caching (Item #18) — reuse AI answers across same question types
//
// Usage in ATS handlers:
//   import { answerCustomQuestions } from '../utils/aiAnswerer.ts';
//   const answers = await answerCustomQuestions(unmatchedFields, profile, resume, jobContext);
//   // answers = [{ id, answer, confidence }]

const SUPABASE_URL = 'https://qojhagupdnbtomfoxnsf.supabase.co';
const EF_PATH = '/functions/v1/answer-form-question';

// ── Answer Cache (Item #18) ──────────────────────────────────
// Cache key = normalized question label + field type.
// Cache lives in chrome.storage.local under '_bj_answer_cache'.
// TTL: 7 days. Max entries: 200.
const CACHE_KEY = '_bj_answer_cache';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const CACHE_MAX_ENTRIES = 200;

/**
 * Normalize a question label for cache key matching.
 * Strips whitespace, lowercases, removes trailing colons/asterisks.
 */
function normalizeCacheKey(label, fieldType) {
  const clean = (label || '')
    .toLowerCase()
    .replace(/[*:?\s]+$/g, '')     // trailing punctuation
    .replace(/\s+/g, ' ')          // normalize whitespace
    .trim();
  return `${fieldType || 'text'}::${clean}`;
}

/**
 * Load the answer cache from storage.
 */
async function loadCache() {
  try {
    const data = await chrome.storage.local.get(CACHE_KEY);
    return data[CACHE_KEY] || {};
  } catch {
    return {};
  }
}

/**
 * Save cache to storage, pruning expired/overflow entries.
 */
async function saveCache(cache) {
  const now = Date.now();
  const entries = Object.entries(cache);

  // Prune expired
  const valid = entries.filter(([, v]) => v.ts && (now - v.ts) < CACHE_TTL_MS);

  // If still over limit, drop oldest
  valid.sort((a, b) => b[1].ts - a[1].ts);
  const pruned = Object.fromEntries(valid.slice(0, CACHE_MAX_ENTRIES));

  try {
    await chrome.storage.local.set({ [CACHE_KEY]: pruned });
  } catch (e) {
    console.warn('[aiAnswerer] Cache save error:', e.message);
  }
  return pruned;
}

/**
 * Batch-answer custom form questions using Claude Haiku via the
 * answer-form-question Edge Function.
 * Now with caching: checks cache first, only calls EF for cache misses.
 *
 * @param {Array<{id: string, label: string, fieldType: string, options?: string[], maxLength?: number}>} questions
 * @param {Object} profile - User profile data
 * @param {Object} resume - { text: string }
 * @param {Object} jobContext - { title?: string, company?: string }
 * @param {string} authToken - Supabase auth token
 * @returns {Promise<Array<{id: string, answer: string, confidence: string}>>}
 */
export async function answerCustomQuestions(questions, profile, resume, jobContext, authToken) {
  if (!questions || !questions.length) return [];
  if (!authToken) {
    console.warn('[aiAnswerer] No auth token — skipping AI answers');
    return questions.map(q => ({ id: q.id, answer: '', confidence: 'low' }));
  }

  // ── Check cache for hits ──
  const cache = await loadCache();
  const results = [];
  const misses = [];

  for (const q of questions) {
    const key = normalizeCacheKey(q.label, q.fieldType);
    const cached = cache[key];
    if (cached && cached.answer && (Date.now() - cached.ts) < CACHE_TTL_MS) {
      results.push({ id: q.id, answer: cached.answer, confidence: cached.confidence || 'cached' });
      console.log(`[aiAnswerer] Cache hit: "${q.label}"`);
    } else {
      misses.push(q);
    }
  }

  // If all cached, return immediately
  if (misses.length === 0) {
    console.log(`[aiAnswerer] All ${questions.length} questions served from cache`);
    return results;
  }

  console.log(`[aiAnswerer] ${results.length} cache hits, ${misses.length} cache misses — calling EF`);

  // ── Call EF for misses ──
  // Cap at 10 per call (EF limit)
  const batch = misses.slice(0, 10);

  // CS-013 FIX-14: PII minimisation — send only per-question relevant fields
  // instead of full profile. Reduces data exposure surface.
  const fullProfile = {
    name: profile?.firstName ? `${profile.firstName} ${profile.lastName || ''}`.trim() : profile?.name,
    email: profile?.email,
    phone: profile?.phone,
    location: profile?.location || profile?.city,
    current_company: profile?.currentCompany,
    current_title: profile?.currentTitle,
    years_experience: profile?.yearsExperience,
    linkedin: profile?.linkedin,
    github: profile?.github,
    portfolio: profile?.portfolio || profile?.website,
    skills: profile?.skills,
    education: profile?.education,
    visa_status: profile?.visaStatus,
    willing_to_relocate: profile?.willingToRelocate,
    desired_salary: profile?.desiredSalary,
    start_date: profile?.startDate
  };

  const payload = {
    questions: batch.map(q => ({
      id: q.id,
      label: q.label,
      field_type: q.fieldType || 'text',
      options: q.options || undefined,
      max_length: q.maxLength || undefined,
      // Per-question profile subset — only fields relevant to this question
      profile_fields: _selectProfileFields(q.label, q.fieldType, fullProfile)
    })),
    // Minimal shared context (no PII in top-level profile)
    job_title: jobContext?.title || '',
    company_name: jobContext?.company || '',
    // Resume text only if needed (skill/experience questions)
    resume_summary: batch.some(q => _needsResume(q.label)) ? (resume?.text || '').slice(0, 2000) : undefined
  };

  try {
    const resp = await fetch(`${SUPABASE_URL}${EF_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvamhhZ3VwZG5idG9tZm94bnNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NjkwNjYsImV4cCI6MjA4NjE0NTA2Nn0.0AFgnrN7omBC4Jg8G0kxZACn5mXLWPazIodI6JOx1rg'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000)
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.warn(`[aiAnswerer] EF returned ${resp.status}:`, errText.slice(0, 200));
      // Return cache hits + empty for misses
      return [
        ...results,
        ...batch.map(q => ({ id: q.id, answer: '', confidence: 'low' }))
      ];
    }

    const data = await resp.json();
    const efAnswers = data.answers || batch.map(q => ({ id: q.id, answer: '', confidence: 'low' }));

    // ── Cache new answers ──
    const now = Date.now();
    for (let i = 0; i < batch.length; i++) {
      const q = batch[i];
      const a = efAnswers[i];
      if (a && a.answer) {
        const key = normalizeCacheKey(q.label, q.fieldType);
        cache[key] = { answer: a.answer, confidence: a.confidence, ts: now };
      }
    }
    await saveCache(cache);

    return [...results, ...efAnswers];

  } catch (err) {
    console.warn('[aiAnswerer] Error calling EF:', err.message || err);
    return [
      ...results,
      ...batch.map(q => ({ id: q.id, answer: '', confidence: 'low' }))
    ];
  }
}

/**
 * Clear the answer cache. Useful for testing or when profile changes.
 */
export async function clearAnswerCache() {
  await chrome.storage.local.remove(CACHE_KEY);
  console.log('[aiAnswerer] Answer cache cleared');
}

/**
 * Collect unmatched custom questions from a form.
 * Scans for form fields that weren't filled by the standard label map.
 *
 * @param {HTMLElement} container - The form container element
 * @param {Set<string>} filledFieldIds - Set of field IDs already filled by label map
 * @returns {Array<{id: string, label: string, fieldType: string, options?: string[], maxLength?: number}>}
 */
export function collectUnmatchedQuestions(container, filledFieldIds) {
  const questions = [];
  if (!container) return questions;

  const fields = container.querySelectorAll(
    'input[type="text"], input[type="url"], input[type="number"], textarea, select'
  );

  for (const field of fields) {
    const fieldId = field.id || field.name || `field-${questions.length}`;
    if (filledFieldIds.has(fieldId)) continue;
    if (field.type === 'hidden' || field.disabled) continue;
    if (field.value && field.value.trim()) continue;

    const label = findLabel(field);
    if (!label) continue;
    if (/^(name|first.?name|last.?name|email|phone|resume|cv|cover.?letter)$/i.test(label)) continue;

    const question = {
      id: fieldId,
      label: label,
      fieldType: field.tagName === 'SELECT' ? 'select' :
                 field.tagName === 'TEXTAREA' ? 'textarea' :
                 field.type || 'text'
    };

    if (field.tagName === 'SELECT') {
      question.options = Array.from(field.options)
        .map(opt => opt.text.trim())
        .filter(t => t && !t.startsWith('Select') && !t.startsWith('Choose'));
    }

    if (field.maxLength && field.maxLength > 0 && field.maxLength < 10000) {
      question.maxLength = field.maxLength;
    }

    questions.push(question);
  }

  return questions;
}

/**
 * Find label text for a form field.
 */
function findLabel(el) {
  if (el.id) {
    const label = document.querySelector(`label[for="${el.id}"]`);
    if (label) return label.textContent.trim();
  }

  const parentLabel = el.closest('label');
  if (parentLabel) {
    const text = parentLabel.textContent.trim();
    const fieldVal = el.value || '';
    return text.replace(fieldVal, '').trim();
  }

  const container = el.closest(
    '.application-question, .custom-question, .field, .form-group, ' +
    '[data-qa], [class*="question"], [class*="field-group"]'
  );
  if (container) {
    const label = container.querySelector('label, .label, .field-label, [class*="label"]');
    if (label) return label.textContent.trim();
  }

  return el.getAttribute('aria-label') || el.getAttribute('placeholder') || '';
}

// ═══════════════════════════════════════════════════════════
// CS-013 FIX-14: PII FIELD MAPPING
// Maps question labels/types to the minimum profile fields needed.
// ═══════════════════════════════════════════════════════════

// Keyword → field groups mapping
const FIELD_GROUPS = {
  contact:  ['name', 'email', 'phone'],
  identity: ['name'],
  location: ['location', 'willing_to_relocate'],
  work:     ['current_company', 'current_title', 'years_experience'],
  links:    ['linkedin', 'github', 'portfolio'],
  skills:   ['skills'],
  education:['education'],
  visa:     ['visa_status'],
  salary:   ['desired_salary'],
  dates:    ['start_date'],
};

// Label patterns → which field groups are needed
const PATTERN_MAP = [
  { patterns: [/email/i, /e-?mail/i],                              groups: ['contact'] },
  { patterns: [/phone/i, /mobile/i, /cell/i, /tel/i],              groups: ['contact'] },
  { patterns: [/linkedin/i, /github/i, /portfolio/i, /website/i],   groups: ['links'] },
  { patterns: [/city/i, /location/i, /address/i, /relocat/i, /where.*live/i], groups: ['location'] },
  { patterns: [/salary/i, /compensation/i, /pay/i, /rate/i],       groups: ['salary', 'work'] },
  { patterns: [/visa/i, /sponsor/i, /authoriz/i, /work.*permit/i], groups: ['visa', 'location'] },
  { patterns: [/start.*date/i, /avail/i, /when.*start/i, /notice/i], groups: ['dates'] },
  { patterns: [/experience/i, /years/i, /how long/i],              groups: ['work'] },
  { patterns: [/current.*company/i, /employer/i],                   groups: ['work'] },
  { patterns: [/title/i, /role/i, /position/i],                    groups: ['work'] },
  { patterns: [/skill/i, /technolog/i, /proficien/i, /language/i], groups: ['skills'] },
  { patterns: [/education/i, /degree/i, /university/i, /school/i, /gpa/i, /major/i], groups: ['education'] },
  { patterns: [/name/i],                                            groups: ['identity'] },
];

/**
 * Select only the profile fields relevant to a question.
 * @param {string} label — question label
 * @param {string} fieldType — 'text', 'select', 'textarea', etc.
 * @param {object} fullProfile — complete profile object
 * @returns {object} — subset of profile fields
 */
function _selectProfileFields(label, fieldType, fullProfile) {
  const neededGroups = new Set();

  // Match label against patterns
  for (const entry of PATTERN_MAP) {
    for (const pattern of entry.patterns) {
      if (pattern.test(label)) {
        entry.groups.forEach(g => neededGroups.add(g));
      }
    }
  }

  // Textarea and long-form fields might need work context
  if (fieldType === 'textarea' && neededGroups.size === 0) {
    neededGroups.add('work');
    neededGroups.add('skills');
  }

  // If no patterns matched, provide minimal work context
  if (neededGroups.size === 0) {
    neededGroups.add('work');
  }

  // Build the subset
  const subset = {};
  for (const group of neededGroups) {
    const fields = FIELD_GROUPS[group] || [];
    for (const field of fields) {
      if (fullProfile[field] !== undefined && fullProfile[field] !== null && fullProfile[field] !== '') {
        subset[field] = fullProfile[field];
      }
    }
  }

  return subset;
}

/**
 * Check if a question likely needs resume text for context.
 * Only send resume for experience/skill/qualification questions.
 */
function _needsResume(label) {
  return /experience|skill|project|achieve|accomplish|qualif|summary|cover.*letter|why.*interest|why.*apply|tell.*about|describe/i.test(label);
}

