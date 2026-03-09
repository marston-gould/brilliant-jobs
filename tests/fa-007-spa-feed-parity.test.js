/**
 * FA-007: SPA useFeedSearch.ts Full Parity Tests
 *
 * Validates that the SPA buildFilterQuery produces identical Supabase
 * PostgREST query parameters as the legacy job-feed.js buildFilterQuery.
 *
 * Strategy: Mock the Supabase query builder to capture all chained method
 * calls, then compare SPA vs legacy output for identical inputs.
 */

// ── Mock Supabase query builder ──────────────────────────────

function createMockQuery() {
  const calls = [];

  const proxy = new Proxy({}, {
    get(target, prop) {
      if (prop === '_calls') return calls;
      if (prop === '_serialize') return () => JSON.stringify(calls);
      // Return a function that records the call and returns the proxy for chaining
      return function (...args) {
        calls.push({ method: prop, args });
        return proxy;
      };
    },
  });

  return proxy;
}

// ── Helpers ──────────────────────────────────────────────────

function buildLegacyFilterQuery(sf, baseQuery, locationIds) {
  /**
   * Extracted legacy buildFilterQuery logic from js/job-feed.js
   * This is the reference implementation all SPA queries must match.
   */
  let query = baseQuery;
  const _contentSearchEnabled = sf._testContentSearch || false;

  // Always filter to active/open jobs only
  query = query.eq('status', 'open');

  const w = sf.whatPills || sf.pills || [];
  const wnot = sf.whatNotPills || [];
  const tuning = sf._testTuning || {};

  // WHAT — title + content_tsv
  const allWhatClauses = w.flatMap(pill => {
    return pill.values.flatMap(v => {
      const safe = v.replace(/[,()]/g, '').trim();
      if (!safe) return [];
      if (_contentSearchEnabled) {
        return [`title.ilike.%${safe}%`, `content_tsv.wfts(english).${safe}`];
      }
      return [`title.ilike.%${safe}%`];
    });
  });
  if (allWhatClauses.length > 0) query = query.or(allWhatClauses.join(','));

  // WHAT NOT — title + content_tsv (FA-001/FA-002 NULL-safe)
  for (const pill of wnot) {
    for (const v of pill.values) {
      const term = v.trim().replace(/^nor\s+/i, '');
      if (term) {
        query = query.not('title', 'ilike', `%${term}%`);
        if (_contentSearchEnabled) {
          query = query.or(`not.content_tsv.wfts(english).${term},content_tsv.is.null`);
        }
      }
    }
  }

  // Global title exclusions
  for (const pill of (tuning.titleExcludes || [])) {
    for (const v of (pill.values || [])) {
      query = query.not('title', 'ilike', `%${v}%`);
      if (_contentSearchEnabled) {
        query = query.or(`not.content_tsv.wfts(english).${v},content_tsv.is.null`);
      }
    }
  }

  // Hourly exclusion
  if (tuning.excludeHourly) {
    query = query.not('salary_rate', 'eq', 'hr');
  }

  // Staffing exclusion
  if (tuning.excludeStaffing) {
    query = query.neq('is_staffing_agency', true);
  }

  // WHO NOT
  const wonot = sf.whoNotPills || [];
  for (const pill of wonot) {
    for (const v of pill.values) {
      const term = v.trim().replace(/^nor\s+/i, '');
      if (term) query = query.not('company_name', 'ilike', `%${term}%`);
    }
  }

  // Industry exclusions
  const indExcludes = (tuning.industryExcludes || [])
    .map(p => typeof p === 'string' ? p : (p.values ? p.values[0] : p))
    .filter(Boolean);
  for (const ind of indExcludes) {
    query = query.not('industry', 'ilike', `%${ind}%`);
  }

  // PAY — pill.min/pill.max with overlap logic
  const pay = sf.payPills || [];
  if (pay.length > 0) {
    const pill = pay[0];
    const minVal = pill.min;
    const maxVal = pill.max;
    const includeNoSalary = sf.includeNoSalary !== false;

    if (minVal && maxVal) {
      if (includeNoSalary) {
        query = query.or(`and(salary_max.gte.${minVal},salary_min.lte.${maxVal}),salary_min.is.null`);
      } else {
        query = query.gte('salary_max', minVal).lte('salary_min', maxVal);
      }
    } else if (minVal) {
      if (includeNoSalary) {
        query = query.or(`salary_max.gte.${minVal},salary_min.is.null`);
      } else {
        query = query.gte('salary_max', minVal);
      }
    } else if (maxVal) {
      if (includeNoSalary) {
        query = query.or(`salary_min.lte.${maxVal},salary_min.is.null`);
      } else {
        query = query.lte('salary_min', maxVal);
      }
    }
  }

  // SKILLS — extracted_skills.cs
  const sk = sf.skillsPills || [];
  for (const pill of sk) {
    const terms = pill.values.map(v => v.trim().toLowerCase()).filter(Boolean);
    if (terms.length > 0) {
      query = query.or(terms.map(t => `extracted_skills.cs.{${t}}`).join(','));
    }
  }

  // LEVEL — extracted_seniority
  const lv = sf.levelPills || [];
  if (lv.length > 0) {
    const levels = lv.flatMap(p => p.values.map(v => v.trim().toLowerCase())).filter(Boolean);
    if (levels.length === 1) {
      query = query.eq('extracted_seniority', levels[0]);
    } else if (levels.length > 1) {
      query = query.in('extracted_seniority', levels);
    }
  }

  // JD — content_tsv
  const jd = sf.jdPills || [];
  for (const pill of jd) {
    for (const v of pill.values) {
      const safe = v.replace(/[,()]/g, '').trim();
      if (safe) {
        query = query.textSearch('content_tsv', safe, { type: 'websearch', config: 'english' });
      }
    }
  }

  // DEPARTMENT — extracted_department
  const dp = sf.deptPills || [];
  if (dp.length > 0) {
    const depts = dp.flatMap(p => p.values.map(v => v.trim().toLowerCase())).filter(Boolean);
    if (depts.length === 1) {
      query = query.eq('extracted_department', depts[0]);
    } else if (depts.length > 1) {
      query = query.in('extracted_department', depts);
    }
  }

  return query;
}

