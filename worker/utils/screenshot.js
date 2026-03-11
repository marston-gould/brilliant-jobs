// worker/utils/screenshot.js
// Capture page screenshot on failure, upload to Supabase Storage
// AS-1

/**
 * Capture a screenshot and upload to Supabase Storage.
 * @param {import('playwright').Page} page
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {string} userId
 * @param {string} jobId
 * @param {string} label — descriptive label (e.g. 'greenhouse-error', 'lever-captcha')
 * @returns {string|null} — storage path or null on failure
 */
export async function captureFailureScreenshot(page, sb, userId, jobId, label) {
  try {
    const timestamp = Date.now();
    const filename = `${label}-${jobId}-${timestamp}.png`;
    const storagePath = `${userId}/screenshots/${filename}`;

    const buffer = await page.screenshot({ fullPage: true, type: 'png' });

    const { error } = await sb.storage
      .from('submission-screenshots')
      .upload(storagePath, buffer, {
        contentType: 'image/png',
        upsert: false,
      });

    if (error) {
      console.warn(`[Screenshot] Upload failed: ${error.message}`);
      return null;
    }

    return storagePath;
  } catch (err) {
    console.warn(`[Screenshot] Capture failed: ${err.message}`);
    return null;
  }
}

/**
 * Get the page's current URL and visible text for error logging.
 */
export async function capturePageState(page) {
  try {
    const url = page.url();
    const title = await page.title();
    const visibleText = await page.evaluate(() => {
      const body = document.body;
      if (!body) return '';
      // Get first 500 chars of visible text for error context
      return body.innerText?.substring(0, 500) || '';
    });
    return { url, title, visibleText };
  } catch {
    return { url: 'unknown', title: 'unknown', visibleText: '' };
  }
}
