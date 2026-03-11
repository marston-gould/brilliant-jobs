// worker/utils/human-sim.js
// Ported from extension/human-sim.js — realistic typing + delays for headless browser
// AS-1

/**
 * Type text into a field with randomized keystroke delays.
 * @param {import('playwright').Page} page
 * @param {string} selector — CSS selector for the input
 * @param {string} text — text to type
 * @param {object} opts
 */
export async function humanType(page, selector, text, opts = {}) {
  const { minDelay = 40, maxDelay = 120, clearFirst = true } = opts;

  await page.waitForSelector(selector, { timeout: 10000 });

  if (clearFirst) {
    await page.click(selector, { clickCount: 3 });
    await page.keyboard.press('Backspace');
    await randomDelay(100, 300);
  }

  await page.focus(selector);
  await randomDelay(50, 150);

  for (const char of text) {
    await page.keyboard.type(char, { delay: randomInt(minDelay, maxDelay) });
  }

  // Blur after typing to trigger change/input events
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el) {
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
    }
  }, selector);

  await randomDelay(100, 300);
}

/**
 * Click a button or element with realistic mouse movement delay.
 */
export async function humanClick(page, selector, opts = {}) {
  const { timeout = 10000 } = opts;
  await page.waitForSelector(selector, { timeout });
  await randomDelay(200, 600);
  await page.click(selector);
  await randomDelay(100, 400);
}

/**
 * Select a dropdown option by visible text or value.
 */
export async function humanSelect(page, selector, value) {
  await page.waitForSelector(selector, { timeout: 10000 });
  await randomDelay(150, 400);

  // Try by value first, then by label
  try {
    await page.selectOption(selector, { value });
  } catch {
    try {
      await page.selectOption(selector, { label: value });
    } catch {
      // Fallback: type into the field if it's a searchable dropdown
      await humanType(page, selector, value);
    }
  }
  await randomDelay(100, 300);
}

/**
 * Upload a file to a file input.
 */
export async function humanFileUpload(page, selector, filePath) {
  await page.waitForSelector(selector, { timeout: 10000 });
  await randomDelay(300, 800);
  await page.setInputFiles(selector, filePath);
  await randomDelay(500, 1500); // Wait for upload processing
}

/**
 * Wait for a random duration within range.
 */
export function randomDelay(min, max) {
  return new Promise(resolve => setTimeout(resolve, randomInt(min, max)));
}

/**
 * Random integer between min and max (inclusive).
 */
export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Scroll page slowly to simulate reading.
 */
export async function humanScroll(page, distance = 300) {
  await randomDelay(200, 500);
  await page.evaluate((d) => window.scrollBy({ top: d, behavior: 'smooth' }), distance);
  await randomDelay(300, 800);
}
