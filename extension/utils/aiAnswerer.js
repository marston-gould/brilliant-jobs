// extension/utils/aiAnswerer.js — AI-powered form question answerer
// v1.0: Calls answer-form-question EF for custom questions the label map can't handle.
//
// Usage in ATS handlers:
//   import { answerCustomQuestions } from '../utils/aiAnswerer.js';
//   const answers = await answerCustomQuestions(unmatchedFields, profile, resume, jobContext);
//   // answers = [{ id, answer, confidence }]

const SUPABASE_URL = 'https://qojhagupdnbtomfoxnsf.supabase.co';
const EF_PATH = '/functions/v1/answer-form-question';
// v5.48: Answer cache (Item #18) — reuse AI answers for identical questions
const _answerCache = new Map();
const CACHE_MAX_SIZE = 200;
const CACHE_STORAGE_KEY = 'bj_answer_cache';

function _normalizeLabel(label) {
  return (label || '').toLowerCase().trim()
    .replace(/[*:?]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\(optional\)/i, '')
    .replace(/\(required\)/i, '')
    .trim();
}

async function _loadCacheFromStorage() {
  try {
    const result = await chrome.storage.local.get(CACHE_STORAGE_KEY);
    const entries = result[CACHE_STORAGE_KEY];
    if (Array.isArray(entries)) {
      for (const [key, val] of entries) {
        _answerCache.set(key, val);
      }
    }
  } catch (e) { /* cache load is best-effort */ }
}

async function _saveCacheToStorage() {
  try {
    const entries = Array.from(_answerCache.entries()).slice(-CACHE_MAX_SIZE);
    await chrome.storage.local.set({ [CACHE_STORAGE_KEY]: entries });
  } catch (e) { /* cache save is best-effort */ }
}

// Load cache on module init
_loadCacheFromStorage();



/**
 * Batch-answer custom form questions using Claude Haiku via the
 * answer-form-question Edge Function.
 *
 * @param {Array<{id: string, label: string, fieldType: string, options?: string[], maxLength?: number}>} questions
 *   Unmatched form fields that need AI answers.
 * @param {Object} profile - User profile data (name, email, skills, etc.)
 * @param {Object} resume - { text: string } — extracted resume text
 * @param {Object} jobContext - { title?: string, company?: string }
 * @param {string} authToken - Supabase auth token (from background.js session)
 * @returns {Promise<Array<{id: string, answer: string, confidence: string}>>}
 */
export async function answerCustomQuestions(questions, profile, resume, jobContext, authToken) {
  if (!questions || !questions.length) return [];
  if (!authToken) {
    console.warn('[aiAnswerer] No auth token — skipping AI answers');
    return questions.map(q => ({ id: q.id, answer: '', confidence: 'low' }));
  }

  // v5.48: Check cache first — split into cached hits and uncached misses
  const cachedResults = [];
  const uncachedQuestions = [];

  for (const q of questions) {
    const cacheKey = _normalizeLabel(q.label) + '|' + (q.fieldType || 'text');
    const cached = _answerCache.get(cacheKey);
    if (cached && cached.confidence !== 'low') {
      cachedResults.push({ id: q.id, answer: cached.answer, confidence: cached.confidence, fromCache: true });
    } else {
      uncachedQuestions.push(q);
    }
  }

  // If everything was cached, return immediately
  if (uncachedQuestions.length === 0) {
    console.log('[aiAnswerer] All', questions.length, 'answers served from cache');
    return cachedResults;
  }

  // Cap at 10 per call (EF limit)
  const batch = uncachedQuestions.slice(0, 10);

  const payload = {
    questions: batch.map(q => ({
      id: q.id,
      label: q.label,
      field_type: q.fieldType || 'text',
      options: q.options || undefined,
      max_length: q.maxLength || undefined
    })),
    profile: {
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
    },
    resume_text: resume?.text || '',
    job_title: jobContext?.title || '',
    company_name: jobContext?.company || ''
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
      signal: AbortSignal.timeout(20000) // 20s timeout
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.warn(`[aiAnswerer] EF returned ${resp.status}:`, errText.slice(0, 200));
      return batch.map(q => ({ id: q.id, answer: '', confidence: 'low' }));
    }

    const data = await resp.json();
    const answers = data.answers || batch.map(q => ({ id: q.id, answer: '', confidence: 'low' }));

    // v5.48: Cache successful answers for reuse
    for (let i = 0; i < batch.length && i < answers.length; i++) {
      if (answers[i].confidence !== 'low' && answers[i].answer) {
        const cacheKey = _normalizeLabel(batch[i].label) + '|' + (batch[i].fieldType || 'text');
        _answerCache.set(cacheKey, { answer: answers[i].answer, confidence: answers[i].confidence });
        // Evict oldest if over limit
        if (_answerCache.size > CACHE_MAX_SIZE) {
          const firstKey = _answerCache.keys().next().value;
          _answerCache.delete(firstKey);
        }
      }
    }
    _saveCacheToStorage();

    // Merge cached + fresh results
    return [...cachedResults, ...answers];

  } catch (err) {
    console.warn('[aiAnswerer] Error calling EF:', err.message || err);
    return batch.map(q => ({ id: q.id, answer: '', confidence: 'low' }));
  }
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
    // Skip already-filled fields
    const fieldId = field.id || field.name || `field-${questions.length}`;
    if (filledFieldIds.has(fieldId)) continue;

    // Skip hidden/disabled fields
    if (field.type === 'hidden' || field.disabled) continue;

    // Skip fields that already have values
    if (field.value && field.value.trim()) continue;

    // Find the label
    const label = findLabel(field);
    if (!label) continue;

    // Skip standard fields (name, email, phone, resume)
    if (/^(name|first.?name|last.?name|email|phone|resume|cv|cover.?letter)$/i.test(label)) continue;

    const question = {
      id: fieldId,
      label: label,
      fieldType: field.tagName === 'SELECT' ? 'select' :
                 field.tagName === 'TEXTAREA' ? 'textarea' :
                 field.type || 'text'
    };

    // Collect options for select elements
    if (field.tagName === 'SELECT') {
      question.options = Array.from(field.options)
        .map(opt => opt.text.trim())
        .filter(t => t && !t.startsWith('Select') && !t.startsWith('Choose'));
    }

    // Note max length if set
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
  // Try associated label
  if (el.id) {
    const label = document.querySelector(`label[for="${el.id}"]`);
    if (label) return label.textContent.trim();
  }

  // Try parent label
  const parentLabel = el.closest('label');
  if (parentLabel) {
    const text = parentLabel.textContent.trim();
    // Remove the field value from label text
    const fieldVal = el.value || '';
    return text.replace(fieldVal, '').trim();
  }

  // Try sibling/container patterns common in ATS forms
  const container = el.closest(
    '.application-question, .custom-question, .field, .form-group, ' +
    '[data-qa], [class*="question"], [class*="field-group"]'
  );
  if (container) {
    const label = container.querySelector('label, .label, .field-label, [class*="label"]');
    if (label) return label.textContent.trim();
  }

  // Try aria-label
  return el.getAttribute('aria-label') || el.getAttribute('placeholder') || '';
}
