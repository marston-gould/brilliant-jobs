// shared/algorithms/form-field-detection.js
// Form Field Detection Algorithm - Semantic understanding of job application forms

/**
 * FORM FIELD DETECTION ALGORITHM
 * ================================
 *
 * The goal: Take ANY job application form and semantically understand
 * what each field is asking for, regardless of how it's labeled or structured.
 *
 * Core Philosophy:
 * - Multiple signals > single selector
 * - Confidence scoring > binary matching
 * - Graceful degradation > hard failures
 */

// ============================================================================
// PART 1: STANDARD FIELD TAXONOMY
// ============================================================================

/**
 * Define the universe of fields we expect in job applications.
 * Each field has synonyms, validation rules, and data sources.
 */
export const FIELD_TAXONOMY = {
  // Personal Information
  firstName: {
    category: 'personal',
    synonyms: ['first name', 'given name', 'forename', 'first', 'fname'],
    patterns: [/first[-_]?name/i, /fname/i, /given[-_]?name/i],
    inputTypes: ['text'],
    maxLength: 50,
    required: true,
  },
  lastName: {
    category: 'personal',
    synonyms: ['last name', 'surname', 'family name', 'last', 'lname'],
    patterns: [/last[-_]?name/i, /lname/i, /surname/i, /family[-_]?name/i],
    inputTypes: ['text'],
    maxLength: 50,
    required: true,
  },
  fullName: {
    category: 'personal',
    synonyms: ['full name', 'name', 'your name', 'candidate name'],
    patterns: [/^name$/i, /full[-_]?name/i, /your[-_]?name/i],
    inputTypes: ['text'],
    maxLength: 100,
    required: true,
    composite: ['firstName', 'lastName'],
  },
  email: {
    category: 'contact',
    synonyms: ['email', 'email address', 'e-mail', 'mail'],
    patterns: [/e?-?mail/i, /email[-_]?address/i],
    inputTypes: ['email', 'text'],
    validation: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    required: true,
  },
  phone: {
    category: 'contact',
    synonyms: ['phone', 'phone number', 'telephone', 'mobile', 'cell'],
    patterns: [/phone/i, /tel/i, /mobile/i, /cell/i],
    inputTypes: ['tel', 'text'],
    required: false,
  },
  linkedIn: {
    category: 'social',
    synonyms: ['linkedin', 'linkedin url', 'linkedin profile'],
    patterns: [/linkedin/i, /li[-_]?url/i],
    inputTypes: ['url', 'text'],
    validation: /linkedin\.com/i,
    required: false,
  },
  portfolio: {
    category: 'social',
    synonyms: ['portfolio', 'website', 'personal site', 'work samples'],
    patterns: [/portfolio/i, /website/i, /personal[-_]?site/i],
    inputTypes: ['url', 'text'],
    required: false,
  },
  github: {
    category: 'social',
    synonyms: ['github', 'github url', 'github profile'],
    patterns: [/github/i, /gh[-_]?url/i],
    inputTypes: ['url', 'text'],
    validation: /github\.com/i,
    required: false,
  },

  // Location
  location: {
    category: 'location',
    synonyms: ['location', 'city', 'where are you located'],
    patterns: [/location/i, /city/i, /where/i],
    inputTypes: ['text'],
    required: false,
  },
  address: {
    category: 'location',
    synonyms: ['address', 'street address', 'mailing address'],
    patterns: [/address/i, /street/i],
    inputTypes: ['text', 'textarea'],
    required: false,
  },
  country: {
    category: 'location',
    synonyms: ['country', 'nation'],
    patterns: [/country/i, /nation/i],
    inputTypes: ['select', 'text'],
    required: false,
  },
  state: {
    category: 'location',
    synonyms: ['state', 'province', 'region'],
    patterns: [/state/i, /province/i, /region/i],
    inputTypes: ['select', 'text'],
    required: false,
  },
  zipCode: {
    category: 'location',
    synonyms: ['zip', 'zip code', 'postal code', 'postcode'],
    patterns: [/zip/i, /postal/i, /postcode/i],
    inputTypes: ['text'],
    required: false,
  },

  // Documents
  resume: {
    category: 'documents',
    synonyms: ['resume', 'cv', 'curriculum vitae'],
    patterns: [/resume/i, /cv/i, /curriculum/i],
    inputTypes: ['file'],
    acceptedFormats: ['.pdf', '.doc', '.docx'],
    required: true,
  },
  coverLetter: {
    category: 'documents',
    synonyms: ['cover letter', 'covering letter', 'letter of interest'],
    patterns: [/cover[-_]?letter/i, /covering/i, /letter[-_]?of[-_]?interest/i],
    inputTypes: ['file', 'textarea'],
    required: false,
  },

  // Work Authorization
  workAuthorization: {
    category: 'legal',
    synonyms: ['work authorization', 'authorized to work', 'legally authorized'],
    patterns: [/work[-_]?auth/i, /authorized[-_]?to[-_]?work/i, /legally[-_]?auth/i],
    inputTypes: ['select', 'radio', 'checkbox'],
    required: false,
  },
  sponsorship: {
    category: 'legal',
    synonyms: ['sponsorship', 'visa sponsorship', 'require sponsorship'],
    patterns: [/sponsor/i, /visa/i],
    inputTypes: ['select', 'radio', 'checkbox'],
    required: false,
  },

  // Experience
  yearsExperience: {
    category: 'experience',
    synonyms: ['years of experience', 'experience level', 'how many years'],
    patterns: [/years?[-_]?(of[-_]?)?exp/i, /experience[-_]?level/i],
    inputTypes: ['select', 'number', 'text'],
    required: false,
  },
  currentCompany: {
    category: 'experience',
    synonyms: ['current company', 'current employer', 'where do you work'],
    patterns: [/current[-_]?(company|employer)/i],
    inputTypes: ['text'],
    required: false,
  },
  currentTitle: {
    category: 'experience',
    synonyms: ['current title', 'current role', 'job title'],
    patterns: [/current[-_]?(title|role|position)/i, /job[-_]?title/i],
    inputTypes: ['text'],
    required: false,
  },

  // Compensation
  salaryExpectation: {
    category: 'compensation',
    synonyms: ['salary expectation', 'expected salary', 'desired compensation'],
    patterns: [/salary/i, /compensation/i, /pay[-_]?expect/i],
    inputTypes: ['text', 'number', 'select'],
    required: false,
  },

  // Availability
  startDate: {
    category: 'availability',
    synonyms: ['start date', 'when can you start', 'availability'],
    patterns: [/start[-_]?date/i, /when[-_]?can[-_]?you[-_]?start/i, /availability/i],
    inputTypes: ['date', 'text', 'select'],
    required: false,
  },

  // Open-ended
  whyInterested: {
    category: 'questions',
    synonyms: ['why interested', 'why this role', 'why do you want'],
    patterns: [/why[-_]?(are[-_]?you[-_]?)?interested/i, /why[-_]?this[-_]?(role|company|job)/i],
    inputTypes: ['textarea'],
    required: false,
    useCoverLetter: true,
  },
  additionalInfo: {
    category: 'questions',
    synonyms: ['additional information', 'anything else', 'other information'],
    patterns: [/additional/i, /anything[-_]?else/i, /other[-_]?info/i],
    inputTypes: ['textarea'],
    required: false,
  },

  // Demographics (often optional)
  gender: {
    category: 'demographics',
    synonyms: ['gender', 'sex'],
    patterns: [/gender/i, /^sex$/i],
    inputTypes: ['select', 'radio'],
    required: false,
    sensitive: true,
  },
  ethnicity: {
    category: 'demographics',
    synonyms: ['ethnicity', 'race', 'ethnic background'],
    patterns: [/ethnic/i, /race/i],
    inputTypes: ['select', 'radio', 'checkbox'],
    required: false,
    sensitive: true,
  },
  veteranStatus: {
    category: 'demographics',
    synonyms: ['veteran', 'military', 'armed forces'],
    patterns: [/veteran/i, /military/i],
    inputTypes: ['select', 'radio'],
    required: false,
    sensitive: true,
  },
  disabilityStatus: {
    category: 'demographics',
    synonyms: ['disability', 'disabled', 'accommodation'],
    patterns: [/disab/i, /accommodation/i],
    inputTypes: ['select', 'radio'],
    required: false,
    sensitive: true,
  },
};

