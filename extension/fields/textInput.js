// fields/textInput.js — Standard Text Input Filler
// v3.0.0: Fills text, email, phone, url inputs on any ATS.
// Uses React props on React apps, standard DOM events otherwise.

import { setReactValue, setDOMValue, isReactApp } from '../utils/reactProps.js';

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
      // Type character by character for anti-automation detection
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

/**
 * Type text character by character with random delays.
 * Used for LinkedIn and other anti-automation platforms.
 */
async function typeHumanLike(el, text, baseDelay = 50) {
  for (const char of text) {
    el.value += char;
    el.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true }));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));

    // Random delay 30-80ms
    await new Promise(r => setTimeout(r, baseDelay * (0.6 + Math.random() * 0.8)));
  }
}
