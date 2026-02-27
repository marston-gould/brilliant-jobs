// utils/fileUpload.js — Three-Tier File Upload Utility
// v5.51: Item #17 — Full three-tier fallback chain:
//   Tier A: API upload (direct multipart POST to ATS upload endpoint)
//   Tier B: Form attach (DataTransfer → React props → Drag/drop)
//   Tier C: Link paste (paste a hosted resume URL into the field as last resort)
// v3.0.0: Handles resume uploads across different ATS platforms.

import { getReactProps } from './reactProps.js';

/**
 * Upload a file using the full three-tier fallback chain.
 * Tier A: Try API upload to a detected ATS upload endpoint.
 * Tier B: Try form-level attachment (DataTransfer/React/DragDrop).
 * Tier C: Paste a resume link into the nearest text field.
 *
 * @param {HTMLInputElement} fileInput - The file input element
 * @param {File} file - The File object to upload
 * @param {Object} [opts] - Optional config
 * @param {string} [opts.resumeUrl] - Hosted resume URL for Tier C fallback
 * @param {string} [opts.uploadEndpoint] - ATS API upload endpoint for Tier A
 * @param {Object} [opts.headers] - Extra headers for API upload
 * @returns {Object} { success: boolean, method: string, tier: string, error?: string }
 */
export async function uploadFile(fileInput, file, opts = {}) {
  // ── Tier A: API upload ──
  if (opts.uploadEndpoint) {
    const tA = await tryApiUpload(file, opts.uploadEndpoint, opts.headers);
    if (tA.success) return { ...tA, method: 'API', tier: 'A' };
  } else {
    // Auto-detect ATS upload endpoint from surrounding DOM
    const detectedEndpoint = detectUploadEndpoint(fileInput);
    if (detectedEndpoint) {
      const tA = await tryApiUpload(file, detectedEndpoint);
      if (tA.success) return { ...tA, method: 'API', tier: 'A' };
    }
  }

  // ── Tier B: Form attach (existing three sub-tiers) ──
  // Tier B1: DataTransfer API
  const t1 = await tryDataTransfer(fileInput, file);
  if (t1.success) return { ...t1, method: 'DataTransfer', tier: 'B' };

  // Tier B2: React props
  const t2 = await tryReactProps(fileInput, file);
  if (t2.success) return { ...t2, method: 'ReactProps', tier: 'B' };

  // Tier B3: Drag/drop simulation
  const t3 = await tryDragDrop(fileInput, file);
  if (t3.success) return { ...t3, method: 'DragDrop', tier: 'B' };

  // ── Tier C: Link paste ──
  if (opts.resumeUrl) {
    const tC = await tryLinkPaste(fileInput, opts.resumeUrl);
    if (tC.success) return { ...tC, method: 'LinkPaste', tier: 'C' };
  }

  return {
    success: false,
    method: 'none',
    tier: 'none',
    error: 'All upload tiers failed. Manual upload required.'
  };
}

/**
 * Tier 1: DataTransfer API — works on Greenhouse legacy, Lever, Ashby, Workable.
 */