// ============================================================================
// PART 2: SIGNAL EXTRACTION
// ============================================================================

/**
 * Extract all possible signals from a form field that could indicate its purpose
 * @param {Object} accessibilityTree - The accessibility tree from read_page
 * @param {string} elementRef - The ref_id of the element
 * @returns {Object} FieldSignals object
 */
export function extractFieldSignals(accessibilityTree, elementRef) {
  const node = findNodeByRef(accessibilityTree, elementRef);
  if (!node) throw new Error(`Element ${elementRef} not found`);

  return {
    // Direct attributes
    id: node.attributes?.id || null,
    name: node.attributes?.name || null,
    type: node.role || node.attributes?.type || 'text',
    placeholder: node.attributes?.placeholder || null,
    autocomplete: node.attributes?.autocomplete || null,

    // Accessibility
    ariaLabel: node.attributes?.['aria-label'] || null,
    ariaDescribedBy: getDescribedByText(accessibilityTree, node),

    // Associated elements
    labelText: findAssociatedLabel(accessibilityTree, node),
    labelFor: null,

    // Contextual
    nearbyText: extractNearbyText(accessibilityTree, node, 100),
    siblingLabels: extractSiblingLabels(accessibilityTree, node),
    parentFieldsetLegend: findParentFieldsetLegend(accessibilityTree, node),
    sectionHeading: findSectionHeading(accessibilityTree, node),

    // Structural
    inputIndex: getInputIndex(accessibilityTree, node),
    isRequired: node.attributes?.required === 'true' ||
                node.attributes?.['aria-required'] === 'true',
    validationPattern: node.attributes?.pattern || null,

    // For selects
    optionValues: extractOptionValues(node),
    optionTexts: extractOptionTexts(node),

    // For file inputs
    acceptAttribute: node.attributes?.accept || null,

    // Element reference for later interaction
    elementRef,
  };
}

