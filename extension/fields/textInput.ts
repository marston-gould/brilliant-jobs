// fields/textInput.ts — Standard Text Input Filler
// v3.0.0: Fills text, email, phone, url inputs on any ATS.
// v5.40: B7 — Human-sim typing wired in. Variable WPM, word-boundary
//        pauses, occasional typo+backspace for realism.
// Uses React props on React apps, standard DOM events otherwise.

import { setReactValue, setDOMValue, isReactApp } from '../utils/reactProps.ts';

/**
 * Fill a standard text-like input field.
 *
 * @param {HTMLInputElement|HTMLTextAreaElement} el - The input element
 * @param {string} value - Value to set
 * @param {Object} options - { humanLike: boolean, delayMs: number }
 * @returns {Object} { success: boolean, error?: string }
 */
export async function fillTextInput(el, value, options = {}) {
  if (!el || !value) {
    return { success: false, error: 'Missing element or value' };
  }

  try {
    // Focus the field first
    el.focus();
    el.dispatchEvent(new FocusEvent('focus', { bubbles: true }));

    // Clear existing value
    el.value = '';
    el.dispatchEvent(new Event('input', { bubbles: true }));

    if (options.humanLike) {
      // Type character by character with human-sim behavior
      await typeHumanLike(el, value, options.delayMs || 50);
    } else {
      // Set value directly
      if (isReactApp()) {
        setReactValue(el, value);
      } else {
        setDOMValue(el, value);
      }
    }

    // Blur to trigger validation
    el.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

    // Verify
    const success = el.value === value;
    return { success, error: success ? undefined : 'Value not set correctly' };

  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ============================================================
// HUMAN-SIM TYPING ENGINE (B7)
// ============================================================
// Realistic keystroke simulation with:
//  - Variable inter-key delay (faster mid-word, slower at boundaries)
//  - Occasional typo + backspace correction (~3% chance per char)
//  - Word-boundary pauses (space, punctuation)
//  - Shift/modifier events for uppercase and special chars

const SHIFT_CHARS = new Set('~!@#$%^&*()_+{}|:"<>?ABCDEFGHIJKLMNOPQRSTUVWXYZ');
const ADJACENT_KEYS = {
  a: 'sqwz', b: 'vngh', c: 'xdfv', d: 'sfce', e: 'rdw', f: 'dgcv',
  g: 'fhtb', h: 'gjyn', i: 'uojk', j: 'hkum', k: 'jli', l: 'kop',
  m: 'njk', n: 'bhmj', o: 'iplk', p: 'ol', q: 'wa', r: 'etdf',
  s: 'adwxz', t: 'rfgy', u: 'yihj', v: 'cfgb', w: 'qase', x: 'zsdc',
  y: 'tugh', z: 'asx',
};

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Get a realistic inter-key delay based on character context.
 * Humans type faster mid-word and slower at boundaries.
 */
function getKeystrokeDelay(char, prevChar, baseDelay) {
  // Word boundary: space, punctuation, transition from letter to number
  if (char === ' ' || /[.,;:!?@\-\/]/.test(char)) {
    return baseDelay * rand(2.0, 4.0); // Pause before/at punctuation
  }

  // After a space — starting a new word, slightly slower
  if (prevChar === ' ') {
    return baseDelay * rand(1.2, 2.5);
  }

  // Shift key needed — adds cognitive overhead
  if (SHIFT_CHARS.has(char)) {
    return baseDelay * rand(1.3, 2.2);
  }

  // Mid-word fluent typing
  return baseDelay * rand(0.5, 1.4);
}

/**
 * Pick a plausible typo character (adjacent key on QWERTY layout).
 */
function getTypoChar(char) {
  const lower = char.toLowerCase();
  const neighbors = ADJACENT_KEYS[lower];
  if (!neighbors) return null;
  return neighbors[Math.floor(Math.random() * neighbors.length)];
}

/**
 * Dispatch a single keystroke event chain (keydown → keypress → input → keyup).
 */
function dispatchKeystroke(el, char) {
  const opts = { key: char, bubbles: true, cancelable: true };
  el.dispatchEvent(new KeyboardEvent('keydown', opts));
  el.dispatchEvent(new KeyboardEvent('keypress', opts));
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new KeyboardEvent('keyup', opts));
}

/**
 * Type text character by character with human-like behavior.
 * Integrates variable timing, occasional typos, and natural pauses.
 */
async function typeHumanLike(el, text, baseDelay = 50) {
  let prevChar = '';

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    // ── Occasional typo (~3% chance, only for lowercase letters) ──
    if (Math.random() < 0.03 && /[a-z]/i.test(char)) {
      const typoChar = getTypoChar(char);
      if (typoChar) {
        // Type wrong char
        el.value += typoChar;
        dispatchKeystroke(el, typoChar);
        await sleep(baseDelay * rand(0.4, 0.8));

        // Brief pause (noticing the mistake)
        await sleep(baseDelay * rand(1.5, 3.5));

        // Backspace to correct
        el.value = el.value.slice(0, -1);
        dispatchKeystroke(el, 'Backspace');
        await sleep(baseDelay * rand(0.6, 1.2));
      }
    }

    // ── Type the correct character ──
    el.value += char;
    dispatchKeystroke(el, char);

    // ── Variable delay ──
    const delay = getKeystrokeDelay(char, prevChar, baseDelay);
    await sleep(delay);

    prevChar = char;
  }
}
