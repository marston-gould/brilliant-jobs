# Handoff: Common Crawl Board Discovery Pipeline

**Roadmap Phase:** 73  
**Group:** inventory-expansion  
**Estimate:** 3h  
**Status:** Todo  
**Created:** March 2, 2026  
**Updated:** March 4, 2026  
**Author:** Marston + Claude (Pod 2)

---

## 1. Problem

Board discovery currently relies on DataForSEO alphabet crawls (~$10/run, 702 queries per platform) and manual methods. To reach the 1M jobs target, we need a scalable, low-cost way to continuously discover new company job boards across all ATS platforms and beyond.

## 2. Solution

Use Common Crawl's open dataset — billions of crawled web pages, released monthly — to extract ATS board URLs and career page URLs at near-zero cost. Common Crawl has already done the scraping. We just query their index.

**Scale context:** Common Crawl discovery is expected to 2–3x the known company board count (e.g., TheirStack detects ~24,700 Greenhouse installs vs Greenhouse's self-reported 7,500 customers). At 800K–1M live jobs, storage and I/O constraints become critical. The architecture below is designed specifically to handle this scale without overwhelming Supabase.

---

## 3. Athena → Supabase Strategy (Critical — Read First)

This section must be understood before implementing anything else. At 800K–1M jobs, naive bulk ingestion will break the database.

### Current Storage Reality

At ~400K jobs, `ats_jobs` already consumes:
- Raw table: **453 MB**
- Indexes: **1,216 MB** (2.7x the raw table — the real pressure point)
- TOAST (JD text): **~2.5 GB**
- **Total: ~4.1 GB for jobs alone; 4.7 GB total DB**

At 800K–1M jobs this roughly doubles to **8–12 GB**, with index maintenance overhead during bulk writes being the primary I/O risk.

### The Rule: Athena Feeds `ats_companies` Only — Never `ats_jobs`

Common Crawl discovery must **never write directly to `ats_jobs`**. It only writes newly discovered slugs to `ats_companies`. The existing `refresh-jobs` polling cron then picks up new boards and ingests jobs gradually through the normal batched path.

This keeps job ingestion incremental and controlled regardless of how many new boards are discovered in a single crawl run.

### Pipeline Architecture

```
Common Crawl (S3, public)
    │
    ├── [Free Index API] ATS-specific slug extraction
    │     └── Edge Function / Python script
    │           └── Batched upsert → ats_companies only
    │
    └── [AWS Athena] Broad career page discovery
          ├── Partitioned query on url_host_name (cheap)
          ├── Output → S3 results bucket (your AWS account)
          ├── Lambda or scheduled Edge Function reads S3
          └── Batched upsert → ats_companies only
                    │
                    └── [Existing refresh-jobs cron]
                          └── Polls new boards → ats_jobs (incremental)
```

### Athena Query Design (I/O Cost Control)

Always filter on partitioned columns first — `crawl` and `subset` are free. Unpartitioned column scans cost money.

```sql
-- CORRECT: partitioned columns filtered first
SELECT DISTINCT
  url_host_name,
  regexp_extract(url_path, '^/([^/]+)', 1) AS company_slug
FROM "ccindex"."ccindex"
WHERE crawl = 'CC-MAIN-2025-08'          -- partitioned = free
  AND subset = 'warc'                     -- partitioned = free
  AND url_host_name IN (                  -- columnar filter = cheap
    'boards.greenhouse.io',
    'job-boards.greenhouse.io',
    'jobs.lever.co',
    'jobs.ashbyhq.com',
    'apply.workable.com'
  )
  AND fetch_status = 200;

-- WRONG: no partition filter = full ~300GB scan = $1.50+
SELECT * FROM "ccindex"."ccindex"
WHERE url_host_name = 'boards.greenhouse.io';
```

### Supabase Write Pattern

Never insert all discovered slugs in one statement. Always batch:

```sql
-- Safe batch upsert pattern (500 rows at a time)
INSERT INTO ats_companies (slug, source, is_active, first_seen_at)
SELECT slug, source, true, now()
FROM (VALUES (...)) AS batch(slug, source)
ON CONFLICT (slug, source) DO NOTHING;
```

Large single upserts against a composite PK table will cause lock contention. 500-row batches with small delays between are safe.

### Trigger Options for S3 → Supabase Bridge

| Option | Complexity | Latency | Recommended |
|--------|-----------|---------|-------------|
| S3 Event → Lambda → Supabase | Medium | Near-real-time | ✅ Best for production |
| Scheduled Edge Function polls S3 | Low | Hours | ✅ Fine for monthly crawl cadence |
| Manual trigger post-Athena | Lowest | On-demand | OK for initial setup |

Given the monthly crawl cadence, a **scheduled Edge Function that reads the S3 output file after Athena completes** is the simplest viable path. No need for Lambda unless near-real-time discovery becomes a requirement.

---

## 4. Validated ATS URL Patterns

Tested against `CC-MAIN-2025-08` crawl. All return results.

| Platform | Common Crawl Index Query | Status |
|----------|--------------------------|--------|
| Greenhouse | `boards.greenhouse.io/*` | ✅ Tons of results |
| Lever | `jobs.lever.co/*` | ✅ Tons of results |
| Ashby | `jobs.ashbyhq.com/*` | ✅ Tons of results |
| Workable | `apply.workable.com/*` | ✅ Tons of results |
| Recruitee | `*.recruitee.com/*` | ⚠️ Needs subdomain pattern (not `recruitee.com/*`) |

**Slug extraction** is trivial — first path segment after domain:
- `boards.greenhouse.io/{slug}` → slug
- `jobs.lever.co/{slug}` → slug
- `jobs.ashbyhq.com/{slug}` → slug
- `apply.workable.com/{slug}` → slug

## 5. Two Access Methods

### 5A. Free Index API (for ATS-specific queries)

Zero cost. No AWS account needed. Just HTTP GET requests.

```
https://index.commoncrawl.org/CC-MAIN-2025-08-index?url=boards.greenhouse.io/*&output=json&limit=10000
```

**Available indexes:** `https://index.commoncrawl.org/collinfo.json`

Each result returns:
- `url` — full URL with company slug
- `status` — HTTP status (200 = active, 302/404 = dead/redirect)
- `timestamp` — when it was crawled
- `languages`, `encoding`, `mime` — metadata

**Limitation:** Wildcard queries are domain-prefix based. Cannot do suffix matching (e.g., `*/careers`). For that, use Athena.

### 5B. AWS Athena (for broad career page discovery)

Costs $5/TB scanned. Index is ~300GB per crawl = **$1.50 max per crawl**.

**Setup (one-time, ~10 min):**
1. AWS account in `us-east-1`
2. Create S3 bucket for query results
3. Create database + table in Athena (SQL from Common Crawl docs)
4. Run `MSCK REPAIR TABLE` to discover partitions

**Key queries:**

```sql
-- Count all /careers pages across the web
SELECT COUNT(*) AS count, url_host_registered_domain
FROM "ccindex"."ccindex"
WHERE crawl = 'CC-MAIN-2025-08'
  AND subset = 'warc'
  AND url_path LIKE '%/careers%'
  AND fetch_status = 200
  AND content_mime_type = 'text/html'
GROUP BY url_host_registered_domain
ORDER BY count DESC
LIMIT 1000;

-- ATS-specific extraction (cheaper — filters on host)
SELECT DISTINCT
  url_host_name,
  regexp_extract(url_path, '^/([^/]+)', 1) AS company_slug
FROM "ccindex"."ccindex"
WHERE crawl = 'CC-MAIN-2025-08'
  AND subset = 'warc'
  AND url_host_name IN (
    'boards.greenhouse.io',
    'job-boards.greenhouse.io',
    'jobs.lever.co',
    'jobs.ashbyhq.com',
    'apply.workable.com'
  )
  AND fetch_status = 200;

-- Discover non-ATS career pages (Workday, iCIMS, etc.)
SELECT url_host_registered_domain, url, fetch_status
FROM "ccindex"."ccindex"
WHERE crawl = 'CC-MAIN-2025-08'
  AND subset = 'warc'
  AND (
    url_host_name LIKE '%.myworkdayjobs.com'
    OR url_host_name LIKE '%.icims.com'
    OR url_host_name LIKE '%.taleo.net'
    OR url_host_name LIKE '%.smartrecruiters.com'
    OR url_host_name LIKE '%.bamboohr.com'
    OR url_host_name LIKE '%.jobvite.com'
    OR url_host_name LIKE '%.jazz.co'
  )
  AND fetch_status = 200
LIMIT 5000;
```

**Cost optimization tips:**
- Always filter on `crawl` and `subset` (partitioned columns = free)
- Select only columns you need (columnar format = less scan)
- Filter on `url_host_tld` when possible
- Start with `LIMIT` during development

## 6. Implementation Plan

### Step 1: ATS Board Extraction via Free API (1h)

Build a script (Edge Function or local Python) that:

1. Queries Common Crawl index API for each ATS pattern
2. Extracts unique company slugs from URL paths
3. Filters to `status: 200` only
4. Deduplicates
5. Diffs against current `ats_companies` table
6. **Batched upsert of net-new boards only (500 rows/batch) — never bulk insert**

```python
import urllib.request, json

ATS_PATTERNS = {
    'greenhouse': 'boards.greenhouse.io',
    'lever': 'jobs.lever.co',
    'ashby': 'jobs.ashbyhq.com',
    'workable': 'apply.workable.com',
}

CRAWL = 'CC-MAIN-2025-08'

for source, domain in ATS_PATTERNS.items():
    url = f"https://index.commoncrawl.org/{CRAWL}-index?url={domain}/*&output=json&limit=100000"
    resp = urllib.request.urlopen(url).read().decode()
    
    slugs = set()
    for line in resp.strip().split('\n'):
        record = json.loads(line)
        if record.get('status') == '200':
            path = record['url'].split(domain + '/')[1].split('/')[0].split('?')[0]
            if path and not path.startswith('api'):
                slugs.add(path.lower())
    
    print(f"{source}: {len(slugs)} unique slugs")
    # Diff against ats_companies and insert net-new in 500-row batches
```

### Step 2: Monthly Discovery Cron (1h)

- GitHub Action or pg_cron + Edge Function
- Runs on 1st of each month
- Checks `https://index.commoncrawl.org/collinfo.json` for latest crawl ID
- Runs Step 1 extraction against latest crawl
- Logs results to `refresh_log` or new `discovery_log` table
- New boards enter existing refresh pipeline automatically

### Step 3: Broad Career Page Discovery via Athena (1h, optional)

- Set up Athena table (one-time)
- Run `/careers` and `/jobs` path queries
- Output to S3 results bucket
- Scheduled Edge Function reads S3 output and batched-upserts to `ats_companies`
- Cross-reference with known ATS domains to identify platform
- Run quarterly

## 7. Data Flow

```
Common Crawl monthly release
  │
  ├── [Monthly cron] Index API queries for 4 ATS patterns
  │     ├── Extract unique company slugs
  │     ├── Diff against ats_companies
  │     ├── Batched upsert net-new boards only (500/batch)
  │     │     └── ats_companies (slug, source, is_active=true, tier=COLD)
  │     └── refresh-jobs picks up new boards automatically (incremental)
  │
  └── [Quarterly] Athena broad path queries
        ├── Output → S3 results bucket
        ├── Edge Function reads S3 → batched upsert → ats_companies
        └── Inventory for future platform expansion
```

## 8. Bonus Intelligence in the Data

Common Crawl results include metadata that's useful beyond just slug discovery:

- **HTTP status codes** — board validation baked in (200 = live, 404 = dead)
- **Timestamps** — freshness signal for board activity
- **UTM parameters in URLs** — reveals which job aggregators link to which boards (competitive intel)
- **Redirect chains** — shows domain migrations (e.g., `boards.greenhouse.io` → `job-boards.greenhouse.io`)
- **Language tags** — can filter for English-only boards

## 9. Cost Comparison

| Method | Cost per Run | Frequency | Annual Cost |
|--------|-------------|-----------|-------------|
| DataForSEO alphabet crawl | ~$10 | Monthly | ~$120 |
| Common Crawl free API | $0 | Monthly | $0 |
| Common Crawl Athena (broad) | ~$1.50 | Quarterly | ~$6 |
| **Total Common Crawl** | | | **~$6/year** |

## 10. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Common Crawl misses very new/small companies | Low — DataForSEO and board_discovery_queue cover these | Keep DataForSEO as supplemental source |
| Index API rate limiting | Low — queries are infrequent | Add retry logic, space requests |
| Stale data (crawl is weeks old) | Low — boards don't change frequently | First refresh validates board is still live |
| AWS Athena cost overrun | Very low — max $1.50/query | Set Athena workgroup cost limit |
| Supabase I/O overload from bulk discovery write | Medium at 800K+ jobs scale | Mitigated by writing only to ats_companies in 500-row batches; jobs ingest via existing cron |
| Index bloat as job count doubles | Medium — indexes already 2.7x raw table size | Monitor pg_indexes_size; audit indexes before scaling past 600K jobs |

## 11. Success Metrics

- Net-new boards discovered per monthly run
- % of discovered boards that are active (expect >90%)
- Time from board discovery to first job refresh
- Total board count trajectory toward 100K+ target
- Jobs per dollar spent on discovery ($0 for API method)
- DB total size and index ratio after each major ingestion wave

## 12. Dependencies

- None for free API method (can start immediately)
- AWS account for Athena method (optional, for broad discovery)
- Existing `ats_companies` table and `refresh-jobs` Edge Function (already in place)

## 13. Test URLs

Paste these in your browser to verify:

```
# Greenhouse
https://index.commoncrawl.org/CC-MAIN-2025-08-index?url=boards.greenhouse.io/*&output=json&limit=20

# Lever
https://index.commoncrawl.org/CC-MAIN-2025-08-index?url=jobs.lever.co/*&output=json&limit=20

# Ashby
https://index.commoncrawl.org/CC-MAIN-2025-08-index?url=jobs.ashbyhq.com/*&output=json&limit=20

# Workable
https://index.commoncrawl.org/CC-MAIN-2025-08-index?url=apply.workable.com/*&output=json&limit=20

# Available crawl indexes
https://index.commoncrawl.org/collinfo.json
```