// ============================================================================
// PART 3: CONFIDENCE SCORING
// ============================================================================

/**
 * Calculate confidence score for a field matching a taxonomy entry
 * @param {Object} signals - Field signals
 * @param {string} fieldType - Field type from taxonomy
 * @returns {Object} FieldMatch object
 */
export function calculateFieldConfidence(signals, fieldType) {
  const taxonomy = FIELD_TAXONOMY[fieldType];
  if (!taxonomy) return { fieldType, confidence: 0, signals: [], elementRef: signals.elementRef };

  let score = 0;
  const matchedSignals = [];

  // ---- STRONG SIGNALS (0.3-0.4 each) ----

  // Autocomplete attribute is highest signal (browsers standardize this)
  if (signals.autocomplete) {
    const autocompleteMap = {
      'given-name': ['firstName'],
      'family-name': ['lastName'],
      'name': ['fullName'],
      'email': ['email'],
      'tel': ['phone'],
      'url': ['linkedIn', 'portfolio', 'github'],
      'street-address': ['address'],
      'country': ['country'],
      'postal-code': ['zipCode'],
    };
    if (autocompleteMap[signals.autocomplete]?.includes(fieldType)) {
      score += 0.4;
      matchedSignals.push(`autocomplete="${signals.autocomplete}"`);
    }
  }

  // Pattern matching on id/name (very reliable)
  const idNameText = `${signals.id || ''} ${signals.name || ''}`.toLowerCase();
  for (const pattern of taxonomy.patterns) {
    if (pattern.test(idNameText)) {
      score += 0.35;
      matchedSignals.push(`id/name pattern: ${pattern}`);
      break;
    }
  }

  // ---- MEDIUM SIGNALS (0.15-0.25 each) ----

  // Label text matching
  if (signals.labelText) {
    const labelLower = signals.labelText.toLowerCase();
    for (const synonym of taxonomy.synonyms) {
      if (labelLower.includes(synonym)) {
        score += 0.25;
        matchedSignals.push(`label contains "${synonym}"`);
        break;
      }
    }
  }

  // Aria-label matching
  if (signals.ariaLabel) {
    const ariaLower = signals.ariaLabel.toLowerCase();
    for (const synonym of taxonomy.synonyms) {
      if (ariaLower.includes(synonym)) {
        score += 0.2;
        matchedSignals.push(`aria-label contains "${synonym}"`);
        break;
      }
    }
  }

  // Placeholder matching
  if (signals.placeholder) {
    const placeholderLower = signals.placeholder.toLowerCase();
    for (const synonym of taxonomy.synonyms) {
      if (placeholderLower.includes(synonym)) {
        score += 0.15;
        matchedSignals.push(`placeholder contains "${synonym}"`);
        break;
      }
    }
  }

  // ---- WEAK SIGNALS (0.05-0.1 each) ----

  // Input type matching
  if (taxonomy.inputTypes.includes(signals.type)) {
    score += 0.1;
    matchedSignals.push(`input type matches: ${signals.type}`);
  }

  // Nearby text
  const nearbyTextJoined = signals.nearbyText.join(' ').toLowerCase();
  for (const synonym of taxonomy.synonyms) {
    if (nearbyTextJoined.includes(synonym)) {
      score += 0.05;
      matchedSignals.push(`nearby text contains "${synonym}"`);
      break;
    }
  }

  // Section heading context
  if (signals.sectionHeading) {
    const headingLower = signals.sectionHeading.toLowerCase();
    const categoryMap = {
      'personal': ['personal', 'about you', 'your information', 'contact'],
      'contact': ['contact', 'reach you', 'get in touch'],
      'experience': ['experience', 'work history', 'employment'],
      'documents': ['documents', 'attachments', 'upload', 'resume'],
      'legal': ['legal', 'authorization', 'eligibility'],
    };

    if (categoryMap[taxonomy.category]?.some(kw => headingLower.includes(kw))) {
      score += 0.05;
      matchedSignals.push(`section heading matches category`);
    }
  }

  // ---- POSITION HEURISTICS ----

  // First name usually comes before last name
  if (fieldType === 'firstName' && signals.inputIndex === 0) {
    score += 0.05;
    matchedSignals.push('first position (firstName heuristic)');
  }
  if (fieldType === 'lastName' && signals.inputIndex === 1) {
    score += 0.05;
    matchedSignals.push('second position (lastName heuristic)');
  }

  // Email usually has email type
  if (fieldType === 'email' && signals.type === 'email') {
    score += 0.15;
    matchedSignals.push('email input type');
  }

  // File inputs for documents
  if (['resume', 'coverLetter'].includes(fieldType) && signals.type === 'file') {
    score += 0.2;
    matchedSignals.push('file input type');
  }

  // Cap at 1.0
  return {
    fieldType,
    confidence: Math.min(score, 1.0),
    signals: matchedSignals,
    elementRef: signals.elementRef,
  };
}

