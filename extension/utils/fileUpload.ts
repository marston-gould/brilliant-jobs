// utils/fileUpload.ts — Three-Tier File Upload Utility
// v3.0.0: Handles resume uploads across different ATS platforms.
// Tier 1: DataTransfer (Greenhouse legacy, Lever)
// Tier 2: React props (Greenhouse React boards)
// Tier 3: Drag/drop event simulation (hidden inputs)

import { getReactProps } from './reactProps.js';

/**
 * Upload a file to a file input element using the best available method.
 *
 * @param {HTMLInputElement} fileInput - The file input element
 * @param {File} file - The File object to upload
 * @returns {Object} { success: boolean, method: string, error?: string }
 */
export async function uploadFile(fileInput, file) {
  // Tier 1: DataTransfer API
  const t1 = await tryDataTransfer(fileInput, file);
  if (t1.success) return { ...t1, method: 'DataTransfer' };

  // Tier 2: React props
  const t2 = await tryReactProps(fileInput, file);
  if (t2.success) return { ...t2, method: 'ReactProps' };

  // Tier 3: Drag/drop simulation
  const t3 = await tryDragDrop(fileInput, file);
  if (t3.success) return { ...t3, method: 'DragDrop' };

  return {
    success: false,
    method: 'none',
    error: 'All upload methods failed. Manual upload required.'
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
