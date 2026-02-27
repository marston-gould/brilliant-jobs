// handlers/greenhouse-legacy.js — Greenhouse Legacy Board Form Filler
// v3.0.0 STUB: To be implemented in Phase 3 (P10-B).
// boards.greenhouse.io + boards.eu.greenhouse.io
// Uses standard HTML forms with select2 dropdowns.
// Key challenge: select2-container detection + div.field containers.

import { fillTextInput } from '../fields/textInput.js';
import { fillSelect } from '../fields/dropdown.js';
import { fillSearchableDropdown, FieldFillerQueue } from '../utils/fieldFillerQueue.js';
import { uploadFile, base64ToFile } from '../utils/fileUpload.js';

async function fill({ profile, resume, preferences, fields }) {
  // TODO: Phase 3 (P10-B) implementation
  // - Map div.field containers to field types
  // - Handle select2 searchable dropdowns
  // - File upload via DataTransfer
  // - Education section repeating fields
  return {
    success: false,
    error: 'Greenhouse Legacy handler not yet implemented (Phase 3)',
    ats: 'greenhouse-legacy'
  };
}

export default { fill };
export { fill };