// SPA buildFilterQuery (extracted from useFeedSearch.ts to run in Node)
function buildSpaFilterQuery(sf, baseQuery, locationIds, tuning, contentSearchEnabled) {
  let query = baseQuery;

  // FA-007: Always filter to active/open jobs only
  query = query.eq('status', 'open');

  // What pills
  const whatPills = sf.whatPills || sf.pills || [];
  const allWhatClauses = whatPills.flatMap(pill => {
    return pill.values.flatMap(v => {
      const safe = v.replace(/[,()]/g, '').trim();
      if (!safe) return [];
      if (contentSearchEnabled) {
        return [`title.ilike.%${safe}%`, `content_tsv.wfts(english).${safe}`];
      }
      return [`title.ilike.%${safe}%`];
    });
  });
  if (allWhatClauses.length > 0) query = query.or(allWhatClauses.join(','));

  // What NOT pills — FA-001 content_tsv negation + NULL-safe
  const whatNotPills = sf.whatNotPills || [];
  for (const pill of whatNotPills) {
    for (const v of pill.values) {
      const term = v.trim().replace(/^nor\s+/i, '');
      if (term) {
        query = query.not('title', 'ilike', `%${term}%`);
        if (contentSearchEnabled) {
          query = query.or(`not.content_tsv.wfts(english).${term},content_tsv.is.null`);
        }
      }
    }
  }

  // Title exclusions + content negation
  const titleExcludes = (tuning.titleExcludes || []);
  for (const pill of titleExcludes) {
    for (const v of pill.values) {
      if (v.trim()) {
        query = query.not('title', 'ilike', `%${v.trim()}%`);
        if (contentSearchEnabled) {
          query = query.or(`not.content_tsv.wfts(english).${v.trim()},content_tsv.is.null`);
        }
      }
    }
  }

  // Hourly exclusion
  if (tuning.excludeHourly) {
    query = query.not('salary_rate', 'eq', 'hr');
  }

  // Staffing exclusion
  if (tuning.excludeStaffing) {
    query = query.neq('is_staffing_agency', true);
  }

  // Who NOT pills
  const whoNotPills = sf.whoNotPills || [];
  for (const pill of whoNotPills) {
    for (const v of pill.values) {
      const term = v.trim().replace(/^nor\s+/i, '');
      if (term) {
        query = query.not('company_name', 'ilike', `%${term}%`);
      }
    }
  }

  // Industry exclusions
  const indExcludes = ((tuning.industryExcludes || []))
    .map(p => typeof p === 'string' ? p : (p.values ? p.values[0] : p))
    .filter(Boolean);
  for (const ind of indExcludes) {
    query = query.not('industry', 'ilike', `%${ind}%`);
  }

  // PAY — pill.min/pill.max
  const payPills = sf.payPills || [];
  if (payPills.length > 0) {
    const pill = payPills[0];
    const minVal = pill.min;
    const maxVal = pill.max;
    const includeNoSalary = sf.includeNoSalary !== false;

    if (minVal && maxVal) {
      if (includeNoSalary) {
        query = query.or(`and(salary_max.gte.${minVal},salary_min.lte.${maxVal}),salary_min.is.null`);
      } else {
        query = query.gte('salary_max', minVal).lte('salary_min', maxVal);
      }
    } else if (minVal) {
      if (includeNoSalary) {
        query = query.or(`salary_max.gte.${minVal},salary_min.is.null`);
      } else {
        query = query.gte('salary_max', minVal);
      }
    } else if (maxVal) {
      if (includeNoSalary) {
        query = query.or(`salary_min.lte.${maxVal},salary_min.is.null`);
      } else {
        query = query.lte('salary_min', maxVal);
      }
    }
  }

  // Skills pills
  const skillsPills = sf.skillsPills || [];
  for (const pill of skillsPills) {
    const terms = pill.values.map(v => v.trim().toLowerCase()).filter(Boolean);
    if (terms.length > 0) {
      query = query.or(terms.map(t => `extracted_skills.cs.{${t}}`).join(','));
    }
  }

  // Level — extracted_seniority
  const levelPills = sf.levelPills || [];
  if (levelPills.length > 0) {
    const levels = levelPills.flatMap(p => p.values.map(v => v.trim().toLowerCase())).filter(Boolean);
    if (levels.length === 1) {
      query = query.eq('extracted_seniority', levels[0]);
    } else if (levels.length > 1) {
      query = query.in('extracted_seniority', levels);
    }
  }

  // JD — content_tsv
  const jdPills = sf.jdPills || [];
  for (const pill of jdPills) {
    for (const v of pill.values) {
      const safe = v.replace(/[,()]/g, '').trim();
      if (safe) {
        query = query.textSearch('content_tsv', safe, { type: 'websearch', config: 'english' });
      }
    }
  }

  // Department — extracted_department
  const deptPills = sf.deptPills || [];
  if (deptPills.length > 0) {
    const depts = deptPills.flatMap(p => p.values.map(v => v.trim().toLowerCase())).filter(Boolean);
    if (depts.length === 1) {
      query = query.eq('extracted_department', depts[0]);
    } else if (depts.length > 1) {
      query = query.in('extracted_department', depts);
    }
  }

  return query;
}

