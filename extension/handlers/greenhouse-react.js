// handlers/greenhouse-react.js — Greenhouse React Board Form Filler
// v3.0.0 STUB: To be implemented in Phase 3 (P10-B).
// job-boards.greenhouse.io + job-boards.eu.greenhouse.io
// Full React app — requires __reactProps hacking via getReactProps().
// Key challenge: React-controlled inputs ignore DOM mutations.

import { getReactProps, setReactValue } from '../utils/reactProps.js';
import { FieldFillerQueue, fillSearchableDropdown } from '../utils/fieldFillerQueue.js';
import { uploadFile, base64ToFile } from '../utils/fileUpload.js';

async function fill({ profile, resume, preferences, fields }) {
  // TODO: Phase 3 (P10-B) implementation
  // - Detect React version (__reactProps vs __reactFiber vs __reactInternalInstance)
  // - 6-step dropdown filling: clear → open → wait → scan/search → click → close
  // - Serialize via FieldFillerQueue (react-select breaks if 2 open simultaneously)
  // - Repeating education sections with numbered tracking
  // - File upload via React props fallback
  return {
    success: false,
    error: 'Greenhouse React handler not yet implemented (Phase 3)',
    ats: 'greenhouse-react'
  };
}

export default { fill };
export { fill };
