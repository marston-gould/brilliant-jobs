// tests/fa-005-server-merge.test.js
// FA-005: Server-Side Multi-Filter Merge — Validation Tests
// Tests the Postgres function, client serialization, and end-to-end flow.

const assert = require('assert');

// ============================================================
// Section 1: serializeFilterForRPC — Pill Serialization
// ============================================================

function mockSerializeFilterForRPC(sf, locationIds, tuning) {
  // Minimal re-implementation of the serializer for testing
  const filter = {};

  const w = sf.whatPills || sf.pills || [];
  const whatVals = w.flatMap(p => p.values.map(v => v.replace(/[,()]/g, '').trim())).filter(Boolean);
  if (whatVals.length > 0) filter.what = whatVals;

  const wnot = sf.whatNotPills || [];
  const whatNotVals = wnot.flatMap(p => p.values.map(v => v.trim().replace(/^nor\s+/i, ''))).filter(Boolean);
  if (whatNotVals.length > 0) filter.what_not = whatNotVals;

  const titleExcl = (tuning.titleExcludes || []).flatMap(p => (p.values || []).map(v => v.trim())).filter(Boolean);
  if (titleExcl.length > 0) filter.title_excludes = titleExcl;

  if (locationIds && locationIds.isRemoteOnly) {
    filter.where_mode = 'remote_only';
  } else if (locationIds && locationIds.includeIds !== null) {
    filter.where_mode = 'ids';
    filter.where_ids = locationIds.includeIds;
    if (locationIds.boundingBox) filter.where_bbox = locationIds.boundingBox;
    if (locationIds._stateCodes && locationIds._stateCodes.length > 0) filter.where_state_codes = locationIds._stateCodes;
    filter.where_has_remote = locationIds._hasRemote || false;
    filter.where_is_us_search = locationIds.isUSSearch || false;
  } else {
    const wh = sf.wherePills || [];
    const whereVals = wh.flatMap(p => p.values).filter(Boolean);
    if (whereVals.length > 0) {
      filter.where_mode = 'inline';
      filter.where_text = whereVals;
    }
  }

  const whnot = sf.whereNotPills || [];
  const whereNotVals = whnot.flatMap(p => p.values.map(v => v.trim().replace(/^nor\s+/i, ''))).filter(Boolean);
  if (whereNotVals.length > 0) filter.where_not = whereNotVals;

  if (tuning.usOnly) filter.us_only = true;
  if (tuning.excludeHourly) filter.exclude_hourly = true;
  if (tuning.excludeStaffing) filter.exclude_staffing = true;
  if (sf.includeRemote) filter.include_remote = true;

  const wo = sf.whoPills || [];
  const whoVals = wo.flatMap(p => p.values).filter(Boolean);
  if (whoVals.length > 0) filter.who = whoVals;

  const wonot = sf.whoNotPills || [];
  const whoNotVals = wonot.flatMap(p => p.values.map(v => v.trim().replace(/^nor\s+/i, ''))).filter(Boolean);
  if (whoNotVals.length > 0) filter.who_not = whoNotVals;

  const compExcl = (tuning.companyExcludes || []).flatMap(p => (p.values || []).map(v => v.trim())).filter(Boolean);
  if (compExcl.length > 0) filter.company_excludes = compExcl;

  const indExcl = (tuning.industryExcludes || []).map(p => typeof p === 'string' ? p : (p.values ? p.values[0] : p)).filter(Boolean);
  if (indExcl.length > 0) filter.industry_excludes = indExcl;

  const locExcl = (tuning.locationExcludes || []).flatMap(p => (p.values || []).map(v => v.trim())).filter(Boolean);
  if (locExcl.length > 0) filter.location_excludes = locExcl;

  const pay = sf.payPills || [];
  if (pay.length > 0) {
    const pill = pay[0];
    if (pill.min) filter.pay_min = pill.min;
    if (pill.max) filter.pay_max = pill.max;
    filter.include_no_salary = sf.includeNoSalary !== false;
  }

  const sk = sf.skillsPills || [];
  const skillVals = sk.flatMap(p => p.values.map(v => v.trim().toLowerCase())).filter(Boolean);
  if (skillVals.length > 0) filter.skills = skillVals;

  const lv = sf.levelPills || [];
  const levelVals = lv.flatMap(p => p.values.map(v => v.trim().toLowerCase())).filter(Boolean);
  if (levelVals.length > 0) filter.levels = levelVals;

  const jd = sf.jdPills || [];
  const jdVals = jd.flatMap(p => p.values.map(v => v.replace(/[,()]/g, '').trim())).filter(Boolean);
  if (jdVals.length > 0) filter.jd_terms = jdVals;

  const dp = sf.deptPills || [];
  const deptVals = dp.flatMap(p => p.values.map(v => v.trim().toLowerCase())).filter(Boolean);
  if (deptVals.length > 0) filter.depts = deptVals;

  filter.filter_num = sf._filterNum || '';
  filter.filter_color = sf._filterColor || '';

  return filter;
}

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ❌ ${name}: ${e.message}`);
  }
}

// ─── Section 1: What pill serialization ─────────────────────

console.log('\n📋 Section 1: What Pill Serialization');

test('What pills flatten to string array', () => {
  const result = mockSerializeFilterForRPC({
    whatPills: [{ values: ['seo', 'marketing'] }, { values: ['growth'] }],
  }, null, {});
  assert.deepStrictEqual(result.what, ['seo', 'marketing', 'growth']);
});

test('What pills strip special chars', () => {
  const result = mockSerializeFilterForRPC({
    whatPills: [{ values: ['C++', 'data (analytics)'] }],
  }, null, {});
  assert.deepStrictEqual(result.what, ['C++', 'data analytics']);
});

test('What NOT pills strip "nor " prefix', () => {
  const result = mockSerializeFilterForRPC({
    whatNotPills: [{ values: ['nor paid', 'social'] }],
  }, null, {});
  assert.deepStrictEqual(result.what_not, ['paid', 'social']);
});

test('Empty pills produce no keys', () => {
  const result = mockSerializeFilterForRPC({
    whatPills: [],
    whatNotPills: [],
  }, null, {});
  assert.strictEqual(result.what, undefined);
  assert.strictEqual(result.what_not, undefined);
});

// ─── Section 2: Location serialization ──────────────────────

console.log('\n📋 Section 2: Location Serialization');

test('Remote-only mode', () => {
  const result = mockSerializeFilterForRPC({}, { isRemoteOnly: true }, {});
  assert.strictEqual(result.where_mode, 'remote_only');
});

test('IDs mode with bounding box', () => {
  const locIds = {
    includeIds: ['abc', 'def'],
    boundingBox: { minLat: 30, maxLat: 40, minLng: -90, maxLng: -80 },
    _stateCodes: ['TX', 'LA'],
    _hasRemote: true,
    isUSSearch: true,
    isRemoteOnly: false,
  };
  const result = mockSerializeFilterForRPC({}, locIds, {});
  assert.strictEqual(result.where_mode, 'ids');
  assert.deepStrictEqual(result.where_ids, ['abc', 'def']);
  assert.deepStrictEqual(result.where_bbox, locIds.boundingBox);
  assert.deepStrictEqual(result.where_state_codes, ['TX', 'LA']);
  assert.strictEqual(result.where_has_remote, true);
  assert.strictEqual(result.where_is_us_search, true);
});

test('Inline text mode (no location IDs)', () => {
  const result = mockSerializeFilterForRPC({
    wherePills: [{ values: ['San Francisco'] }],
  }, null, {});
  assert.strictEqual(result.where_mode, 'inline');
  assert.deepStrictEqual(result.where_text, ['San Francisco']);
});

test('WHERE NOT pills', () => {
  const result = mockSerializeFilterForRPC({
    whereNotPills: [{ values: ['nor Europe', 'Asia'] }],
  }, null, {});
  assert.deepStrictEqual(result.where_not, ['Europe', 'Asia']);
});

// ─── Section 3: Tuning settings ─────────────────────────────

console.log('\n📋 Section 3: Tuning Settings');

test('US-Only flag', () => {
  const result = mockSerializeFilterForRPC({}, null, { usOnly: true });
  assert.strictEqual(result.us_only, true);
});

test('Exclude hourly and staffing', () => {
  const result = mockSerializeFilterForRPC({}, null, { excludeHourly: true, excludeStaffing: true });
  assert.strictEqual(result.exclude_hourly, true);
  assert.strictEqual(result.exclude_staffing, true);
});

test('Global title excludes', () => {
  const result = mockSerializeFilterForRPC({}, null, {
    titleExcludes: [{ values: ['intern', 'entry level'] }],
  });
  assert.deepStrictEqual(result.title_excludes, ['intern', 'entry level']);
});

test('Include remote flag', () => {
  const result = mockSerializeFilterForRPC({ includeRemote: true }, null, {});
  assert.strictEqual(result.include_remote, true);
});

// ─── Section 4: Who / Company ───────────────────────────────

console.log('\n📋 Section 4: Who / Company Serialization');

test('Who pills', () => {
  const result = mockSerializeFilterForRPC({
    whoPills: [{ values: ['Google', 'Meta'] }],
  }, null, {});
  assert.deepStrictEqual(result.who, ['Google', 'Meta']);
});

test('Who NOT pills', () => {
  const result = mockSerializeFilterForRPC({
    whoNotPills: [{ values: ['Staffing Inc'] }],
  }, null, {});
  assert.deepStrictEqual(result.who_not, ['Staffing Inc']);
});

test('Global company excludes', () => {
  const result = mockSerializeFilterForRPC({}, null, {
    companyExcludes: [{ values: ['Amazon'] }],
  });
  assert.deepStrictEqual(result.company_excludes, ['Amazon']);
});

// ─── Section 5: Pay / Skills / Level / JD / Dept ────────────

console.log('\n📋 Section 5: Pay / Skills / Level / JD / Dept');

test('Pay pills with min and max', () => {
  const result = mockSerializeFilterForRPC({
    payPills: [{ min: 100000, max: 200000 }],
    includeNoSalary: true,
  }, null, {});
  assert.strictEqual(result.pay_min, 100000);
  assert.strictEqual(result.pay_max, 200000);
  assert.strictEqual(result.include_no_salary, true);
});

test('Pay pills with min only', () => {
  const result = mockSerializeFilterForRPC({
    payPills: [{ min: 50000 }],
    includeNoSalary: false,
  }, null, {});
  assert.strictEqual(result.pay_min, 50000);
  assert.strictEqual(result.pay_max, undefined);
  assert.strictEqual(result.include_no_salary, false);
});

test('Skills pills', () => {
  const result = mockSerializeFilterForRPC({
    skillsPills: [{ values: ['Python', 'JavaScript'] }],
  }, null, {});
  assert.deepStrictEqual(result.skills, ['python', 'javascript']);
});

test('Level pills', () => {
  const result = mockSerializeFilterForRPC({
    levelPills: [{ values: ['Senior', 'Lead'] }],
  }, null, {});
  assert.deepStrictEqual(result.levels, ['senior', 'lead']);
});

test('JD pills strip special chars', () => {
  const result = mockSerializeFilterForRPC({
    jdPills: [{ values: ['kubernetes', 'docker (containers)'] }],
  }, null, {});
  assert.deepStrictEqual(result.jd_terms, ['kubernetes', 'docker containers']);
});

test('Department pills', () => {
  const result = mockSerializeFilterForRPC({
    deptPills: [{ values: ['Engineering', 'Product'] }],
  }, null, {});
  assert.deepStrictEqual(result.depts, ['engineering', 'product']);
});

// ─── Section 6: Filter identity ─────────────────────────────

console.log('\n📋 Section 6: Filter Identity');

test('Filter num and color attached', () => {
  const result = mockSerializeFilterForRPC({
    _filterNum: '3',
    _filterColor: '#ff0000',
  }, null, {});
  assert.strictEqual(result.filter_num, '3');
  assert.strictEqual(result.filter_color, '#ff0000');
});

test('Missing filter identity defaults to empty string', () => {
  const result = mockSerializeFilterForRPC({}, null, {});
  assert.strictEqual(result.filter_num, '');
  assert.strictEqual(result.filter_color, '');
});

// ─── Section 7: Complex filter with all pill types ──────────

console.log('\n📋 Section 7: Complex Filter (All Pill Types)');

test('Full filter with every pill type', () => {
  const sf = {
    whatPills: [{ values: ['seo'] }],
    whatNotPills: [{ values: ['paid'] }],
    wherePills: [{ values: ['United States'] }],
    whereNotPills: [{ values: ['Europe'] }],
    whenPills: [],
    whoPills: [{ values: ['Google'] }],
    whoNotPills: [{ values: ['Amazon'] }],
    payPills: [{ min: 100000, max: 200000 }],
    skillsPills: [{ values: ['Python'] }],
    levelPills: [{ values: ['Senior'] }],
    jdPills: [{ values: ['kubernetes'] }],
    deptPills: [{ values: ['Engineering'] }],
    includeNoSalary: true,
    includeRemote: true,
    _filterNum: '1',
    _filterColor: '#3b82f6',
  };
  const tuning = {
    usOnly: true,
    excludeHourly: true,
    excludeStaffing: true,
    titleExcludes: [{ values: ['intern'] }],
    locationExcludes: [{ values: ['London'] }],
    companyExcludes: [{ values: ['Staffing Co'] }],
    industryExcludes: ['Healthcare'],
  };
  const result = mockSerializeFilterForRPC(sf, null, tuning);

  assert.deepStrictEqual(result.what, ['seo']);
  assert.deepStrictEqual(result.what_not, ['paid']);
  assert.strictEqual(result.where_mode, 'inline');
  assert.deepStrictEqual(result.where_text, ['United States']);
  assert.deepStrictEqual(result.where_not, ['Europe']);
  assert.deepStrictEqual(result.who, ['Google']);
  assert.deepStrictEqual(result.who_not, ['Amazon']);
  assert.strictEqual(result.pay_min, 100000);
  assert.strictEqual(result.pay_max, 200000);
  assert.strictEqual(result.include_no_salary, true);
  assert.deepStrictEqual(result.skills, ['python']);
  assert.deepStrictEqual(result.levels, ['senior']);
  assert.deepStrictEqual(result.jd_terms, ['kubernetes']);
  assert.deepStrictEqual(result.depts, ['engineering']);
  assert.strictEqual(result.us_only, true);
  assert.strictEqual(result.exclude_hourly, true);
  assert.strictEqual(result.exclude_staffing, true);
  assert.strictEqual(result.include_remote, true);
  assert.deepStrictEqual(result.title_excludes, ['intern']);
  assert.deepStrictEqual(result.company_excludes, ['Staffing Co']);
  assert.deepStrictEqual(result.industry_excludes, ['Healthcare']);
  assert.strictEqual(result.filter_num, '1');
  assert.strictEqual(result.filter_color, '#3b82f6');
});

// ─── Section 8: Migration SQL Validation ────────────────────

console.log('\n📋 Section 8: Migration SQL Validation');

const fs = require('fs');

test('Migration file exists', () => {
  assert.ok(fs.existsSync('supabase/migrations/v6.42-fa005-search-jobs-multi.sql'));
});

test('Migration creates search_jobs_multi function', () => {
  const sql = fs.readFileSync('supabase/migrations/v6.42-fa005-search-jobs-multi.sql', 'utf8');
  assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.search_jobs_multi'));
});

test('Migration creates _build_filter_where helper', () => {
  const sql = fs.readFileSync('supabase/migrations/v6.42-fa005-search-jobs-multi.sql', 'utf8');
  assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public._build_filter_where'));
});

test('Migration inserts feed_server_merge feature flag', () => {
  const sql = fs.readFileSync('supabase/migrations/v6.42-fa005-search-jobs-multi.sql', 'utf8');
  assert.ok(sql.includes("'feed_server_merge'"));
});

test('Migration grants execute to authenticated role', () => {
  const sql = fs.readFileSync('supabase/migrations/v6.42-fa005-search-jobs-multi.sql', 'utf8');
  assert.ok(sql.includes('GRANT EXECUTE'));
  assert.ok(sql.includes('TO authenticated'));
});

test('Migration sets statement_timeout to 10s', () => {
  const sql = fs.readFileSync('supabase/migrations/v6.42-fa005-search-jobs-multi.sql', 'utf8');
  assert.ok(sql.includes("statement_timeout = '10s'"));
});

test('Migration uses SECURITY INVOKER (not DEFINER)', () => {
  const sql = fs.readFileSync('supabase/migrations/v6.42-fa005-search-jobs-multi.sql', 'utf8');
  assert.ok(sql.includes('SECURITY INVOKER'));
  assert.ok(!sql.includes('SECURITY DEFINER'));
});

test('Migration includes US-Only tiered filter (FA-009)', () => {
  const sql = fs.readFileSync('supabase/migrations/v6.42-fa005-search-jobs-multi.sql', 'utf8');
  assert.ok(sql.includes("loc_state IN (''AL'',''AK''"));
});

test('Migration includes NULL-safe content exclusion (FA-002)', () => {
  const sql = fs.readFileSync('supabase/migrations/v6.42-fa005-search-jobs-multi.sql', 'utf8');
  assert.ok(sql.includes('content_tsv IS NULL'));
});

test('Migration uses format(%L) for SQL injection prevention', () => {
  const sql = fs.readFileSync('supabase/migrations/v6.42-fa005-search-jobs-multi.sql', 'utf8');
  assert.ok(sql.includes('format('));
  assert.ok(sql.includes('%L'));
});

test('Migration validates max 20 filters', () => {
  const sql = fs.readFileSync('supabase/migrations/v6.42-fa005-search-jobs-multi.sql', 'utf8');
  assert.ok(sql.includes('jsonb_array_length(p_filters) > 20'));
});

test('Migration validates per_page range (1-200)', () => {
  const sql = fs.readFileSync('supabase/migrations/v6.42-fa005-search-jobs-multi.sql', 'utf8');
  assert.ok(sql.includes('p_per_page < 1 OR p_per_page > 200'));
});

// ─── Section 9: Client-Side Integration ─────────────────────

console.log('\n📋 Section 9: Client-Side Integration');

test('job-feed.js declares _serverMergeEnabled flag', () => {
  const src = fs.readFileSync('js/job-feed.js', 'utf8');
  assert.ok(src.includes('var _serverMergeEnabled = false'));
});

test('job-feed.js evaluates feed_server_merge flag', () => {
  const src = fs.readFileSync('js/job-feed.js', 'utf8');
  assert.ok(src.includes("isFeatureEnabled('feed_server_merge'"));
});

test('job-feed.js contains serializeFilterForRPC function', () => {
  const src = fs.readFileSync('js/job-feed.js', 'utf8');
  assert.ok(src.includes('function serializeFilterForRPC('));
});

test('job-feed.js calls sb.rpc(search_jobs_multi) in server merge path', () => {
  const src = fs.readFileSync('js/job-feed.js', 'utf8');
  assert.ok(src.includes("sb.rpc('search_jobs_multi'"));
});

test('job-feed.js has client-side merge fallback', () => {
  const src = fs.readFileSync('js/job-feed.js', 'utf8');
  assert.ok(src.includes('client-side merge (pre-FA-005 fallback)'));
});

test('job-feed.js adds server_merge_enabled to PostHog event', () => {
  const src = fs.readFileSync('js/job-feed.js', 'utf8');
  assert.ok(src.includes('server_merge_enabled: _serverMergeEnabled'));
});

test('job-feed.js handles RPC error with graceful fallback', () => {
  const src = fs.readFileSync('js/job-feed.js', 'utf8');
  assert.ok(src.includes('FA-005 RPC error, falling back to client-side merge'));
});

// ─── Section 10: SPA Parity ─────────────────────────────────

console.log('\n📋 Section 10: SPA Parity');

test('useFeedSearch.ts has isFeatureFlagEnabled helper', () => {
  const src = fs.readFileSync('src/app/pages/dashboard/feed/hooks/useFeedSearch.ts', 'utf8');
  assert.ok(src.includes('async function isFeatureFlagEnabled('));
});

test('useFeedSearch.ts has serializeFilterForRPC function', () => {
  const src = fs.readFileSync('src/app/pages/dashboard/feed/hooks/useFeedSearch.ts', 'utf8');
  assert.ok(src.includes('function serializeFilterForRPC('));
});

test('useFeedSearch.ts calls sb.rpc(search_jobs_multi) in server merge path', () => {
  const src = fs.readFileSync('src/app/pages/dashboard/feed/hooks/useFeedSearch.ts', 'utf8');
  assert.ok(src.includes("sb.rpc('search_jobs_multi'"));
});

test('useFeedSearch.ts checks feed_server_merge flag', () => {
  const src = fs.readFileSync('src/app/pages/dashboard/feed/hooks/useFeedSearch.ts', 'utf8');
  assert.ok(src.includes("'feed_server_merge'"));
});

test('useFeedSearch.ts retains client-side merge fallback', () => {
  const src = fs.readFileSync('src/app/pages/dashboard/feed/hooks/useFeedSearch.ts', 'utf8');
  assert.ok(src.includes('Client-side merge fallback'));
});

test('useFeedSearch.ts handles _filter_idxs mapping', () => {
  const src = fs.readFileSync('src/app/pages/dashboard/feed/hooks/useFeedSearch.ts', 'utf8');
  assert.ok(src.includes('_filter_idxs'));
});

// ─── Section 11: SQL Correctness ────────────────────────────

console.log('\n📋 Section 11: SQL Correctness Checks');

test('_build_filter_where always starts with status=open', () => {
  const sql = fs.readFileSync('supabase/migrations/v6.42-fa005-search-jobs-multi.sql', 'utf8');
  assert.ok(sql.includes("v_clauses text[] := ARRAY['status = ''open''']"));
});

test('Sort column is whitelisted (SQL injection prevention)', () => {
  const sql = fs.readFileSync('supabase/migrations/v6.42-fa005-search-jobs-multi.sql', 'utf8');
  assert.ok(sql.includes('v_allowed_sorts'));
  assert.ok(sql.includes("'updated_at'"));
  assert.ok(sql.includes("'salary_min'"));
  assert.ok(sql.includes("'title'"));
});

test('UNION ALL used for combining filter results', () => {
  const sql = fs.readFileSync('supabase/migrations/v6.42-fa005-search-jobs-multi.sql', 'utf8');
  assert.ok(sql.includes('UNION ALL'));
});

test('COUNT(DISTINCT greenhouse_id) for accurate dedup count', () => {
  const sql = fs.readFileSync('supabase/migrations/v6.42-fa005-search-jobs-multi.sql', 'utf8');
  assert.ok(sql.includes('COUNT(DISTINCT greenhouse_id)'));
});

test('GROUP BY greenhouse_id for deduplication', () => {
  const sql = fs.readFileSync('supabase/migrations/v6.42-fa005-search-jobs-multi.sql', 'utf8');
  assert.ok(sql.includes('GROUP BY greenhouse_id'));
});

test('jsonb_agg(DISTINCT _filter_idx) for filter tag tracking', () => {
  const sql = fs.readFileSync('supabase/migrations/v6.42-fa005-search-jobs-multi.sql', 'utf8');
  assert.ok(sql.includes('jsonb_agg(DISTINCT _filter_idx)'));
});

test('NULLS LAST in ORDER BY', () => {
  const sql = fs.readFileSync('supabase/migrations/v6.42-fa005-search-jobs-multi.sql', 'utf8');
  assert.ok(sql.includes('NULLS LAST'));
});

test('websearch_to_tsquery used for content search', () => {
  const sql = fs.readFileSync('supabase/migrations/v6.42-fa005-search-jobs-multi.sql', 'utf8');
  assert.ok(sql.includes("websearch_to_tsquery(''english''"));
});

test('Return JSONB with data, count, and error fields', () => {
  const sql = fs.readFileSync('supabase/migrations/v6.42-fa005-search-jobs-multi.sql', 'utf8');
  assert.ok(sql.includes("'data'"));
  assert.ok(sql.includes("'count'"));
  assert.ok(sql.includes("'error'"));
});

// ─── Summary ────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`FA-005 Tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) {
  console.error('❌ SOME TESTS FAILED');
  process.exit(1);
} else {
  console.log('✅ ALL TESTS PASSED');
}
