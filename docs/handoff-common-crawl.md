# Handoff: Common Crawl Board Discovery Pipeline

**Roadmap Phase:** 73  
**Group:** inventory-expansion  
**Estimate:** 3h  
**Status:** Todo  
**Created:** March 2, 2026  
**Author:** Marston + Claude (Pod 2)

---

## 1. Problem

Board discovery currently relies on DataForSEO alphabet crawls (~$10/run, 702 queries per platform) and manual methods. To reach the 1M jobs target, we need a scalable, low-cost way to continuously discover new company job boards across all ATS platforms and beyond.

## 2. Solution

Use Common Crawl's open dataset — billions of crawled web pages, released monthly — to extract ATS board URLs and career page URLs at near-zero cost. Common Crawl has already done the scraping. We just query their index.

## 3. Validated ATS URL Patterns

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

## 4. Two Access Methods

### 4A. Free Index API (for ATS-specific queries)

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

### 4B. AWS Athena (for broad career page discovery)

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

## 5. Implementation Plan

### Step 1: ATS Board Extraction via Free API (1h)

Build a script (Edge Function or local Python) that:

1. Queries Common Crawl index API for each ATS pattern
2. Extracts unique company slugs from URL paths
3. Filters to `status: 200` only
4. Deduplicates
5. Diffs against current `ats_companies` table
6. Bulk-inserts net-new boards with `source` and `is_active = true`

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
    # Diff against ats_companies and insert net-new
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
- Cross-reference with known ATS domains to identify platform
- Build inventory of non-ATS career pages for future platform expansion
- Run quarterly

## 6. Data Flow

```
Common Crawl monthly release
  │
  ├── [Monthly cron] Index API queries for 4 ATS patterns
  │     ├── Extract unique company slugs
  │     ├── Diff against ats_companies
  │     ├── Insert net-new boards (is_active: true, tier: COLD)
  │     └── refresh-jobs picks up new boards automatically
  │
  └── [Quarterly] Athena broad path queries
        ├── /careers and /jobs across all domains
        ├── ATS platform identification by URL pattern
        └── Inventory for future platform expansion
```

## 7. Bonus Intelligence in the Data

Common Crawl results include metadata that's useful beyond just slug discovery:

- **HTTP status codes** — board validation baked in (200 = live, 404 = dead)
- **Timestamps** — freshness signal for board activity
- **UTM parameters in URLs** — reveals which job aggregators link to which boards (competitive intel)
- **Redirect chains** — shows domain migrations (e.g., `boards.greenhouse.io` → `job-boards.greenhouse.io`)
- **Language tags** — can filter for English-only boards

## 8. Cost Comparison

| Method | Cost per Run | Frequency | Annual Cost |
|--------|-------------|-----------|-------------|
| DataForSEO alphabet crawl | ~$10 | Monthly | ~$120 |
| Common Crawl free API | $0 | Monthly | $0 |
| Common Crawl Athena (broad) | ~$1.50 | Quarterly | ~$6 |
| **Total Common Crawl** | | | **~$6/year** |

## 9. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Common Crawl misses very new/small companies | Low — DataForSEO and board_discovery_queue cover these | Keep DataForSEO as supplemental source |
| Index API rate limiting | Low — queries are infrequent | Add retry logic, space requests |
| Stale data (crawl is weeks old) | Low — boards don't change frequently | First refresh validates board is still live |
| AWS Athena cost overrun | Very low — max $1.50/query | Set Athena workgroup cost limit |

## 10. Success Metrics

- Net-new boards discovered per monthly run
- % of discovered boards that are active (expect >90%)
- Time from board discovery to first job refresh
- Total board count trajectory toward 100K+ target
- Jobs per dollar spent on discovery ($0 for API method)

## 11. Dependencies

- None for free API method (can start immediately)
- AWS account for Athena method (optional, for broad discovery)
- Existing `ats_companies` table and `refresh-jobs` Edge Function (already in place)

## 12. Test URLs

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