// ── Test runner ──────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    failures.push({ name, error: e.message });
    console.log(`  ❌ ${name}: ${e.message}`);
  }
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg}\n    Expected: ${expected}\n    Actual:   ${actual}`);
  }
}

function assertCallMatch(legacyCalls, spaCalls, context) {
  const legacyStr = JSON.stringify(legacyCalls);
  const spaStr = JSON.stringify(spaCalls);
  if (legacyStr !== spaStr) {
    throw new Error(`${context}\n    Legacy: ${legacyStr}\n    SPA:    ${spaStr}`);
  }
}

function runParity(name, sf, tuning = {}) {
  const contentSearch = sf._testContentSearch || false;
  // Inject tuning into legacy sf for the reference implementation
  const legacySf = { ...sf, _testTuning: tuning };

  const legacyQ = createMockQuery();
  buildLegacyFilterQuery(legacySf, legacyQ, null);

  const spaQ = createMockQuery();
  buildSpaFilterQuery(sf, spaQ, null, tuning, contentSearch);

  assertCallMatch(legacyQ._calls, spaQ._calls, name);
}

// ── Section 1: Status Filter ──────────────────────────────────

console.log('\nSection 1: Status Filter (status=open)');

test('Empty filter still adds status=open', () => {
  runParity('empty filter', {
    whatPills: [], whatNotPills: [], wherePills: [], whereNotPills: [],
    whoPills: [], whoNotPills: [], whenPills: [], payPills: [],
    jdPills: [], levelPills: [], skillsPills: [], deptPills: [],
  });
});

test('Status filter is first call after baseQuery', () => {
  const q = createMockQuery();
  buildSpaFilterQuery({
    whatPills: [{ values: ['engineer'] }],
    whatNotPills: [], payPills: [], jdPills: [],
    levelPills: [], skillsPills: [], deptPills: [],
    whoNotPills: [],
  }, q, null, {}, false);

  assertEqual(q._calls[0].method, 'eq', 'First call should be eq');
  assertEqual(q._calls[0].args[0], 'status', 'First eq should be on status');
  assertEqual(q._calls[0].args[1], 'open', 'Status should be open');
});

// ── Section 2: What Pills + Content Search ─────────────────────

console.log('\nSection 2: What Pills + Content Search');

test('What pills: title-only when content search disabled', () => {
  runParity('what pills no content', {
    whatPills: [{ values: ['engineer'] }],
    whatNotPills: [], payPills: [], jdPills: [],
    levelPills: [], skillsPills: [], deptPills: [],
    whoNotPills: [],
    _testContentSearch: false,
  });
});

test('What pills: title + content_tsv when content search enabled', () => {
  runParity('what pills + content', {
    whatPills: [{ values: ['engineer'] }],
    whatNotPills: [], payPills: [], jdPills: [],
    levelPills: [], skillsPills: [], deptPills: [],
    whoNotPills: [],
    _testContentSearch: true,
  });
});

test('What pills: multiple values OR together', () => {
  runParity('what pills multi', {
    whatPills: [{ values: ['engineer', 'developer'] }],
    whatNotPills: [], payPills: [], jdPills: [],
    levelPills: [], skillsPills: [], deptPills: [],
    whoNotPills: [],
    _testContentSearch: true,
  });
});

test('What pills: sanitize commas and parens', () => {
  runParity('what pills sanitize', {
    whatPills: [{ values: ['C++', 'data (analyst)'] }],
    whatNotPills: [], payPills: [], jdPills: [],
    levelPills: [], skillsPills: [], deptPills: [],
    whoNotPills: [],
    _testContentSearch: false,
  });
});

test('What pills: legacy pills fallback', () => {
  runParity('pills fallback', {
    pills: [{ values: ['manager'] }],
    whatNotPills: [], payPills: [], jdPills: [],
    levelPills: [], skillsPills: [], deptPills: [],
    whoNotPills: [],
    _testContentSearch: false,
  });
});

// ── Section 3: What NOT Pills + Content Negation ─────────────

console.log('\nSection 3: What NOT Pills + Content Negation (CRITICAL)');

test('What NOT: title-only when content search disabled', () => {
  runParity('what not no content', {
    whatPills: [], whatNotPills: [{ values: ['intern'] }],
    payPills: [], jdPills: [], levelPills: [],
    skillsPills: [], deptPills: [], whoNotPills: [],
    _testContentSearch: false,
  });
});

test('What NOT: title + content_tsv negation when content search enabled', () => {
  runParity('what not + content', {
    whatPills: [], whatNotPills: [{ values: ['intern'] }],
    payPills: [], jdPills: [], levelPills: [],
    skillsPills: [], deptPills: [], whoNotPills: [],
    _testContentSearch: true,
  });
});

test('What NOT: NULL-safe content negation (content_tsv.is.null preserved)', () => {
  const q = createMockQuery();
  buildSpaFilterQuery({
    whatPills: [], whatNotPills: [{ values: ['intern'] }],
    payPills: [], jdPills: [], levelPills: [],
    skillsPills: [], deptPills: [], whoNotPills: [],
  }, q, null, {}, true);

  const orCall = q._calls.find(c => c.method === 'or' && c.args[0].includes('content_tsv.is.null'));
  if (!orCall) throw new Error('Missing NULL-safe OR clause for content_tsv negation');
});

test('What NOT: strips "nor " prefix', () => {
  runParity('what not nor prefix', {
    whatPills: [], whatNotPills: [{ values: ['nor sales'] }],
    payPills: [], jdPills: [], levelPills: [],
    skillsPills: [], deptPills: [], whoNotPills: [],
    _testContentSearch: false,
  });
});

test('What NOT: multiple values each get own negation', () => {
  runParity('what not multi', {
    whatPills: [], whatNotPills: [{ values: ['intern', 'junior'] }],
    payPills: [], jdPills: [], levelPills: [],
    skillsPills: [], deptPills: [], whoNotPills: [],
    _testContentSearch: true,
  });
});

// ── Section 4: Title Excludes + Content Negation ──────────────

console.log('\nSection 4: Title Excludes + Content Negation');

test('Title excludes: negates title + content_tsv when enabled', () => {
  runParity('title excludes + content', {
    whatPills: [], whatNotPills: [], payPills: [],
    jdPills: [], levelPills: [], skillsPills: [],
    deptPills: [], whoNotPills: [],
    _testContentSearch: true,
  }, {
    titleExcludes: [{ values: ['recruiter', 'coordinator'] }],
  });
});

test('Title excludes: title-only when content disabled', () => {
  runParity('title excludes no content', {
    whatPills: [], whatNotPills: [], payPills: [],
    jdPills: [], levelPills: [], skillsPills: [],
    deptPills: [], whoNotPills: [],
    _testContentSearch: false,
  }, {
    titleExcludes: [{ values: ['recruiter'] }],
  });
});

// ── Section 5: Hourly + Staffing Exclusions ──────────────────

console.log('\nSection 5: Hourly + Staffing Exclusions');

test('Hourly exclusion: excludes salary_rate=hr', () => {
  runParity('hourly exclusion', {
    whatPills: [], whatNotPills: [], payPills: [],
    jdPills: [], levelPills: [], skillsPills: [],
    deptPills: [], whoNotPills: [],
  }, {
    excludeHourly: true,
  });
});

test('Staffing exclusion: excludes is_staffing_agency=true', () => {
  runParity('staffing exclusion', {
    whatPills: [], whatNotPills: [], payPills: [],
    jdPills: [], levelPills: [], skillsPills: [],
    deptPills: [], whoNotPills: [],
  }, {
    excludeStaffing: true,
  });
});

test('Both hourly + staffing excluded together', () => {
  runParity('both exclusions', {
    whatPills: [], whatNotPills: [], payPills: [],
    jdPills: [], levelPills: [], skillsPills: [],
    deptPills: [], whoNotPills: [],
  }, {
    excludeHourly: true,
    excludeStaffing: true,
  });
});

// ── Section 6: Industry Exclusions ────────────────────────────

console.log('\nSection 6: Industry Exclusions');

test('Industry excludes: single industry', () => {
  runParity('single industry', {
    whatPills: [], whatNotPills: [], payPills: [],
    jdPills: [], levelPills: [], skillsPills: [],
    deptPills: [], whoNotPills: [],
  }, {
    industryExcludes: [{ values: ['Insurance'] }],
  });
});

test('Industry excludes: multiple industries', () => {
  runParity('multi industry', {
    whatPills: [], whatNotPills: [], payPills: [],
    jdPills: [], levelPills: [], skillsPills: [],
    deptPills: [], whoNotPills: [],
  }, {
    industryExcludes: [{ values: ['Insurance'] }, { values: ['Banking'] }],
  });
});

test('Industry excludes: string format (legacy compat)', () => {
  runParity('string industry', {
    whatPills: [], whatNotPills: [], payPills: [],
    jdPills: [], levelPills: [], skillsPills: [],
    deptPills: [], whoNotPills: [],
  }, {
    industryExcludes: ['Insurance', 'Banking'],
  });
});

// ── Section 7: Pay Pills (pill.min/pill.max) ──────────────────

console.log('\nSection 7: Pay Pills (pill.min/pill.max)');

test('Pay: min only + includeNoSalary=true (OR with null)', () => {
  runParity('pay min + no salary', {
    whatPills: [], whatNotPills: [], payPills: [{ values: [], min: 100000 }],
    jdPills: [], levelPills: [], skillsPills: [],
    deptPills: [], whoNotPills: [],
    includeNoSalary: true,
  });
});

test('Pay: min only + includeNoSalary=false', () => {
  runParity('pay min no null', {
    whatPills: [], whatNotPills: [], payPills: [{ values: [], min: 100000 }],
    jdPills: [], levelPills: [], skillsPills: [],
    deptPills: [], whoNotPills: [],
    includeNoSalary: false,
  });
});

test('Pay: max only + includeNoSalary=true', () => {
  runParity('pay max + no salary', {
    whatPills: [], whatNotPills: [], payPills: [{ values: [], max: 200000 }],
    jdPills: [], levelPills: [], skillsPills: [],
    deptPills: [], whoNotPills: [],
    includeNoSalary: true,
  });
});

test('Pay: min + max overlap with includeNoSalary=true', () => {
  runParity('pay range + no salary', {
    whatPills: [], whatNotPills: [], payPills: [{ values: [], min: 100000, max: 200000 }],
    jdPills: [], levelPills: [], skillsPills: [],
    deptPills: [], whoNotPills: [],
    includeNoSalary: true,
  });
});

test('Pay: min + max overlap with includeNoSalary=false', () => {
  runParity('pay range no null', {
    whatPills: [], whatNotPills: [], payPills: [{ values: [], min: 100000, max: 200000 }],
    jdPills: [], levelPills: [], skillsPills: [],
    deptPills: [], whoNotPills: [],
    includeNoSalary: false,
  });
});

test('Pay: max only + includeNoSalary=false', () => {
  runParity('pay max no null', {
    whatPills: [], whatNotPills: [], payPills: [{ values: [], max: 200000 }],
    jdPills: [], levelPills: [], skillsPills: [],
    deptPills: [], whoNotPills: [],
    includeNoSalary: false,
  });
});

// ── Section 8: Skills Pills ──────────────────────────────────

console.log('\nSection 8: Skills Pills');

test('Skills: single skill uses extracted_skills.cs', () => {
  runParity('single skill', {
    whatPills: [], whatNotPills: [], payPills: [],
    jdPills: [], levelPills: [],
    skillsPills: [{ values: ['python'] }],
    deptPills: [], whoNotPills: [],
  });
});

test('Skills: multiple skills OR together', () => {
  runParity('multi skill', {
    whatPills: [], whatNotPills: [], payPills: [],
    jdPills: [], levelPills: [],
    skillsPills: [{ values: ['python', 'javascript', 'typescript'] }],
    deptPills: [], whoNotPills: [],
  });
});

test('Skills: values lowercased', () => {
  runParity('skill lowercase', {
    whatPills: [], whatNotPills: [], payPills: [],
    jdPills: [], levelPills: [],
    skillsPills: [{ values: ['Python', 'JavaScript'] }],
    deptPills: [], whoNotPills: [],
  });
});

// ── Section 9: Level Filter (extracted_seniority) ──────────────

console.log('\nSection 9: Level Filter (extracted_seniority)');

test('Level: single level uses eq', () => {
  runParity('single level', {
    whatPills: [], whatNotPills: [], payPills: [],
    jdPills: [], levelPills: [{ values: ['senior'] }],
    skillsPills: [], deptPills: [], whoNotPills: [],
  });
});

test('Level: multiple levels use in()', () => {
  runParity('multi level', {
    whatPills: [], whatNotPills: [], payPills: [],
    jdPills: [], levelPills: [{ values: ['senior', 'lead'] }],
    skillsPills: [], deptPills: [], whoNotPills: [],
  });
});

test('Level: values lowercased', () => {
  runParity('level lowercase', {
    whatPills: [], whatNotPills: [], payPills: [],
    jdPills: [], levelPills: [{ values: ['Senior', 'Lead'] }],
    skillsPills: [], deptPills: [], whoNotPills: [],
  });
});

// ── Section 10: Department Pills ──────────────────────────────

console.log('\nSection 10: Department Pills');

test('Department: single dept uses eq', () => {
  runParity('single dept', {
    whatPills: [], whatNotPills: [], payPills: [],
    jdPills: [], levelPills: [], skillsPills: [],
    deptPills: [{ values: ['engineering'] }],
    whoNotPills: [],
  });
});

test('Department: multiple depts use in()', () => {
  runParity('multi dept', {
    whatPills: [], whatNotPills: [], payPills: [],
    jdPills: [], levelPills: [], skillsPills: [],
    deptPills: [{ values: ['engineering', 'product'] }],
    whoNotPills: [],
  });
});

test('Department: values lowercased', () => {
  runParity('dept lowercase', {
    whatPills: [], whatNotPills: [], payPills: [],
    jdPills: [], levelPills: [], skillsPills: [],
    deptPills: [{ values: ['Engineering', 'Product'] }],
    whoNotPills: [],
  });
});

// ── Section 11: JD Content Search ────────────────────────────

console.log('\nSection 11: JD Content Search (content_tsv)');

test('JD pills: use content_tsv with websearch + english config', () => {
  runParity('jd content_tsv', {
    whatPills: [], whatNotPills: [], payPills: [],
    jdPills: [{ values: ['machine learning'] }],
    levelPills: [], skillsPills: [], deptPills: [],
    whoNotPills: [],
  });
});

test('JD pills: sanitize commas/parens', () => {
  runParity('jd sanitize', {
    whatPills: [], whatNotPills: [], payPills: [],
    jdPills: [{ values: ['data (analyst)'] }],
    levelPills: [], skillsPills: [], deptPills: [],
    whoNotPills: [],
  });
});

// ── Section 12: Who NOT Pills ──────────────────────────────────

console.log('\nSection 12: Who NOT Pills');

test('Who NOT: strips nor prefix', () => {
  runParity('who not nor prefix', {
    whatPills: [], whatNotPills: [], payPills: [],
    jdPills: [], levelPills: [], skillsPills: [],
    deptPills: [],
    whoNotPills: [{ values: ['nor Acme'] }],
  });
});

// ── Section 13: Combined Filters ──────────────────────────────

console.log('\nSection 13: Combined Filters (Integration)');

test('Full filter combo: what + what not + pay + skills + level + dept + hourly + staffing + industry', () => {
  runParity('full combo', {
    whatPills: [{ values: ['engineer'] }],
    whatNotPills: [{ values: ['intern'] }],
    payPills: [{ values: [], min: 100000, max: 200000 }],
    jdPills: [{ values: ['distributed systems'] }],
    levelPills: [{ values: ['senior'] }],
    skillsPills: [{ values: ['python', 'go'] }],
    deptPills: [{ values: ['engineering'] }],
    whoNotPills: [{ values: ['Acme Corp'] }],
    includeNoSalary: true,
    _testContentSearch: true,
  }, {
    excludeHourly: true,
    excludeStaffing: true,
    industryExcludes: [{ values: ['Insurance'] }],
    titleExcludes: [{ values: ['coordinator'] }],
  });
});

test('Full combo without content search', () => {
  runParity('full combo no content', {
    whatPills: [{ values: ['designer'] }],
    whatNotPills: [{ values: ['junior'] }],
    payPills: [{ values: [], min: 80000 }],
    jdPills: [],
    levelPills: [{ values: ['mid', 'senior'] }],
    skillsPills: [{ values: ['figma'] }],
    deptPills: [{ values: ['design', 'product'] }],
    whoNotPills: [],
    includeNoSalary: false,
    _testContentSearch: false,
  }, {
    excludeHourly: true,
    industryExcludes: ['Banking'],
  });
});

// ── Section 14: Edge Cases ───────────────────────────────────

console.log('\nSection 14: Edge Cases');

test('Empty pill values are skipped', () => {
  runParity('empty values', {
    whatPills: [{ values: ['', '  ', 'valid'] }],
    whatNotPills: [{ values: ['', 'real'] }],
    payPills: [],
    jdPills: [], levelPills: [], skillsPills: [],
    deptPills: [], whoNotPills: [],
    _testContentSearch: true,
  });
});

test('Pay pill with no min or max does not add salary filter', () => {
  runParity('pay no min max', {
    whatPills: [], whatNotPills: [],
    payPills: [{ values: [] }],
    jdPills: [], levelPills: [], skillsPills: [],
    deptPills: [], whoNotPills: [],
  });
});

test('Skills pill with empty values after trim', () => {
  runParity('skills empty', {
    whatPills: [], whatNotPills: [], payPills: [],
    jdPills: [], levelPills: [],
    skillsPills: [{ values: ['  ', ''] }],
    deptPills: [], whoNotPills: [],
  });
});

// ── Summary ──────────────────────────────────────────────────

console.log('\n' + '='.repeat(60));
console.log(`FA-007 Parity Tests: ${passed} passed, ${failed} failed (${passed + failed} total)`);
if (failures.length > 0) {
  console.log('\nFailures:');
  failures.forEach(f => console.log(`  - ${f.name}: ${f.error}`));
}
console.log('='.repeat(60));
process.exit(failed > 0 ? 1 : 0);
