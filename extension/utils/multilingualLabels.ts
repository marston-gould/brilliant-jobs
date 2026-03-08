// utils/multilingualLabels.ts — Multilingual ATS Label Detection
// v5.40: C1 — Recognizes form field labels in EN/FR/ES/DE/IT
//
// Many international companies host ATS boards in non-English languages.
// This module maps common field labels across 5 languages to standardized
// English field keys, allowing all handlers to fill forms regardless of language.
//
// Usage:
//   import { detectFieldKey } from '../utils/multilingualLabels.ts';
//   const key = detectFieldKey(labelText); // Returns 'firstName', 'email', etc. or null
//

// ============================================================
// LANGUAGE LABEL MAPS
// ============================================================

// Each entry: fieldKey → array of regex patterns (case-insensitive)
// Patterns are ordered: most specific first, broadest last.

const MULTILINGUAL_PATTERNS = {
  // ── Personal Info ──
  firstName: [
    /^first\s*name/i,
    /^pr[eé]nom/i,                        // FR: Prénom
    /^nombre/i,                            // ES: Nombre
    /^vorname/i,                           // DE: Vorname
    /^nome(?!\s+completo)/i,               // IT: Nome (not "Nome completo")
  ],
  lastName: [
    /^last\s*name/i,
    /^(?:family|sur)\s*name/i,
    /^nom(?:\s+de\s+famille)?$/i,          // FR: Nom / Nom de famille
    /^apellidos?/i,                        // ES: Apellido(s)
    /^nachname|^familienname/i,            // DE: Nachname / Familienname
    /^cognome/i,                           // IT: Cognome
  ],
  fullName: [
    /^full\s*name/i,
    /^nom\s+complet/i,                     // FR
    /^nombre\s+completo/i,                 // ES
    /^vollst[äa]ndiger\s*name/i,           // DE
    /^nome\s+completo/i,                   // IT
  ],
  email: [
    /e-?mail/i,
    /courriel/i,                           // FR
    /correo\s*electr[oó]nico/i,            // ES
    /posta\s*elettronica/i,                // IT
  ],
  phone: [
    /phone|mobile|cell|telephone/i,
    /t[eé]l[eé]phone|num[eé]ro.*t[eé]l/i, // FR: Téléphone
    /tel[eé]fono|m[oó]vil|celular/i,       // ES: Teléfono / Móvil
    /telefon(?:nummer)?|handy|mobil/i,      // DE: Telefon / Handy
    /telefono|cellulare/i,                  // IT: Telefono / Cellulare
  ],
  address: [
    /^address|^street/i,
    /^adresse/i,                           // FR / DE
    /^direcci[oó]n/i,                      // ES
    /^indirizzo/i,                         // IT
    /^stra[ßs]e/i,                         // DE: Straße
  ],
  city: [
    /^city$/i,
    /^ville$/i,                            // FR
    /^ciudad$/i,                           // ES
    /^stadt|^ort$/i,                       // DE
    /^citt[aà]$/i,                         // IT
  ],
  state: [
    /^state|^province|^region/i,
    /^r[eé]gion|^province$/i,              // FR
    /^estado|^provincia|^regi[oó]n/i,      // ES
    /^bundesland|^kanton/i,                // DE
    /^regione|^provincia/i,                // IT
  ],
  zip: [
    /postal|zip/i,
    /code\s*postal/i,                      // FR
    /c[oó]digo\s*postal/i,                 // ES
    /postleitzahl|PLZ/i,                   // DE
    /codice\s*postale|CAP/i,               // IT
  ],
  country: [
    /^country/i,
    /^pays$/i,                             // FR
    /^pa[ií]s$/i,                          // ES
    /^land$/i,                             // DE
    /^paese$/i,                            // IT
  ],

  // ── Professional Info ──
  linkedin: [
    /linkedin/i,                           // Universal
    /profil\s*linkedin/i,                  // FR
    /perfil\s*linkedin/i,                  // ES/IT
  ],
  website: [
    /website|portfolio|personal\s*url/i,
    /site\s*web|site\s*personnel/i,        // FR
    /sitio\s*web|p[aá]gina\s*web/i,        // ES
    /webseite|homepage/i,                  // DE
    /sito\s*web/i,                         // IT
  ],
  currentTitle: [
    /job\s*title|current\s*title|position\s*title/i,
    /titre\s*du\s*poste|poste\s*actuel/i,  // FR
    /t[ií]tulo\s*(del\s*)?puesto|cargo\s*actual/i, // ES
    /aktuelle\s*position|berufsbezeichnung/i, // DE
    /titolo\s*(della\s*)?posizione|ruolo\s*attuale/i, // IT
  ],
  currentCompany: [
    /company|employer|organization/i,
    /entreprise|employeur/i,               // FR
    /empresa|empleador/i,                  // ES
    /unternehmen|arbeitgeber/i,            // DE
    /azienda|datore\s*di\s*lavoro/i,       // IT
  ],

  // ── Education ──
  school: [
    /school|university|college|institution/i,
    /[eé]cole|universit[eé]|[eé]tablissement/i, // FR
    /universidad|escuela|instituci[oó]n/i,      // ES
    /universit[aä]t|hochschule|schule/i,        // DE
    /universit[aà]|scuola|istituto/i,           // IT
  ],
  degree: [
    /^degree/i,
    /^dipl[oô]me/i,                        // FR
    /^t[ií]tulo|^grado/i,                  // ES
    /^abschluss|^studiengang/i,            // DE
    /^laurea|^titolo\s*di\s*studio/i,      // IT
  ],
  major: [
    /field\s*of\s*study|major/i,
    /domaine\s*d['']?[eé]tudes?|sp[eé]cialit[eé]/i, // FR
    /campo\s*de\s*estudio|especialidad/i,              // ES
    /studienfach|fachrichtung/i,                       // DE
    /campo\s*di\s*studio|specializzazione/i,           // IT
  ],

  // ── Experience / Dates ──
  yearsExperience: [
    /years?\s*(of\s*)?experience/i,
    /ann[eé]es?\s*d['']?exp[eé]rience/i,   // FR
    /a[nñ]os?\s*de\s*experiencia/i,         // ES
    /jahre?\s*(berufs)?erfahrung/i,         // DE
    /anni?\s*di\s*esperienza/i,             // IT
  ],
  startDate: [
    /start\s*date|begin\s*date/i,
    /date\s*de\s*d[eé]but/i,               // FR
    /fecha\s*de\s*inicio/i,                 // ES
    /startdatum|anfangsdatum|beginn/i,      // DE
    /data\s*di\s*inizio/i,                  // IT
  ],
  endDate: [
    /end\s*date/i,
    /date\s*de\s*fin/i,                    // FR
    /fecha\s*de\s*(?:fin|t[eé]rmino)/i,    // ES
    /enddatum|endet\s*am/i,                // DE
    /data\s*di\s*fine/i,                   // IT
  ],

  // ── Screening Questions (common answers) ──
  workAuthorization: [
    /authorized?\s*to\s*work|legally\s*authorized|eligib.*work/i,
    /autoris[eé]\s*[àa]\s*travailler/i,   // FR
    /autorizado.*trabajar|permiso\s*de\s*trabajo/i, // ES
    /arbeitsgenehmigung|arbeitserlaubnis/i, // DE
    /autorizzat.*lavorare|permesso\s*di\s*lavoro/i, // IT
  ],
  requireSponsorship: [
    /visa\s*sponsor|require\s*sponsor|need\s*sponsor/i,
    /parrainage\s*de\s*visa|sponsor/i,     // FR
    /patrocinio\s*de\s*visa/i,             // ES
    /visum.*sponsor|aufenthalts/i,         // DE
    /sponsor.*visto/i,                     // IT
  ],
  willingToRelocate: [
    /willing\s*to\s*relocate|open\s*to\s*relocation/i,
    /pr[eê]t.*d[eé]m[eé]nager|mobilit[eé]/i, // FR
    /dispu?esto.*mudarse|reubicaci[oó]n/i,    // ES
    /bereit.*umzuziehen|umzugsbereit/i,       // DE
    /disponibil.*trasferir/i,                  // IT
  ],
  salaryExpectation: [
    /salary|compensation|desired\s*pay|wage/i,
    /salaire|r[eé]mun[eé]ration|pr[eé]tentions?\s*salariale/i, // FR
    /salario|remuneraci[oó]n|expectativa\s*salarial/i,          // ES
    /gehalt|gehaltsvorstellung|verg[üu]tung/i,                  // DE
    /stipendio|retribuzione|aspettativa\s*salariale/i,          // IT
  ],
  howDidYouHear: [
    /how\s*did\s*you\s*hear|referral|source/i,
    /comment\s*avez-vous\s*(connu|entendu)/i,  // FR
    /c[oó]mo\s*(se\s*enter[oó]|nos\s*conoci[oó])/i, // ES
    /wie\s*haben\s*Sie\s*(von\s*uns\s*)?erfahren/i,  // DE
    /come\s*(ha|hai)\s*(conosciuto|saputo)/i,         // IT
  ],
};

