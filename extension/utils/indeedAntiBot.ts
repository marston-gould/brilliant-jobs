// utils/indeedAntiBot.ts — Indeed Anti-Bot Hardening (Item #6)
// v5.54 / Extension 2.14.0
//
// Indeed uses advanced bot detection including:
//   - Behavioral biometrics (typing cadence, mouse patterns, scroll behavior)
//   - Request fingerprinting (timing patterns, header consistency)
//   - Canvas/WebGL fingerprint analysis
//   - Navigator property interrogation
//   - Form fill speed analysis (too-fast = bot)
//
// This module provides three hardening layers:
//   1. Randomized delays — inter-field, inter-page, pre-submit
//   2. Fingerprint masking — canvas noise, navigator property shimming
//   3. Request pattern variation — randomize field fill order, skip/revisit fields

// ============================================================
// 1. RANDOMIZED DELAYS
// ============================================================

/**
 * Generate a delay that follows a log-normal distribution,
 * mimicking real human reaction times (median ~800ms, long tail to 3s+).
 */
function humanDelay(baseMs = 800, sigma = 0.4) {
  // Box-Muller transform for normal distribution
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  // Log-normal: exp(mu + sigma * z) where mu = ln(baseMs)
  const delay = Math.exp(Math.log(baseMs) + sigma * z);
  // Clamp to reasonable range
  return Math.max(200, Math.min(delay, 8000));
}

/**
 * Delay between filling individual form fields.
 * Indeed's detection flags submissions where all fields are filled < 2s apart.
 */
function interFieldDelay() {
  return humanDelay(900, 0.5); // median ~900ms, range 200ms–5s
}

/**
 * Delay before clicking "Continue" to next page.
 * Humans review their entries. Bots click immediately.
 */
function preSubmitDelay() {
  return humanDelay(2500, 0.6); // median ~2.5s, range 500ms–8s
}

/**
 * Delay between multi-step form pages.
 * Indeed tracks time-on-page as a bot signal.
 */
function interPageDelay() {
  return humanDelay(1800, 0.5); // median ~1.8s, range 300ms–6s
}

/**
 * "Thinking" pause — inserted randomly between groups of fields.
 * Simulates a human pausing to read a question or think about an answer.
 */
function thinkingPause() {
  // 30% chance of a longer "reading" pause
  if (Math.random() < 0.3) {
    return humanDelay(3500, 0.7); // median ~3.5s reading pause
  }
  return humanDelay(600, 0.3); // quick scan
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// 2. FINGERPRINT MASKING
// ============================================================

/**
 * Apply canvas fingerprint noise.
 * Adds imperceptible pixel-level noise to canvas operations,
 * making each session's canvas fingerprint unique without
 * visibly altering rendered content.
 */
function applyCanvasNoise() {
  try {
    const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
    const origGetImageData = CanvasRenderingContext2D.prototype.getImageData;

    // Noise seed — consistent within session, unique per session
    const noiseSeed = Math.random() * 100;

    HTMLCanvasElement.prototype.toDataURL = function (...args) {
      // Only apply noise to small canvases (fingerprint probes are typically < 300px)
      if (this.width < 300 && this.height < 300) {
        const ctx = this.getContext('2d');
        if (ctx) {
          const imageData = origGetImageData.call(ctx, 0, 0, this.width, this.height);
          const data = imageData.data;
          for (let i = 0; i < data.length; i += 4) {
            // Add ±1 noise to RGB channels (imperceptible)
            const noise = ((noiseSeed + i) * 9301 + 49297) % 233280;
            data[i] += (noise % 3) - 1;     // R
            data[i + 1] += ((noise >> 2) % 3) - 1; // G
            data[i + 2] += ((noise >> 4) % 3) - 1; // B
          }
          ctx.putImageData(imageData, 0, 0);
        }
      }
      return origToDataURL.apply(this, args);
    };

    CanvasRenderingContext2D.prototype.getImageData = function (...args) {
      const imageData = origGetImageData.apply(this, args);
      // Only noise small extractions (fingerprint probes)
      if (args[2] < 300 && args[3] < 300) {
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          const noise = ((noiseSeed + i) * 9301 + 49297) % 233280;
          data[i] += (noise % 3) - 1;
          data[i + 1] += ((noise >> 2) % 3) - 1;
          data[i + 2] += ((noise >> 4) % 3) - 1;
        }
      }
      return imageData;
    };
  } catch (e) {
    // Fail silently — don't break the page
  }
}