// ============================================================================
// PART 4: FORM ANALYSIS ENGINE
// ============================================================================

/**
 * Main entry point: Analyze a form and return semantic field mappings
 * @param {Object} accessibilityTree - The accessibility tree from read_page
 * @returns {Promise<Object>} FormAnalysis object
 */
export async function analyzeForm(accessibilityTree) {
  // Step 1: Find all form inputs
  const inputElements = findAllInputElements(accessibilityTree);

  // Step 2: Extract signals for each input
  const fieldSignals = inputElements.map(ref =>
    extractFieldSignals(accessibilityTree, ref)
  );

  // Step 3: Score each input against all possible field types
  const allMatches = new Map();

  for (const signals of fieldSignals) {
    const matches = [];

    for (const fieldType of Object.keys(FIELD_TAXONOMY)) {
      const match = calculateFieldConfidence(signals, fieldType);
      if (match.confidence > 0.1) {
        matches.push(match);
      }
    }

    // Sort by confidence descending
    matches.sort((a, b) => b.confidence - a.confidence);
    allMatches.set(signals.elementRef, matches);
  }

  // Step 4: Resolve conflicts (same field type matched by multiple inputs)
  const fieldMappings = resolveFieldConflicts(allMatches, fieldSignals);

  // Step 5: Calculate overall confidence and warnings
  const warnings = [];
  const mappedFields = fieldMappings.filter(f => f.fieldType !== 'unknown');
  const avgConfidence = mappedFields.reduce((sum, f) => sum + f.confidence, 0)
                        / mappedFields.length || 0;

  // Check for missing critical fields
  const mappedTypes = new Set(mappedFields.map(f => f.fieldType));
  const criticalFields = ['email', 'resume'];
  for (const critical of criticalFields) {
    if (!mappedTypes.has(critical)) {
      warnings.push(`Missing critical field: ${critical}`);
    }
  }

  // Check for low confidence mappings
  const lowConfidenceFields = mappedFields.filter(f => f.confidence < 0.4);
  if (lowConfidenceFields.length > 0) {
    warnings.push(`${lowConfidenceFields.length} fields have low confidence mappings`);
  }

  // Determine overall confidence level
  let overallConfidence;
  if (avgConfidence > 0.7 && warnings.length === 0) {
    overallConfidence = 'high';
  } else if (avgConfidence > 0.4 && warnings.length <= 2) {
    overallConfidence = 'medium';
  } else {
    overallConfidence = 'low';
  }

  // Determine strategy
  let suggestedStrategy;
  if (overallConfidence === 'high') {
    suggestedStrategy = 'auto_fill';
  } else if (overallConfidence === 'medium') {
    suggestedStrategy = 'assisted';
  } else {
    suggestedStrategy = 'manual';
  }

  return {
    fields: fieldMappings,
    unmappedElements: fieldMappings
      .filter(f => f.fieldType === 'unknown')
      .map(f => f.elementRef),
    confidence: overallConfidence,
    warnings,
    suggestedStrategy,
  };
}