// ============================================================
// DETECTION FUNCTION
// ============================================================

/**
 * Detect the standardized field key from a label string.
 * Checks against all 5 languages.
 *
 * @param {string} label - The raw label text from the form
 * @returns {string|null} - The field key (e.g. 'firstName', 'email') or null if no match
 */
export function detectFieldKey(label) {
  if (!label || typeof label !== 'string') return null;

  const trimmed = label.trim();
  if (!trimmed) return null;

  for (const [fieldKey, patterns] of Object.entries(MULTILINGUAL_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(trimmed)) {
        return fieldKey;
      }
    }
  }

  return null;
}

/**
 * Get the value for a detected field key from a profile object.
 *
 * @param {string} fieldKey - The key returned by detectFieldKey
 * @param {Object} profile - User profile data
 * @param {Object} preferences - User preferences (for screening questions)
 * @returns {string|null} - The value to fill, or null
 */
export function getFieldValue(fieldKey, profile, preferences = {}) {
  const FIELD_VALUE_MAP = {
    firstName: () => profile.firstName,
    lastName: () => profile.lastName,
    fullName: () => [profile.firstName, profile.lastName].filter(Boolean).join(' '),
    email: () => profile.email,
    phone: () => profile.phone,
    address: () => profile.address,
    city: () => profile.city,
    state: () => profile.state,
    zip: () => profile.zip,
    country: () => profile.country || 'United States',
    linkedin: () => profile.linkedin,
    website: () => profile.portfolio || profile.website,
    currentTitle: () => profile.currentTitle,
    currentCompany: () => profile.currentCompany,
    school: () => profile.school,
    degree: () => profile.degree,
    major: () => profile.major,
    yearsExperience: () => profile.yearsExperience,
    startDate: () => preferences.startDate || '',
    endDate: () => '',
    workAuthorization: () => preferences.workAuthorization || 'Yes',
    requireSponsorship: () => preferences.requireSponsorship || 'No',
    willingToRelocate: () => preferences.willingToRelocate || 'Yes',
    salaryExpectation: () => preferences.salaryExpectation,
    howDidYouHear: () => 'Job Board',
  };

  const getter = FIELD_VALUE_MAP[fieldKey];
  if (!getter) return null;

  const val = getter();
  return val || null;
}

/**
 * Convenience: detect + resolve in one call.
 * Returns { fieldKey, value } or null.
 */
export function matchMultilingualLabel(label, profile, preferences = {}) {
  const fieldKey = detectFieldKey(label);
  if (!fieldKey) return null;

  const value = getFieldValue(fieldKey, profile, preferences);
  if (!value) return null;

  return { fieldKey, value };
}