/**
 * Apply WebGL fingerprint variation.
 * Slightly varies reported WebGL renderer/vendor strings per session.
 */
function applyWebGLNoise() {
  try {
    const origGetParameter = WebGLRenderingContext.prototype.getParameter;
    const variations = [
      '', ' ', '  ', // Whitespace variations
    ];
    const suffix = variations[Math.floor(Math.random() * variations.length)];

    WebGLRenderingContext.prototype.getParameter = function (param) {
      const result = origGetParameter.call(this, param);
      // UNMASKED_VENDOR_WEBGL = 0x9245, UNMASKED_RENDERER_WEBGL = 0x9246
      if (param === 0x9245 || param === 0x9246) {
        if (typeof result === 'string') {
          return result + suffix;
        }
      }
      return result;
    };
  } catch (e) {
    // Fail silently
  }
}

/**
 * Mask navigator properties that Indeed fingerprints.
 * Provides consistent-but-varied values per session.
 */
function shimNavigatorProps() {
  try {
    // Vary hardwareConcurrency slightly (Indeed checks this)
    const realCores = navigator.hardwareConcurrency || 8;
    const variedCores = realCores + (Math.random() < 0.5 ? 0 : (Math.random() < 0.5 ? -1 : 1));
    const clampedCores = Math.max(2, Math.min(variedCores, 32));

    Object.defineProperty(navigator, 'hardwareConcurrency', {
      get: () => clampedCores,
      configurable: true,
    });

    // Vary deviceMemory (Chrome only, but Indeed checks)
    if ('deviceMemory' in navigator) {
      const memValues = [4, 8, 8, 8, 16]; // weighted toward 8
      const variedMem = memValues[Math.floor(Math.random() * memValues.length)];
      Object.defineProperty(navigator, 'deviceMemory', {
        get: () => variedMem,
        configurable: true,
      });
    }

    // Mask webdriver flag (Chrome sets this for automated sessions)
    Object.defineProperty(navigator, 'webdriver', {
      get: () => false,
      configurable: true,
    });
  } catch (e) {
    // Fail silently
  }
}

/**
 * Apply all fingerprint masks. Call once on page load
 * BEFORE Indeed's detection scripts run.
 */
function applyFingerprintMasks() {
  applyCanvasNoise();
  applyWebGLNoise();
  shimNavigatorProps();
}

// ============================================================
// 3. REQUEST PATTERN VARIATION
// ============================================================

/**
 * Shuffle field fill order using Fisher-Yates.
 * Bots fill top-to-bottom; humans jump around.
 * Returns a new array (does not mutate input).
 */
