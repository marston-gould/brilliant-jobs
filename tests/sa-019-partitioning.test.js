/**
 * SA-019: Database Partitioning — ats_jobs by Source
 * Validation tests for migration, partition structure, indexes, triggers, RLS, monitoring
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MIGRATION = path.join(ROOT, 'supabase/migrations/v6.28-ats-jobs-partitioning.sql');
const ADR = path.join(ROOT, 'docs/scaling/adr-06-pipeline.md');

let migrationSql = '';
let adrContent = '';
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    console.error(`  FAIL: ${name}\n    ${e.message}`);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

// ─── Load files ──────────────────────────────────────────────────────
test('Migration file exists', () => {
  assert(fs.existsSync(MIGRATION), 'v6.28-ats-jobs-partitioning.sql not found');
  migrationSql = fs.readFileSync(MIGRATION, 'utf-8');
});

test('ADR-06 exists', () => {
  assert(fs.existsSync(ADR), 'adr-06-pipeline.md not found');
  adrContent = fs.readFileSync(ADR, 'utf-8');
});

// ─── Migration structure ─────────────────────────────────────────────
test('Migration wrapped in transaction', () => {
  assert(migrationSql.includes('BEGIN;'), 'Missing BEGIN');
  assert(migrationSql.includes('COMMIT;'), 'Missing COMMIT');
});

test('Pre-flight row count captured', () => {
  assert(migrationSql.includes('_sa019_preflight'), 'Missing preflight temp table');
  assert(migrationSql.includes('SELECT COUNT(*) INTO v_count FROM ats_jobs'), 'Missing preflight count');
});

test('Old table renamed', () => {
  assert(migrationSql.includes('RENAME TO ats_jobs_pre_partition'), 'Missing rename step');
});

test('Partitioned table created with PARTITION BY LIST', () => {
  assert(migrationSql.includes('PARTITION BY LIST (ats_source)'), 'Missing PARTITION BY LIST');
});

test('Post-migration row count verification', () => {
  assert(migrationSql.includes('DATA LOSS DETECTED'), 'Missing data loss check');
});

test('Old table dropped', () => {
  assert(migrationSql.includes('DROP TABLE ats_jobs_pre_partition'), 'Missing old table drop');
});

// ─── Partitions ──────────────────────────────────────────────────────
test('ats_jobs_ats partition created', () => {
  assert(migrationSql.includes("CREATE TABLE ats_jobs_ats PARTITION OF ats_jobs"), 'Missing ats partition');
  assert(migrationSql.includes("'greenhouse'"), 'Missing greenhouse in ats partition');
  assert(migrationSql.includes("'lever'"), 'Missing lever in ats partition');
  assert(migrationSql.includes("'ashby'"), 'Missing ashby in ats partition');
  assert(migrationSql.includes("'workable'"), 'Missing workable in ats partition');
  assert(migrationSql.includes("'recruitee'"), 'Missing recruitee in ats partition');
  assert(migrationSql.includes("'usajobs'"), 'Missing usajobs in ats partition');
});

test('ats_jobs_common_crawl partition created', () => {
  assert(migrationSql.includes("CREATE TABLE ats_jobs_common_crawl PARTITION OF ats_jobs"), 'Missing common_crawl partition');
  assert(migrationSql.includes("'common_crawl'"), 'Missing common_crawl value');
});

test('ats_jobs_amazon partition created', () => {
  assert(migrationSql.includes("CREATE TABLE ats_jobs_amazon PARTITION OF ats_jobs"), 'Missing amazon partition');
  assert(migrationSql.includes("'amazon'"), 'Missing amazon value');
});

test('Default partition created', () => {
  assert(migrationSql.includes("CREATE TABLE ats_jobs_default PARTITION OF ats_jobs DEFAULT"), 'Missing default partition');
});

test('All 4 partitions present', () => {
  const partitions = ['ats_jobs_ats', 'ats_jobs_common_crawl', 'ats_jobs_amazon', 'ats_jobs_default'];
  partitions.forEach(p => {
    assert(migrationSql.includes(`CREATE TABLE ${p} PARTITION OF ats_jobs`), `Missing partition: ${p}`);
  });
});

// ─── Schema fidelity ─────────────────────────────────────────────────
const requiredColumns = [
  'greenhouse_id', 'company_slug', 'company_name', 'title', 'location',
  'department', 'url', 'updated_at', 'last_seen', 'created_at', 'content',
  'first_seen_at', 'lat', 'lng', 'location_normalized', 'is_remote', 'status',
  'closed_at', 'salary_min', 'salary_max', 'salary_raw', 'loc_city', 'loc_state',
  'loc_country', 'loc_type', 'loc_display', 'loc_multi', 'search_vector',
  'job_lat', 'job_lng', 'salary_currency', 'salary_rate', 'industry',
  'ats_source', 'job_cat'
];

test('Partitioned table has all original columns', () => {
  // Check in the CREATE TABLE block (between PARTITION BY and the first CREATE TABLE ... PARTITION OF)
  const createBlock = migrationSql.split('PARTITION BY LIST')[0];
  requiredColumns.forEach(col => {
    assert(createBlock.includes(col), `Missing column: ${col}`);
  });
});

test('ats_source has NOT NULL constraint', () => {
  assert(migrationSql.includes("ats_source") && migrationSql.includes("NOT NULL"), 'ats_source missing NOT NULL');
});

// ─── Indexes ─────────────────────────────────────────────────────────
const requiredIndexes = [
  'ats_jobs_source_id_unique',
  'idx_ats_jobs_location_structured',
  'idx_ats_jobs_source_status',
  'idx_ats_jobs_status_updated',
  'idx_ats_jobs_company_name',
  'idx_ats_jobs_slug_source_status',
  'idx_ats_jobs_first_seen_status',
  'idx_ats_jobs_salary',
  'idx_ats_jobs_closed_at',
  'idx_ats_jobs_status',
  'idx_ats_jobs_loc_state',
  'idx_ats_jobs_geospatial',
  'idx_ats_jobs_updated_at',
  'idx_ats_jobs_company_slug',
  'idx_ats_jobs_remote',
  'idx_ats_jobs_title_trgm',
  'idx_ats_jobs_company_trgm',
  'idx_ats_jobs_search_vector'
];

test('All indexes recreated on partitioned table', () => {
  requiredIndexes.forEach(idx => {
    assert(migrationSql.includes(`CREATE ${idx.includes('unique') ? 'UNIQUE ' : ''}INDEX ${idx}`), `Missing index: ${idx}`);
  });
});

test('Unique index includes partition key', () => {
  assert(migrationSql.includes('(greenhouse_id, ats_source)'), 'Unique index must include partition key');
});

test('GIN trgm indexes preserved', () => {
  assert(migrationSql.includes('gin_trgm_ops'), 'Missing GIN trgm operator class');
});

test('GIN search_vector index added', () => {
  assert(migrationSql.includes('idx_ats_jobs_search_vector'), 'Missing search_vector GIN index');
});

// ─── Old indexes dropped before rename ───────────────────────────────
test('Old indexes explicitly dropped', () => {
  const drops = [
    'ats_jobs_source_id_unique',
    'idx_ats_jobs_source_status',
    'idx_ats_jobs_title_trgm',
    'idx_ats_jobs_company_trgm'
  ];
  drops.forEach(idx => {
    assert(migrationSql.includes(`DROP INDEX IF EXISTS ${idx}`), `Missing DROP for old index: ${idx}`);
  });
});

// ─── RLS ─────────────────────────────────────────────────────────────
test('RLS enabled on partitioned table', () => {
  // Check for ENABLE ROW LEVEL SECURITY after the partition creation
  const afterPartition = migrationSql.split('DROP TABLE ats_jobs_pre_partition')[0];
  assert(afterPartition.includes('ALTER TABLE ats_jobs ENABLE ROW LEVEL SECURITY'), 'Missing RLS enable');
});

test('public_read_ats_jobs policy recreated', () => {
  const afterPartition = migrationSql.split('Recreate RLS')[1] || '';
  assert(afterPartition.includes('public_read_ats_jobs'), 'Missing public_read policy');
  assert(afterPartition.includes('USING (true)'), 'Missing USING (true) on public read');
});

test('admin_manage_ats_jobs policy recreated', () => {
  const afterPartition = migrationSql.split('Recreate RLS')[1] || '';
  assert(afterPartition.includes('admin_manage_ats_jobs'), 'Missing admin_manage policy');
});

test('Old RLS policies dropped before rename', () => {
  assert(migrationSql.includes('DROP POLICY IF EXISTS "public_read_ats_jobs"'), 'Missing DROP old public_read policy');
  assert(migrationSql.includes('DROP POLICY IF EXISTS "admin_manage_ats_jobs"'), 'Missing DROP old admin_manage policy');
});

// ─── Trigger ─────────────────────────────────────────────────────────
test('Change log trigger recreated', () => {
  assert(migrationSql.includes('CREATE TRIGGER trg_ats_jobs_change_log'), 'Missing trigger creation');
  assert(migrationSql.includes('fn_ats_jobs_change_log()'), 'Missing trigger function reference');
});

test('Old trigger dropped before rename', () => {
  assert(migrationSql.includes('DROP TRIGGER IF EXISTS trg_ats_jobs_change_log ON ats_jobs'), 'Missing old trigger drop');
});

// ─── Data migration ──────────────────────────────────────────────────
test('Data copied with COALESCE on ats_source', () => {
  assert(migrationSql.includes("COALESCE(ats_source, 'greenhouse')"), 'Missing COALESCE fallback for NULL ats_source');
});

test('INSERT INTO selects all columns', () => {
  requiredColumns.forEach(col => {
    // Just check that the column name appears in the INSERT section
    const insertSection = migrationSql.split('INSERT INTO ats_jobs')[1]?.split('FROM ats_jobs_pre_partition')[0] || '';
    assert(insertSection.includes(col), `Missing column in data copy: ${col}`);
  });
});

// ─── Vacuum schedules ────────────────────────────────────────────────
test('Per-partition VACUUM schedules created', () => {
  assert(migrationSql.includes("'vacuum-ats-jobs-ats'"), 'Missing ats vacuum schedule');
  assert(migrationSql.includes("'vacuum-ats-jobs-common-crawl'"), 'Missing common_crawl vacuum schedule');
  assert(migrationSql.includes("'vacuum-ats-jobs-amazon'"), 'Missing amazon vacuum schedule');
  assert(migrationSql.includes("'vacuum-ats-jobs-default'"), 'Missing default vacuum schedule');
});

test('ATS partition vacuumed daily', () => {
  const atsSection = migrationSql.split('vacuum-ats-jobs-ats')[1]?.split('cron.schedule')[0] || '';
  assert(atsSection.includes('* * *'), 'ATS vacuum should be daily');
});

test('Common Crawl partition vacuumed after ingestion window', () => {
  const ccSection = migrationSql.split('vacuum-ats-jobs-common-crawl')[1]?.split('cron.schedule')[0] || '';
  assert(ccSection.includes('0 6'), 'CC vacuum should be at 6 AM UTC');
});

// ─── Monitoring ──────────────────────────────────────────────────────
test('v_partition_stats view created', () => {
  assert(migrationSql.includes('CREATE OR REPLACE VIEW v_partition_stats'), 'Missing partition stats view');
});

test('v_partition_stats shows partition sizes', () => {
  assert(migrationSql.includes('pg_relation_size'), 'Missing relation size in view');
  assert(migrationSql.includes('pg_indexes_size'), 'Missing indexes size in view');
  assert(migrationSql.includes('pg_total_relation_size'), 'Missing total size in view');
});

test('fn_partition_health function created', () => {
  assert(migrationSql.includes('CREATE OR REPLACE FUNCTION fn_partition_health'), 'Missing partition health function');
});

test('fn_partition_health returns vacuum-needed assessment', () => {
  assert(migrationSql.includes('needs_vacuum boolean'), 'Missing needs_vacuum in return type');
  assert(migrationSql.includes('dead_tuple_ratio'), 'Missing dead_tuple_ratio in return type');
});

// ─── CrewAI integration ──────────────────────────────────────────────
test('Agent action log entry created', () => {
  assert(migrationSql.includes('agent_action_log'), 'Missing agent_action_log insert');
  assert(migrationSql.includes('partition_migration'), 'Missing partition_migration action type');
});

// ─── ADR documentation ──────────────────────────────────────────────
test('ADR-06 documents SA-019', () => {
  assert(adrContent.includes('SA-019'), 'ADR-06 missing SA-019 section');
});

test('ADR-06 documents IMPLEMENTED status', () => {
  assert(adrContent.includes('IMPLEMENTED'), 'ADR-06 missing IMPLEMENTED status');
});

test('ADR-06 documents partition layout', () => {
  assert(adrContent.includes('ats_jobs_ats'), 'ADR-06 missing ats_jobs_ats');
  assert(adrContent.includes('ats_jobs_common_crawl'), 'ADR-06 missing ats_jobs_common_crawl');
  assert(adrContent.includes('ats_jobs_amazon'), 'ADR-06 missing ats_jobs_amazon');
  assert(adrContent.includes('ats_jobs_default'), 'ADR-06 missing ats_jobs_default');
});

test('ADR-06 documents HOOK & SCAR points', () => {
  assert(adrContent.includes('`DEFAULT` partition'), 'ADR-06 missing DEFAULT partition hook');
  assert(adrContent.includes('fn_partition_health'), 'ADR-06 missing health function hook');
  assert(adrContent.includes('DETACH/ATTACH'), 'ADR-06 missing detach/attach scar');
});

test('ADR-06 documents migration strategy', () => {
  assert(adrContent.includes('rename-create-copy-drop'), 'ADR-06 missing migration strategy');
});

test('ADR-06 documents maintenance schedules', () => {
  assert(adrContent.includes('Daily 4 AM UTC'), 'ADR-06 missing ATS vacuum schedule');
  assert(adrContent.includes('Daily 6 AM UTC'), 'ADR-06 missing CC vacuum schedule');
});

test('ADR-06 documents transparent application layer', () => {
  assert(adrContent.includes('Transparent to Application Layer'), 'ADR-06 missing transparency note');
});

// ─── Comments and documentation ──────────────────────────────────────
test('All partitions have COMMENT ON TABLE', () => {
  ['ats_jobs_ats', 'ats_jobs_common_crawl', 'ats_jobs_amazon', 'ats_jobs_default'].forEach(p => {
    assert(migrationSql.includes(`COMMENT ON TABLE ${p}`), `Missing comment on ${p}`);
  });
});

test('Parent table has COMMENT', () => {
  assert(migrationSql.includes('COMMENT ON TABLE ats_jobs IS'), 'Missing comment on parent table');
});

test('View has COMMENT', () => {
  assert(migrationSql.includes('COMMENT ON VIEW v_partition_stats'), 'Missing comment on view');
});

test('Function has COMMENT', () => {
  assert(migrationSql.includes('COMMENT ON FUNCTION fn_partition_health'), 'Missing comment on function');
});

// ─── Ordering: drops before rename, creates after ────────────────────
test('Trigger drop precedes rename', () => {
  const dropPos = migrationSql.indexOf('DROP TRIGGER IF EXISTS trg_ats_jobs_change_log');
  const renamePos = migrationSql.indexOf('RENAME TO ats_jobs_pre_partition');
  assert(dropPos < renamePos, 'Trigger must be dropped before table rename');
});

test('Index drops precede rename', () => {
  const dropPos = migrationSql.indexOf('DROP INDEX IF EXISTS ats_jobs_source_id_unique');
  const renamePos = migrationSql.indexOf('RENAME TO ats_jobs_pre_partition');
  assert(dropPos < renamePos, 'Indexes must be dropped before table rename');
});

test('RLS policy drops precede rename', () => {
  const dropPos = migrationSql.indexOf('DROP POLICY IF EXISTS "public_read_ats_jobs"');
  const renamePos = migrationSql.indexOf('RENAME TO ats_jobs_pre_partition');
  assert(dropPos < renamePos, 'RLS policies must be dropped before table rename');
});

test('Data copy precedes old table drop', () => {
  const copyPos = migrationSql.indexOf('FROM ats_jobs_pre_partition');
  const dropPos = migrationSql.indexOf('DROP TABLE ats_jobs_pre_partition');
  assert(copyPos < dropPos, 'Data copy must precede old table drop');
});

test('Row count verification precedes old table drop', () => {
  const verifyPos = migrationSql.indexOf('DATA LOSS DETECTED');
  const dropPos = migrationSql.indexOf('DROP TABLE ats_jobs_pre_partition');
  assert(verifyPos < dropPos, 'Verification must precede old table drop');
});

// ─── Attribution ─────────────────────────────────────────────────────
test('Migration has SA-019 attribution', () => {
  assert(migrationSql.includes('SA-019'), 'Missing SA-019 attribution in migration');
});

// ─── Summary ─────────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(60)}`);
console.log(`SA-019 Validation: ${passed} passed, ${failed} failed (${passed + failed} total)`);
console.log(`${'═'.repeat(60)}\n`);

process.exit(failed > 0 ? 1 : 0);