/**
 * Resolve cases where multiple inputs match the same field type
 */
function resolveFieldConflicts(allMatches, fieldSignals) {
  const result = [];
  const assignedTypes = new Set();
  const signalsMap = new Map(fieldSignals.map(s => [s.elementRef, s]));

  // First pass: assign high-confidence unique matches
  for (const [elementRef, matches] of allMatches) {
    if (matches.length > 0 && matches[0].confidence > 0.6) {
      const topMatch = matches[0];
      if (!assignedTypes.has(topMatch.fieldType)) {
        result.push({
          elementRef,
          fieldType: topMatch.fieldType,
          confidence: topMatch.confidence,
          alternativeMappings: matches.slice(1, 3),
          isRequired: signalsMap.get(elementRef)?.isRequired || false,
        });
        assignedTypes.add(topMatch.fieldType);
      }
    }
  }

  // Second pass: assign remaining fields
  for (const [elementRef, matches] of allMatches) {
    if (result.some(r => r.elementRef === elementRef)) continue;

    // Find best unassigned match
    const availableMatches = matches.filter(m => !assignedTypes.has(m.fieldType));

    if (availableMatches.length > 0 && availableMatches[0].confidence > 0.2) {
      const topMatch = availableMatches[0];
      result.push({
        elementRef,
        fieldType: topMatch.fieldType,
        confidence: topMatch.confidence,
        alternativeMappings: availableMatches.slice(1, 3),
        isRequired: signalsMap.get(elementRef)?.isRequired || false,
      });
      assignedTypes.add(topMatch.fieldType);
    } else {
      // Unknown field
      result.push({
        elementRef,
        fieldType: 'unknown',
        confidence: 0,
        alternativeMappings: matches.slice(0, 3),
        isRequired: signalsMap.get(elementRef)?.isRequired || false,
      });
    }
  }

  return result;
}

// ============================================================================
// PART 5: LLM FALLBACK FOR AMBIGUOUS FIELDS
// ============================================================================

/**
 * When algorithmic matching fails, use LLM to interpret the field
 * @param {Object} signals - Field signals
 * @param {Object} contextualInfo - Page context
 * @param {Function} llmCallback - Function to call LLM
 * @returns {Promise<Object>} FieldMatch object
 */