function shuffleFieldOrder(fields) {
  const shuffled = [...fields];
  // Don't fully randomize — humans mostly go top-to-bottom with occasional jumps.
  // Strategy: keep ~70% in order, swap ~30% of adjacent pairs.
  for (let i = shuffled.length - 1; i > 0; i--) {
    if (Math.random() < 0.3) {
      const j = Math.max(0, i - Math.floor(Math.random() * 3)); // swap with nearby field
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
  }
  return shuffled;
}

/**
 * Simulate field revisiting — humans often go back to check/correct fields.
 * Returns indices of fields to "revisit" (click into then leave unchanged).
 */
function getRevisitTargets(fieldCount) {
  const revisits = [];
  // 20% chance to revisit any previously filled field
  const numRevisits = Math.random() < 0.4 ? Math.floor(Math.random() * 2) + 1 : 0;
  for (let i = 0; i < numRevisits && fieldCount > 2; i++) {
    revisits.push(Math.floor(Math.random() * fieldCount));
  }
  return revisits;
}

/**
 * Determine if we should simulate a "tab away" event.
 * Humans sometimes switch tabs mid-form (checking info, copy-pasting).
 * Returns a delay in ms if we should simulate, or 0 if not.
 */
function shouldSimulateTabAway() {
  // 10% chance per form page
  if (Math.random() < 0.1) {
    return 3000 + Math.random() * 7000; // 3–10s "away"
  }
  return 0;
}

/**
 * Fire a visibility change event to simulate tab-away behavior.
 */
function simulateTabAway(durationMs) {
  return new Promise(resolve => {
    // Dispatch visibilitychange to hidden
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    setTimeout(() => {
      // Dispatch visibilitychange back to visible
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      resolve();
    }, durationMs);
  });
}

// ============================================================
// ORCHESTRATOR — wraps a handler's fill() with anti-bot layers
// ============================================================

/**
 * Wrap the Indeed fill flow with anti-bot hardening.
 * Call this from the Indeed handler instead of raw sequential fills.
 *
 * @param {Array<{element, value, type}>} fieldActions - Fields to fill
 * @param {Function} fillField - The actual fill function for a single field
 * @param {Object} options - { preSubmitHook, postFillHook }
 */
async function hardenedFill(fieldActions, fillField, options = {}) {
  // Layer 1: Shuffle field order (mild, ~30% swaps)
  const orderedFields = shuffleFieldOrder(fieldActions);

  // Layer 2: Determine revisit targets
  const revisits = getRevisitTargets(orderedFields.length);

  // Layer 3: Fill fields with randomized delays
  for (let i = 0; i < orderedFields.length; i++) {
    const field = orderedFields[i];

    // Inter-field delay
    if (i > 0) {
      await sleep(interFieldDelay());
    }

    // Occasional thinking pause (every 3–5 fields)
    if (i > 0 && i % (3 + Math.floor(Math.random() * 3)) === 0) {
      await sleep(thinkingPause());
    }

    // Fill the field
    await fillField(field);

    // Check for revisit after this field
    if (revisits.includes(i) && i > 0) {
      await sleep(humanDelay(500, 0.3));
      // Click back into a previous field briefly (simulates checking)
      const prevField = orderedFields[Math.max(0, i - 1 - Math.floor(Math.random() * 2))];
      if (prevField.element && prevField.element.focus) {
        prevField.element.focus();
        await sleep(humanDelay(400, 0.4));
        // Move back to current position
        if (field.element && field.element.focus) {
          field.element.focus();
        }
      }
    }

    if (options.postFillHook) {
      await options.postFillHook(field, i);
    }
  }

  // Layer 4: Tab-away simulation
  const tabAwayMs = shouldSimulateTabAway();
  if (tabAwayMs > 0) {
    await simulateTabAway(tabAwayMs);
  }

  // Layer 5: Pre-submit review pause
  await sleep(preSubmitDelay());

  if (options.preSubmitHook) {
    await options.preSubmitHook();
  }
}

// ============================================================
// EXPORTS
// ============================================================

export {
  // Delay functions
  humanDelay,
  interFieldDelay,
  preSubmitDelay,
  interPageDelay,
  thinkingPause,
  sleep,

  // Fingerprint masking
  applyFingerprintMasks,
  applyCanvasNoise,
  applyWebGLNoise,
  shimNavigatorProps,

  // Request pattern variation
  shuffleFieldOrder,
  getRevisitTargets,
  shouldSimulateTabAway,
  simulateTabAway,

  // Orchestrator
  hardenedFill,
};