async function tryDataTransfer(fileInput, file) {
  try {
    const dt = new DataTransfer();
    dt.items.add(file);
    fileInput.files = dt.files;

    // Dispatch change event
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    fileInput.dispatchEvent(new Event('input', { bubbles: true }));

    // Verify
    if (fileInput.files.length > 0 && fileInput.files[0].name === file.name) {
      return { success: true };
    }
    return { success: false };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Tier 2: React props — for Greenhouse React boards where DataTransfer is blocked.
 */
async function tryReactProps(fileInput, file) {
  try {
    const props = getReactProps(fileInput);
    if (!props?.onChange) return { success: false };

    // Build synthetic change event with file
    const syntheticEvent = {
      target: { files: [file], value: file.name },
      currentTarget: { files: [file], value: file.name },
      preventDefault: () => {},
      stopPropagation: () => {},
      nativeEvent: new Event('change'),
      type: 'change'
    };

    props.onChange(syntheticEvent);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Tier 3: Drag/drop simulation — for hidden file inputs.
 */
async function tryDragDrop(fileInput, file) {
  try {
    // Find the drop zone (often a visual container near the file input)
    const dropZone = fileInput.closest(
      '.dropzone, [class*="upload"], [class*="drop"], [class*="file"]'
    ) || fileInput.parentElement;

    if (!dropZone) return { success: false, error: 'No drop zone found' };

    const dt = new DataTransfer();
    dt.items.add(file);

    // Simulate drag sequence
    const dragenter = new DragEvent('dragenter', {
      bubbles: true,
      dataTransfer: dt
    });
    const dragover = new DragEvent('dragover', {
      bubbles: true,
      dataTransfer: dt
    });
    const drop = new DragEvent('drop', {
      bubbles: true,
      dataTransfer: dt
    });

    dropZone.dispatchEvent(dragenter);
    dropZone.dispatchEvent(dragover);
    dropZone.dispatchEvent(drop);

    // Check if file was accepted (give UI a moment to react)
    await new Promise(r => setTimeout(r, 500));

    // We can't easily verify drop success, so return true if no error
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Create a File object from a base64 string.
 * Used when resume data comes from chrome.storage.
 *
 * @param {string} base64 - Base64-encoded file content
 * @param {string} filename - File name (e.g., 'resume.pdf')
 * @param {string} mimeType - MIME type (e.g., 'application/pdf')
 * @returns {File}
 */
export function base64ToFile(base64, filename, mimeType = 'application/pdf') {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new File([byteArray], filename, { type: mimeType });
}

// ============================================================
// TIER A: API Upload (v5.51, Item #17)
// ============================================================
// Some ATS platforms accept multipart/form-data uploads via XHR.
// If we can detect the upload endpoint, we bypass DOM entirely.

async function tryApiUpload(file, endpoint, extraHeaders = {}) {
  try {
    const formData = new FormData();
    formData.append('file', file, file.name);

    const response = await fetch(endpoint, {
      method: 'POST',
      body: formData,
      headers: {
        ...extraHeaders,
        // Don't set Content-Type — browser sets multipart boundary automatically
      },
      credentials: 'include', // Send cookies for ATS session
    });

    if (response.ok) {
      return { success: true };
    }

    // Some ATS return 201 for created
    if (response.status === 201) {
      return { success: true };
    }

    return { success: false, error: `API upload returned ${response.status}` };
  } catch (err) {
    return { success: false, error: `API upload failed: ${err.message}` };
  }
}

/**
 * Auto-detect upload endpoint from the form action, XHR interceptor data,
 * or known ATS patterns.
 */
function detectUploadEndpoint(fileInput) {
  // Check form action
  const form = fileInput.closest('form');
  if (form?.action && form.enctype === 'multipart/form-data') {
    return form.action;
  }

  // Check for Workday upload endpoint in page
  const url = window.location.href;
  if (url.includes('myworkdayjobs.com')) {
    // Workday uses: /wday/cxs/{tenant}/{site}/job/{id}/apply/upload
    const match = url.match(/(https:\/\/[^/]+\/wday\/cxs\/[^/]+\/[^/]+\/job\/[^/]+)/);
    if (match) return `${match[1]}/apply/upload`;
  }

  // Check for Greenhouse upload endpoint
  if (url.includes('boards.greenhouse.io') || url.includes('job-boards.greenhouse.io')) {
    const match = url.match(/(https:\/\/[^/]+\/[^/]+\/jobs\/\d+)/);
    if (match) return `${match[1]}/resume`;
  }

  return null;
}

// ============================================================
// TIER C: Link Paste (v5.51, Item #17)
// ============================================================
// When file upload fails entirely, paste a hosted resume URL
// into the nearest text input or the "Additional information" field.

async function tryLinkPaste(fileInput, resumeUrl) {
  try {
    // Look for nearby text fields where we can paste the link
    const candidates = [
      // "Additional information" or "cover letter" textarea
      ...document.querySelectorAll(
        'textarea[name*="cover"], textarea[name*="additional"], ' +
        'textarea[data-automation-id*="additional"], textarea[placeholder*="additional"]'
      ),
      // Generic text area near the file input
      ...(fileInput.closest('form')?.querySelectorAll('textarea') || []),
      // "Website" or "Portfolio" or "LinkedIn" text input
      ...document.querySelectorAll(
        'input[name*="website"], input[name*="portfolio"], input[name*="url"], ' +
        'input[placeholder*="URL"], input[placeholder*="link"]'
      ),
    ];

    // Filter to visible elements
    const visible = [...candidates].filter(el => el.offsetParent !== null);

    if (visible.length === 0) {
      return { success: false, error: 'No text field found for link paste' };
    }

    const target = visible[0];
    const prefix = target.value ? '\n' : '';
    const linkText = `${prefix}Resume: ${resumeUrl}`;

    // Append to existing content rather than replacing
    target.value += linkText;
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));

    return { success: true };
  } catch (err) {
    return { success: false, error: `Link paste failed: ${err.message}` };
  }
}