export async function llmFieldAnalysis(signals, contextualInfo, llmCallback) {
  const prompt = `
You are analyzing a job application form field. Based on the following signals,
determine what information this field is asking for.

## Field Signals
- Label: ${signals.labelText || 'None'}
- Placeholder: ${signals.placeholder || 'None'}
- ID: ${signals.id || 'None'}
- Name: ${signals.name || 'None'}
- Input Type: ${signals.type}
- Aria Label: ${signals.ariaLabel || 'None'}
- Nearby Text: ${signals.nearbyText.join(', ') || 'None'}
- Section Heading: ${signals.sectionHeading || 'None'}
${signals.optionTexts.length > 0 ? `- Options: ${signals.optionTexts.join(', ')}` : ''}

## Context
- Company: ${contextualInfo.companyName}
- Job Title: ${contextualInfo.jobTitle}
- Form Purpose: ${contextualInfo.formPurpose}

## Task
1. Identify what information this field is requesting
2. Map it to one of these standard fields: ${Object.keys(FIELD_TAXONOMY).join(', ')}
3. If it doesn't match any standard field, respond with "custom"
4. Rate your confidence (0.0-1.0)

Respond in JSON format:
{
  "fieldType": "string",
  "confidence": number,
  "reasoning": "string"
}`;

  try {
    const response = await llmCallback(prompt);
    return {
      fieldType: response.fieldType,
      confidence: response.confidence,
      signals: [`LLM analysis: ${response.reasoning}`],
      elementRef: signals.elementRef,
    };
  } catch (error) {
    return {
      fieldType: 'unknown',
      confidence: 0,
      signals: ['LLM analysis failed'],
      elementRef: signals.elementRef,
    };
  }
}

// ============================================================================
// PART 6: HELPER FUNCTIONS
// ============================================================================

function findNodeByRef(tree, ref) {
  if (tree.ref === ref) return tree;
  for (const child of tree.children || []) {
    const found = findNodeByRef(child, ref);
    if (found) return found;
  }
  return null;
}

function findAllInputElements(tree) {
  const inputs = [];
  const inputRoles = ['textbox', 'combobox', 'listbox', 'checkbox', 'radio', 'spinbutton'];

  function traverse(node) {
    if (inputRoles.includes(node.role) ||
        node.attributes?.type === 'file' ||
        (node.role === 'button' && node.attributes?.type === 'submit')) {
      if (node.ref) inputs.push(node.ref);
    }
    for (const child of node.children || []) {
      traverse(child);
    }
  }

  traverse(tree);
  return inputs;
}

function findAssociatedLabel(tree, node) {
  // Check for aria-labelledby
  const labelledBy = node.attributes?.['aria-labelledby'];
  if (labelledBy) {
    const labelNode = findNodeByRef(tree, labelledBy);
    if (labelNode?.name) return labelNode.name;
  }

  // Check for label element with matching 'for' attribute
  if (node.attributes?.id) {
    const labelNode = findLabelFor(tree, node.attributes.id);
    if (labelNode?.name) return labelNode.name;
  }

  return node.name || null;
}

function findLabelFor(tree, forId) {
  function traverse(node) {
    if (node.role === 'label' && node.attributes?.for === forId) {
      return node;
    }
    for (const child of node.children || []) {
      const found = traverse(child);
      if (found) return found;
    }
    return null;
  }
  return traverse(tree);
}

function getDescribedByText(tree, node) {
  const describedBy = node.attributes?.['aria-describedby'];
  if (!describedBy) return null;

  const descNode = findNodeByRef(tree, describedBy);
  return descNode?.name || null;
}

function extractNearbyText(tree, node, pxRadius) {
  // Simplified: Return sibling text nodes
  return [];
}

function extractSiblingLabels(tree, node) {
  return [];
}

function findParentFieldsetLegend(tree, node) {
  return null;
}

function findSectionHeading(tree, node) {
  return null;
}

function getInputIndex(tree, node) {
  const allInputs = findAllInputElements(tree);
  return allInputs.indexOf(node.ref || '');
}

function extractOptionValues(node) {
  if (node.role !== 'combobox' && node.role !== 'listbox') return [];
  return (node.children || [])
    .filter(c => c.role === 'option')
    .map(c => c.attributes?.value || '')
    .filter(Boolean);
}

function extractOptionTexts(node) {
  if (node.role !== 'combobox' && node.role !== 'listbox') return [];
  return (node.children || [])
    .filter(c => c.role === 'option')
    .map(c => c.name || '')
    .filter(Boolean);
}

export default {
  FIELD_TAXONOMY,
  extractFieldSignals,
  calculateFieldConfidence,
  analyzeForm,
  llmFieldAnalysis,
};
