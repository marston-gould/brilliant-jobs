# BRILLIANT JOBS

**Scaling Architecture Chat Session Plan**

*Session-by-Session Execution Plan for SA-001 through SA-026*

All 6 ADRs + CSS/Design System + Platform Evolution \| 5 Phases \| 26
Sessions

March 2026 --- CONFIDENTIAL

Owners: TPM + Marston

*Source: Scaling_Architecture_Design_Plan v1.0*

**Session Lifecycle Protocol**

Every chat session in this scaling plan follows the same 8-step
lifecycle established in the remediation plan. This is non-negotiable.
The lifecycle ensures that no infrastructure change ships without
testing, no deploy goes unverified, no environment drifts, and no
document is stale.

  **Step**   **Action**   **Detail**

  **Step 0** ENTRY GATE   Verify prerequisites from prior sessions are met.

  **Step 1** DEVELOP      Write and review code/infrastructure changes.

  **Step 2** TEST (LOCAL) Run automated tests + manual verification locally
                          / in CI.

  **Step 3** DEPLOY TO    Push to production (Vercel, Supabase, Typesense,
             PROD         etc.).

  **Step 4** TEST (PROD)  Validate the change in the live production
                          environment.

  **Step 5** SYNC ENVS    Apply changes to staging + dev. Confirm all
                          environments match.

  **Step 6** VERSION BUMP Tag all affected surfaces. Respect semver.

  **Step 7** UPDATE DOCS  Update ADR implementation logs. Write handoff for
                          next session.

  **Step 8** UPDATE       Update ROADMAP.md and /roadmap page with session
             ROADMAP      completion.

> *ADDITION FOR SCALING PLAN: At each phase transition (S1→S2, S2→S3,
> S3→S4, S4→S5), the Evolvability Strategist conducts a formal review
> before the next phase begins. The Chief Architect reviews all hook and
> scar implementations for extensibility. These reviews are async and do
> not block sessions, but critical findings can trigger scope
> adjustments in upcoming sessions.*

**Session Overview by Phase**

  **Phase**        **Sessions**     **Timeline**   **ADRs Covered**

  Phase S1:        SA-001 → SA-006  Weeks 1-4      ADR-01, ADR-03, ADR-04
  Foundation                                       P1

  Phase S2:        SA-007 → SA-012  Weeks 3-8      ADR-05, ADR-06
  Automation +                                     
  Data                                             

  Phase S3:        SA-013 → SA-017  Weeks 5-12     ADR-02, ADR-04 P2-4,
  Frontend Modern.                                 CSS/Design System

  Phase S4: Scale  SA-018 → SA-023  Weeks 10-16    ADR-04 P5-6, ADR-06,
  Validation                                       All

  Phase S5:        SA-024 → SA-026  Weeks 14-20    Event Bus, Feature
  Platform                                         Flags, Fitness
  Evolution                                        Functions

**Dependency Chain**

Sessions must execute in order within each phase. Cross-phase
parallelism is permitted where noted.

> *SA-001 (Typesense) → SA-002 (Sync) → SA-003 (Search swap) \| SA-004
> (Gateway) → SA-005 (All EFs) \| SA-006 (TypeScript core) --- all Phase
> S1, can overlap*
>
> *SA-007 (Common Crawl) → SA-008 (Dedup) → SA-009 (Incremental MV) \|
> SA-010 (CrewAI framework) → SA-011 (Agents 2-3) → SA-012 (Graduation)
> --- Phase S2, starts Week 3*
>
> *SA-013 (SPA scaffold + design system) → SA-014 (Feed) → SA-015
> (Pipeline/Keywords) → SA-016 (Stats/Settings) → SA-017 (Remaining
> dashboard + admin + legacy removal) --- Phase S3, strictly sequential.
> CSS/Tailwind Eng pairs on every session.*
>
> *SA-018 (Read replica) → SA-019 (Partitioning) \| SA-020 (Agents 4-5)
> → SA-021 (Agent 6 + graduation) \| SA-022 (TS extension/EF) → SA-023
> (Load test) --- Phase S4*
>
> *SA-023 (Load test passed) → SA-024 (Event bus) → SA-025 (Feature
> flags) → SA-026 (Fitness functions + evolvability) --- Phase S5,
> strictly sequential. SA-024 can overlap with SA-022 if load test is
> not yet complete.*

Critical cross-phase dependencies:

> *SA-005 (gateway complete) MUST precede SA-010 (CrewAI agents route
> through gateway).*
>
> *SA-006 (TypeScript core) MUST precede SA-013 (SPA scaffold uses typed
> core modules).*
>
> *SA-002 (sync queue) MUST precede SA-007 (Common Crawl records
> auto-sync to Typesense).*
>
> *SA-005 (gateway middleware plugin architecture) MUST precede SA-024
> (webhook dispatcher is a gateway middleware).*
>
> *SA-017 (SPA with data providers) MUST precede SA-025 (feature flag
> SDK integrates with React component tree).*
>
> *SPA SCOPE: Only authenticated surfaces (dashboard + admin) are
> migrated to SPA. Public-facing pages (landing page, /jobs/\*,
> /companies/\*, /blog/\*) remain static or server-rendered for SEO. The
> extension is not part of the SPA --- it has its own build pipeline.*

Evolvability Review Protocol:

> *EVOLVABILITY REVIEW GATES: The Evolvability Strategist conducts a
> formal architecture review at each phase transition (S1→S2, S2→S3,
> S3→S4, S4→S5). Reviews evaluate: hook point utilization (are hooks
> being used or orphaned?), scar point readiness (are scars still soft
> enough to cut open?), technical debt accumulation, dependency health,
> and architectural drift from ADR decisions. Reviews are async and do
> not block sessions --- but findings are flagged to Marston and the
> Chief Architect, and critical findings can trigger session scope
> adjustments.*

**Phase S1: Foundation (Weeks 1-4)**

Phase S1 lays the infrastructure foundation: dedicated search
(Typesense), unified API gateway with a middleware plugin architecture
(the primary extensibility hook), TypeScript core migration, and API
consumer management (the scar for future third-party access). Three
parallel tracks execute simultaneously: search (SA-001 to SA-003),
gateway (SA-004 to SA-005), and TypeScript (SA-006). The Lead Platform
Engineer and Chief Architect review all foundation decisions for
long-term extensibility.

**SA-001: Typesense Cloud Setup + Schema Design + Initial Index**

*Infrastructure + Backend \| ADR: ADR-01 (Search) \| Hours: 10-14h \|
Pair: Data Eng + DevOps*

  **Step**    **Action**      **Detail**

  **0. Entry  Verify          All 24 remediation sessions complete. Feature
  Gate**      prerequisites   freeze lifted. Typesense Cloud account created.
                              Supabase Pro plan confirmed. PostHog operational
                              on all surfaces.

  **1.        Provision +     Provision Typesense Cloud cluster (2-vCPU / 4GB
  Develop**   schema          RAM). Define collection schema for ats_jobs:
                              fields (title, company, location, description,
                              source, created_at, salary_min, salary_max),
                              facets (source, location_state, remote_flag),
                              sort fields (created_at, relevance). Write seed
                              script that exports first 10K rows from Supabase
                              ats_jobs and imports to Typesense via REST API.

  **2. Test   Validate schema Run seed script against Typesense Cloud. Execute
  (local)**                   20 sample search queries comparing Postgres FTS
                              results vs Typesense results. Verify facet
                              counts. Verify typo tolerance (1-2 character
                              distance). Measure p50/p95 latency on 10K doc
                              index.

  **3. Deploy Push infra      Commit Typesense connection config as Supabase
  to Prod**   config          Vault secrets (TYPESENSE_HOST,
                              TYPESENSE_API_KEY). Deploy seed Edge Function.
                              Run full initial index: all ~400K ats_jobs rows
                              exported and imported to Typesense.

  **4. Test   Validate full   Verify document count matches ats_jobs row count
  (prod)**    index           (within 0.1%). Run 50 production-representative
                              search queries. Verify p50 \< 50ms, p95 \< 200ms
                              on full index. Verify all facet values populated.

  **5. Sync   Align all envs  Create staging Typesense collection with 10K doc
  Envs**                      subset. Add Typesense Vault secrets to staging
                              and dev Supabase projects. Verify seed script
                              works against all 3 environments.

  **6.        Tag             No surface version bumps (infrastructure only).
  Version                     Git tag: infra@typesense-v0.1.0. Commit schema
  Bump**                      definition file to docs/scaling/.

  **7. Update Handoff         Create ADR-01 implementation log in
  Docs**                      docs/scaling/adr-01-search.md. Document schema
                              decisions, index size at 400K docs, latency
                              baselines. Write handoff for SA-002.

  **8. Update Mark progress   Update ROADMAP.md Phase S: 'SA-001 Typesense
  Roadmap**                   provisioned + initial index --- DONE \[date\]'.
                              Update /roadmap page.

**SA-002: Sync Queue + Cron Job + Typesense Monitoring**

*Backend (Edge Functions + pg_cron) \| ADR: ADR-01 (Search) \| Hours:
12-16h \| Pair: Data Eng + Backend*

  **Step**    **Action**      **Detail**

  **0. Entry  Verify          SA-001 complete. Typesense Cloud running with
  Gate**      prerequisites   full 400K index. Vault secrets operational.
                              Schema finalized.

  **1.        Build sync      Create sync_queue table in Supabase (id,
  Develop**   layer           table_name, record_id, operation, created_at,
                              processed_at). Add Postgres trigger on ats_jobs
                              INSERT/UPDATE/DELETE that writes to sync_queue.
                              Build typesense-sync Edge Function: reads
                              unprocessed queue entries, batches (up to 500 per
                              call), pushes to Typesense, marks processed. Add
                              pg_cron job: runs typesense-sync every 30
                              seconds. Build weekly full re-index Edge Function
                              triggered by pg_cron (Sunday 3 AM UTC).

  **2. Test   Validate sync   Insert 100 test jobs in Supabase. Verify
  (local)**                   sync_queue populated within 1 second. Trigger
                              typesense-sync manually. Verify all 100 appear in
                              Typesense within 60 seconds. Update 10 jobs.
                              Verify updates propagate. Delete 5 jobs. Verify
                              deletions propagate. Test queue backlog: insert
                              5,000 jobs rapidly, verify sync catches up within
                              5 minutes.

  **3. Deploy Push to         Deploy sync_queue table migration. Deploy
  to Prod**   production      trigger. Deploy typesense-sync Edge Function.
                              Activate pg_cron job. Deploy weekly re-index
                              function. Add PostHog custom events:
                              typesense_sync_batch (count, duration),
                              typesense_sync_error, typesense_reindex_complete.

  **4. Test   Validate in     Create 5 test jobs via dashboard. Verify they
  (prod)**    production      appear in Typesense search within 60 seconds.
                              Update a job title. Verify Typesense reflects the
                              change within 60 seconds. Monitor PostHog for
                              sync events. Verify zero sync errors over 1 hour.

  **5. Sync   Align all envs  Deploy sync_queue table + trigger to staging and
  Envs**                      dev. Deploy sync Edge Function to all
                              environments. Activate pg_cron in staging only
                              (dev uses manual trigger).

  **6.        Tag             No surface version bumps. Git tag:
  Version                     infra@typesense-sync-v0.1.0.
  Bump**                      

  **7. Update Handoff         Document sync architecture in
  Docs**                      docs/scaling/adr-01-search.md. Add sync lag
                              monitoring dashboard instructions. Note:
                              dashboard still uses Postgres FTS --- Typesense
                              swap happens in SA-003. Write handoff.

  **8. Update Mark progress   Update ROADMAP.md Phase S: 'SA-002 Sync queue
  Roadmap**                   operational --- DONE \[date\]'.

**SA-003: Dashboard Search Swap: Postgres FTS to Typesense**

*Dashboard + Backend \| ADR: ADR-01 (Search) \| Hours: 14-18h \| Pair:
Data Eng + Frontend*

  **Step**    **Action**      **Detail**

  **0. Entry  Verify          SA-002 complete. Sync queue operational with \<
  Gate**      prerequisites   60s lag. Typesense index count matches ats_jobs
                              within 0.1%. Zero sync errors in past 24 hours.

  **1.        Swap search     Create typesense-search Edge Function: accepts
  Develop**   layer           query, filters, facets, pagination params.
                              Returns results in same shape as existing
                              Supabase RPC response (backward compatible).
                              Update dashboard search module: replace Supabase
                              RPC calls with typesense-search EF calls. Add
                              faceted search UI: source filter, location
                              filter, remote toggle. Add Postgres FTS fallback:
                              if Typesense returns error, fall back to existing
                              RPC with degraded badge shown to user.

  **2. Test   Validate swap   Run full search test suite against Typesense
  (local)**                   path. Compare top-20 results for 50
                              representative queries between Postgres FTS and
                              Typesense. Verify facet counts render correctly.
                              Test fallback: kill Typesense connection, verify
                              Postgres FTS activates with degraded badge. Test
                              typo tolerance: 'enginner' finds 'engineer'.
                              Verify sort options work (relevance, date,
                              salary).

  **3. Deploy Push to         Deploy typesense-search Edge Function. Deploy
  to Prod**   production      updated dashboard search module. Feature flag:
                              SEARCH_ENGINE=typesense (can revert to postgres
                              via admin panel). Deploy faceted search UI.

  **4. Test   Validate in     Execute 20 real searches on production. Verify
  (prod)**    production      results render correctly. Verify facets filter
                              correctly. Test fallback by temporarily revoking
                              Typesense API key in Vault. Verify PostHog tracks
                              search latency events. Confirm p50 \< 50ms, p95
                              \< 200ms.

  **5. Sync   Align all envs  Deploy typesense-search EF to staging and dev.
  Envs**                      Deploy dashboard updates to staging. Verify
                              feature flag works in all environments.

  **6.        Tag             Tag: dashboard@X.Y.Z-typesense-search. Note:
  Version                     X.Y.Z continues from last remediation version.
  Bump**                      

  **7. Update Handoff         Mark ADR-01 as IMPLEMENTED in
  Docs**                      docs/scaling/adr-01-search.md. Document fallback
                              behavior. Document faceted search UI. Write
                              handoff for SA-004.

  **8. Update Mark progress   Update ROADMAP.md Phase S: 'SA-003 Typesense
  Roadmap**                   search live on dashboard --- DONE \[date\]'.
                              ADR-01 complete.

**SA-004: API Gateway Skeleton + Auth Middleware + Plugin Architecture**

*Backend (Edge Functions) \| ADR: ADR-03 (Gateway) \| Hours: 14-18h \|
Pair: Backend + Security + Lead Platform Eng*

  **Step**    **Action**      **Detail**

  **0. Entry  Verify          SA-001 complete (Typesense operational ---
  Gate**      prerequisites   gateway will route search). Remediation auth
                              patterns established (CS-001 through CS-006).
                              Rate limiting patterns from remediation available
                              as reference. Chief Architect and Lead Platform
                              Engineer have reviewed gateway extensibility
                              requirements.

  **1.        Build gateway   Create api-gateway Edge Function: single entry
  Develop**   core + plugin   point at /api/v1/\*. PLUGIN MIDDLEWARE
              architecture    ARCHITECTURE: Design gateway as a middleware
                              pipeline --- each request passes through an
                              ordered chain of middleware functions. Built-in
                              middleware: (1) auth (JWT verification, role
                              extraction), (2) rate-limiter (sliding window per
                              tier), (3) request-logger (sanitized, no PII),
                              (4) response-cache (Cache-Control headers for CDN
                              edge caching on read-only endpoints). Middleware
                              registry: new middleware can be added via config
                              without editing gateway core --- each middleware
                              is a self-contained function with a standard
                              interface (request, context, next). This is the
                              primary 'hook' --- future middleware
                              (analytics, transformation, A/B routing, webhook
                              dispatch) slots in without gateway surgery. ROUTE
                              REGISTRY: Config-driven route map
                              (JSON/TypeScript object) --- maps URL patterns to
                              downstream Edge Functions. Adding a new route is
                              a config change, not a code change. Build
                              rate_limits table in Supabase: tier,
                              endpoint_pattern, max_requests, window_seconds.
                              Define 5 tiers: Anonymous (30/min), Free
                              (120/min), Pro (300/min), CrewAI Agent (600/min),
                              Admin (unlimited). CACHE STRATEGY: Set
                              Cache-Control headers on read-only endpoints (job
                              search, job detail, stats) for Cloudflare edge
                              caching. Cache TTL: 60s for search results, 300s
                              for job detail, 600s for stats. Cache-bust on
                              write operations. Route first 10 highest-traffic
                              endpoints through gateway.

  **2. Test   Validate        Test auth middleware: valid JWT passes, expired
  (local)**   gateway +       JWT rejected, missing JWT returns 401. Test rate
              plugin system   limiting: exceed Anonymous tier limit, verify 429
                              response. Test routing: /api/v1/jobs/search
                              routes to typesense-search EF. Test middleware
                              pipeline: add a test-only middleware, verify it
                              executes in correct order. Test middleware
                              removal: remove test middleware, verify pipeline
                              still works. Test cache headers: verify
                              Cache-Control set on read-only endpoints, absent
                              on write endpoints. Verify gateway adds \< 50ms
                              latency overhead.

  **3. Deploy Push to         Deploy api-gateway Edge Function with middleware
  to Prod**   production      pipeline. Deploy rate_limits table migration.
                              Seed rate limit tiers. Update dashboard to route
                              10 endpoints through gateway. Keep direct EF
                              paths active as fallback.

  **4. Test   Validate in     Hit all 10 routed endpoints via gateway path.
  (prod)**    production      Verify auth middleware works. Verify rate
                              limiting triggers correctly. Verify cache headers
                              present on read-only responses. Compare response
                              times: gateway vs direct EF (gateway overhead \<
                              50ms). Verify PostHog tracks gateway_request
                              events.

  **5. Sync   Align all envs  Deploy gateway EF + rate_limits table to staging
  Envs**                      and dev. Seed rate limit config in all
                              environments.

  **6.        Tag             Tag: dashboard@X.Y.Z-gateway-phase1. Git tag:
  Version                     infra@gateway-v0.1.0.
  Bump**                      

  **7. Update Handoff         Create ADR-03 implementation log in
  Docs**                      docs/scaling/adr-03-gateway.md. Document
                              middleware plugin architecture: interface
                              contract, registration pattern, execution order.
                              Document routing registry format (config-driven).
                              Document rate limit tiers. Document cache
                              strategy. List 10 migrated endpoints. Chief
                              Architect sign-off on middleware extensibility.
                              Write handoff for SA-005.

  **8. Update Mark progress   Update ROADMAP.md Phase S: 'SA-004 Gateway
  Roadmap**                   skeleton + middleware plugin architecture + 10
                              endpoints --- DONE \[date\]'.

**SA-005: Gateway Completion: All 88 EFs + API Consumer Management**

*Backend (Edge Functions) + Dashboard + Extension + Landing \| ADR:
ADR-03 (Gateway) \| Hours: 16-20h \| Pair: Backend + DevOps + Lead
Platform Eng*

  **Step**    **Action**      **Detail**

  **0. Entry  Verify          SA-004 complete. Gateway routing 10 endpoints
  Gate**      prerequisites   with middleware plugin pipeline. Auth middleware
                              operational. Rate limiting validated. Gateway
                              latency overhead \< 50ms confirmed. Middleware
                              plugin interface documented.

  **1.        Route remaining Add all remaining 78 Edge Functions to gateway
  Develop**   EFs + consumer  route registry (config-driven, per SA-004
              management      pattern). Group endpoints by domain: jobs (12),
                              pipeline (8), keywords (6), resumes (4), billing
                              (5), admin (15), cron-management (10), content
                              (8), referral (4), extension (6), analytics (4),
                              misc (6). Add API versioning via path prefix:
                              /api/v1/\* (all current), /api/v2/\* (reserved).
                              API CONSUMER MANAGEMENT (hook for future
                              third-party access): Create api_consumers table:
                              consumer_id, name, api_key_hash, tier,
                              rate_limit_override, created_at, revoked_at.
                              Build consumer API key generation + validation in
                              auth middleware. Current consumers: 'dashboard'
                              (built-in), 'extension' (built-in),
                              'landing-page' (built-in), 'crewai-agent'
                              (per-agent keys from SA-010). This is a 'scar'
                              --- the table and validation logic exist now, but
                              the self-service developer portal and external
                              API key registration are future work. The
                              architecture is ready when the product decision
                              comes. Add request/response logging middleware
                              (sanitized --- no PII). Update all surfaces to
                              route through gateway. Deprecate direct EF access
                              paths (log warnings).

  **2. Test   Validate full   Hit every endpoint via gateway path. Verify all
  (local)**   routing +       88 EFs respond correctly through gateway. Test
              consumer keys   API consumer keys: generate test consumer key,
                              authenticate via X-API-Key header, verify rate
                              limiting applies per consumer tier. Test
                              cross-surface: dashboard, extension, landing page
                              all route through gateway. Verify deprecated
                              direct paths still work but log warnings. Run
                              full smoke test suite.

  **3. Deploy Push to         Deploy updated gateway route registry. Deploy
  to Prod**   production      api_consumers table. Generate built-in consumer
                              keys for dashboard, extension, landing page.
                              Deploy updated surfaces with gateway routing.
                              Verify zero downtime during cutover.

  **4. Test   Validate in     Full smoke test on all 4 surfaces. Verify all API
  (prod)**    production      calls route through gateway. Verify rate limiting
                              per tier and per consumer. Monitor error rate for
                              1 hour --- must remain below 0.1%.

  **5. Sync   Align all envs  Deploy full route registry + api_consumers table
  Envs**                      to staging and dev. Update all surfaces in
                              staging.

  **6.        Tag all         Tag: dashboard@X.Y.Z-gateway-complete,
  Version     surfaces        extension@X.Y.Z-gateway, index@X.Y.Z-gateway. Git
  Bump**                      tag: infra@gateway-v1.0.0.

  **7. Update Handoff         Mark ADR-03 as IMPLEMENTED in
  Docs**                      docs/scaling/adr-03-gateway.md. Document full
                              endpoint catalog by domain. Document API consumer
                              management system (current state + future scar
                              for self-service portal). Document deprecation
                              timeline for direct EF access. Write handoff for
                              SA-006.

  **8. Update Mark progress   Update ROADMAP.md Phase S: 'SA-005 All 88 EFs
  Roadmap**                   routed + API consumer management --- DONE
                              \[date\]'. ADR-03 complete.

**SA-006: TypeScript Phase 1: Core Files + CI Gate**

*Dashboard (js/ directory) \| ADR: ADR-04 (TypeScript) \| Hours: 14-20h
\| Pair: Frontend + Eng Lead*

  **Step**    **Action**      **Detail**

  **0. Entry  Verify          Vite build pipeline supports TypeScript
  Gate**      prerequisites   (confirmed in remediation CS-016/CS-017).
                              tsconfig.json exists with strict: false baseline.
                              ESLint configured.

  **1.        Migrate core 7  Migrate to TypeScript with strict mode:
  Develop**   files           globals.js (→ globals.ts), api.js (→ api.ts),
                              sync.js (→ sync.ts), version.js (→ version.ts),
                              fingerprint.js (→ fingerprint.ts), tier-gating.js
                              (→ tier-gating.ts), lazy-loader.js (→
                              lazy-loader.ts). Define core shared types:
                              SupabaseJob, UserProfile, SearchParams,
                              SearchResults, APIResponse\<T>,
                              PaginatedResponse\<T>. Zero use of 'any' in
                              migrated files. Add GitHub Actions CI check:
                              reject PRs that add new .js files in js/
                              directory.

  **2. Test   Validate        tsc \--noEmit passes with zero errors on all 7
  (local)**   migration       files. Vite build succeeds. All existing tests
                              pass. ESLint no-explicit-any passes on migrated
                              files. Bundle size delta \< 1KB (TypeScript
                              compiles away). Run full smoke test: dashboard
                              loads, feed renders, search works, all tabs
                              functional.

  **3. Deploy Push to         Deploy dashboard with TypeScript core files. CI
  to Prod**   production      gate active on GitHub Actions. Verify Vercel
                              build succeeds.

  **4. Test   Validate in     Full dashboard smoke test. Verify zero runtime
  (prod)**    production      errors in PostHog for 1 hour. Confirm all pages
                              load. Confirm extension communication still
                              works.

  **5. Sync   Align all envs  Merge to main branch. Verify staging and dev
  Envs**                      Vercel deploys succeed with TypeScript files.

  **6.        Tag             Tag: dashboard@X.Y.Z-typescript-core.
  Version                     
  Bump**                      

  **7. Update Handoff         Create ADR-04 implementation log:
  Docs**                      docs/scaling/adr-04-typescript.md. Document
                              shared types. Document CI gate rules. Record
                              migration decisions (strict from day 1, no
                              'any' escape hatches). Write handoff for
                              SA-007.

  **8. Update Mark progress   Update ROADMAP.md Phase S: 'SA-006 TypeScript
  Roadmap**                   Phase 1 complete (7 core files) --- DONE
                              \[date\]'.

**Phase S2: Automation + Data Scale (Weeks 3-8)**

Phase S2 builds the data pipeline for 1M+ jobs (Common Crawl ingestion,
deduplication, incremental materialized views) and deploys the first
three CrewAI agents. This phase overlaps with Phase S1 starting at Week
3, once the gateway and Typesense sync are operational.

**SA-007: Common Crawl Ingestion Worker + Staging Table**

*Backend (Edge Functions + Database) \| ADR: ADR-06 (Data Pipeline) \|
Hours: 14-18h \| Pair: Data Eng + Backend*

  **Step**    **Action**      **Detail**

  **0. Entry  Verify          SA-001 complete (Typesense operational). SA-002
  Gate**      prerequisites   complete (sync queue handles new records
                              automatically). Gateway operational (SA-004+).
                              AWS S3 access for Common Crawl WARC files
                              confirmed.

  **1.        Build ingestion Create ats_jobs_staging table (mirrors ats_jobs
  Develop**   pipeline        schema + source_batch_id, ingestion_status).
                              Build ingest-common-crawl Edge Function:
                              downloads WARC segment from S3, extracts job
                              postings via HTML parsing (targeting common job
                              schema markup), writes to staging table. Add
                              pg_cron job: triggers ingestion during off-peak
                              (2-6 AM UTC). Process 10K-50K records per batch.
                              Add batch tracking table: batch_id, segment_url,
                              records_found, records_inserted, started_at,
                              completed_at. Rate-limit S3 downloads to avoid
                              egress cost spikes.

  **2. Test   Validate        Download 1 sample WARC segment. Run ingestion
  (local)**   ingestion       locally. Verify job postings extracted correctly
                              (title, company, location, description). Verify
                              staging table populated. Verify batch tracking
                              records created. Test with malformed WARC data
                              --- verify graceful failure. Verify Typesense
                              sync queue picks up new staging → ats_jobs
                              promotions.

  **3. Deploy Push to         Deploy staging table migration. Deploy
  to Prod**   production      ingest-common-crawl Edge Function. Deploy batch
                              tracking table. Activate pg_cron job (initially
                              set to manual trigger only --- no automatic
                              schedule yet). Run first production batch: 10K
                              records from a single WARC segment.

  **4. Test   Validate in     Verify 10K records in staging table. Verify batch
  (prod)**    production      tracking accurate. Verify records appear in
                              Typesense after promotion to ats_jobs. Verify
                              PostHog tracks ingestion events. Monitor database
                              CPU during ingestion --- must not exceed 70%.

  **5. Sync   Align all envs  Deploy staging table + batch tracking to staging
  Envs**                      and dev. Deploy ingestion EF to staging (with 1K
                              record test batch).

  **6.        Tag             No surface version bumps. Git tag:
  Version                     infra@common-crawl-v0.1.0.
  Bump**                      

  **7. Update Handoff         Create ADR-06 implementation log:
  Docs**                      docs/scaling/adr-06-pipeline.md. Document WARC
                              parsing strategy. Document batch size tuning
                              parameters. Write handoff for SA-008.

  **8. Update Mark progress   Update ROADMAP.md Phase S: 'SA-007 Common Crawl
  Roadmap**                   ingestion worker --- DONE \[date\]'.

**SA-008: Deduplication Engine + Enrichment Queue Integration**

*Backend (Database + Edge Functions) \| ADR: ADR-06 (Data Pipeline) \|
Hours: 12-16h \| Pair: Data Eng + Backend*

  **Step**    **Action**      **Detail**

  **0. Entry  Verify          SA-007 complete. Staging table operational with
  Gate**      prerequisites   10K+ test records. Batch tracking functional.
                              pg_trgm extension available in Supabase.

  **1.        Build dedup +   Enable pg_trgm extension. Build dedup-jobs Edge
  Develop**   enrichment      Function: hash-based exact match on URL (fast
                              path), fuzzy match on title + company + location
                              using pg_trgm similarity threshold (0.7). Dedup
                              runs as post-ingestion step on staging table.
                              Surviving records promoted from ats_jobs_staging
                              → ats_jobs. Duplicates marked with dedup_status =
                              'duplicate' + matched_job_id. Connect promoted
                              records to existing enrich-job queue (job_queue
                              table from Phase B). Rate-limit enrichment: max
                              100 Anthropic API calls/hour for new Common Crawl
                              records (Cost Guardian will manage this in
                              SA-012).

  **2. Test   Validate dedup  Insert 1,000 known duplicates (same URL). Verify
  (local)**                   hash dedup catches 100%. Insert 500
                              near-duplicates (slightly different titles, same
                              company/location). Verify fuzzy match catches >
                              80%. Insert 500 genuinely unique records. Verify
                              all promoted to ats_jobs. Verify promoted records
                              enter enrichment queue. Verify Typesense sync
                              picks up promoted records within 60 seconds.

  **3. Deploy Push to         Deploy pg_trgm extension. Deploy dedup-jobs Edge
  to Prod**   production      Function. Update ingestion pipeline to run dedup
                              as post-ingestion step. Deploy enrichment queue
                              connection.

  **4. Test   Validate in     Run 100K record Common Crawl batch. Verify dedup
  (prod)**    production      rate is 30-40% (expected based on Common Crawl
                              overlap). Verify surviving records appear in
                              ats_jobs and Typesense. Verify enrichment queue
                              processes new records. Monitor Anthropic API
                              spend during enrichment.

  **5. Sync   Align all envs  Deploy pg_trgm + dedup EF to staging. Run 1K
  Envs**                      record test batch in staging.

  **6.        Tag             No surface version bumps. Git tag:
  Version                     infra@dedup-v0.1.0.
  Bump**                      

  **7. Update Handoff         Document dedup strategy and similarity thresholds
  Docs**                      in docs/scaling/adr-06-pipeline.md. Record
                              expected duplicate rates. Write handoff for
                              SA-009.

  **8. Update Mark progress   Update ROADMAP.md Phase S: 'SA-008 Dedup engine
  Roadmap**                   operational --- DONE \[date\]'.

**SA-009: Incremental Materialized Views + Staleness Monitoring**

*Backend (Database) \| ADR: ADR-06 (Data Pipeline) \| Hours: 10-14h \|
Pair: Data Eng + DevOps*

  **Step**    **Action**      **Detail**

  **0. Entry  Verify          SA-008 complete. Dedup pipeline promoting records
  Gate**      prerequisites   to ats_jobs. Data volume on track toward 500K+.
                              PostHog operational for monitoring events.

  **1.        Build           Add last_updated_at column to all source tables
  Develop**   incremental     feeding materialized views. Build incremental
              refresh         refresh function: queries only rows with
                              last_updated_at > last_refresh_timestamp.
                              Replace full-refresh pg_cron job with incremental
                              refresh (runs every 3 minutes, processes only
                              deltas). Add mv_refresh_log table: refresh_id,
                              started_at, completed_at, rows_processed,
                              duration_ms. Add staleness badge to stats page:
                              shows 'Data as of \[timestamp\]' with amber/red
                              thresholds (amber > 5 min, red > 15 min). Keep
                              weekly full refresh as consistency guarantee
                              (Sunday 4 AM UTC).

  **2. Test   Validate        Baseline: measure full refresh time at current
  (local)**   incremental     data volume. Insert 1,000 new records. Run
                              incremental refresh. Verify only 1,000 rows
                              processed (not full table). Verify refresh time
                              is \< 10% of full refresh. Verify staleness badge
                              renders correctly on stats page. Verify
                              mv_refresh_log populated.

  **3. Deploy Push to         Deploy last_updated_at column migration. Deploy
  to Prod**   production      incremental refresh function. Update pg_cron job.
                              Deploy mv_refresh_log table. Deploy staleness
                              badge UI on stats page.

  **4. Test   Validate in     Monitor 3 refresh cycles. Verify rows_processed
  (prod)**    production      matches delta (not full table). Verify stats page
                              shows fresh data within 5 minutes of new inserts.
                              Verify staleness badge shows correctly. Verify
                              PostHog tracks mv_refresh events.

  **5. Sync   Align all envs  Deploy incremental refresh to staging. Verify
  Envs**                      staleness badge in staging.

  **6.        Tag             Tag: dashboard@X.Y.Z-incremental-mv (for
  Version                     staleness badge).
  Bump**                      

  **7. Update Handoff         Document incremental refresh strategy in
  Docs**                      docs/scaling/adr-06-pipeline.md. Record baseline
                              vs incremental refresh times. Write handoff for
                              SA-010.

  **8. Update Mark progress   Update ROADMAP.md Phase S: 'SA-009 Incremental
  Roadmap**                   MV refresh --- DONE \[date\]'. ADR-06 Phase 1
                              complete.

**SA-010: CrewAI Framework + Content QA Agent (Observe Mode)**

*Backend (CrewAI + Edge Functions) \| ADR: ADR-05 (CrewAI) \| Hours:
16-20h \| Pair: Backend + Eng Lead*

  **Step**    **Action**      **Detail**

  **0. Entry  Verify          SA-005 complete (all 88 EFs routed through
  Gate**      prerequisites   gateway). Gateway rate limiting operational for
                              CrewAI Agent tier (600 req/min, 100 AI calls/hr).
                              Admin panel kill switch pattern established
                              (CS-013).

  **1.        Build CrewAI    Install CrewAI framework. Build agent
  Develop**   foundation +    infrastructure: agent configuration store
              Agent 1         (Supabase table), agent credentials (gateway API
                              key per agent), agent action log table (agent_id,
                              action_type, target, payload, result, confidence,
                              created_at). Build Content QA Agent (Agent 1):
                              reviews AI-generated editorial content via
                              generate-editorial-content and approve-content
                              EFs. Agent evaluates quality, accuracy, brand
                              voice. Logs what it would approve/reject with
                              confidence scores. Observe mode only --- no
                              auto-actions. Add kill switch toggle in admin
                              panel per agent.

  **2. Test   Validate agent  Generate 20 editorial content items. Run Content
  (local)**                   QA Agent against all 20. Verify agent logs
                              decisions with confidence scores. Verify agent
                              routes all requests through gateway (not direct
                              EF). Verify rate limiting tier applies correctly.
                              Test kill switch: disable agent, verify it stops
                              processing. Verify zero actual approve/reject
                              actions taken (observe mode).

  **3. Deploy Push to         Deploy CrewAI framework and agent infrastructure
  to Prod**   production      tables. Deploy Content QA Agent in observe mode.
                              Deploy admin panel kill switch UI for agents.
                              Create CrewAI Agent gateway credentials.

  **4. Test   Validate in     Trigger 5 editorial content generations. Verify
  (prod)**    production      Content QA Agent logs its review decisions.
                              Verify Marston can view agent decisions in admin
                              panel. Verify kill switch works in prod. Verify
                              agent action log captures all activity.

  **5. Sync   Align all envs  Deploy CrewAI framework to staging. Deploy
  Envs**                      Content QA Agent to staging in observe mode.

  **6.        Tag             Tag: admin@X.Y.Z-crewai-foundation.
  Version                     
  Bump**                      

  **7. Update Handoff         Create ADR-05 implementation log:
  Docs**                      docs/scaling/adr-05-crewai.md. Document agent
                              architecture, action log schema, kill switch
                              pattern. Record Content QA Agent observe-mode
                              decisions for Marston review. Write handoff for
                              SA-011.

  **8. Update Mark progress   Update ROADMAP.md Phase S: 'SA-010 CrewAI
  Roadmap**                   framework + Content QA Agent (observe) --- DONE
                              \[date\]'.

**SA-011: Pipeline Health Agent + Data Freshness Agent (Observe Mode)**

*Backend (CrewAI) \| ADR: ADR-05 (CrewAI) \| Hours: 12-16h \| Pair:
Backend + Data Eng*

  **Step**    **Action**      **Detail**

  **0. Entry  Verify          SA-010 complete. CrewAI framework operational.
  Gate**      prerequisites   Agent infrastructure tables deployed. Content QA
                              Agent running in observe mode for 1+ week with
                              Marston reviewing decisions.

  **1.        Build Agents    Build Pipeline Health Agent (Agent 2): monitors
  Develop**   2 + 3           pg_cron job execution via gateway, detects
                              failures (missed schedules, error returns), logs
                              recommended actions (restart cron, alert
                              Marston). Uses monitoring_alerts table + Resend
                              email for alerts. Observe mode: logs what it
                              would do, sends summary email to Marston daily.
                              Build Data Freshness Agent (Agent 3): monitors
                              materialized view staleness (mv_refresh_log),
                              Typesense sync lag (sync_queue age), Common Crawl
                              ingestion progress (batch tracking). Generates
                              weekly freshness report. Alerts on > 1 hour
                              staleness. Observe mode: logs alerts but does not
                              auto-remediate.

  **2. Test   Validate agents Simulate cron failure (disable a pg_cron job).
  (local)**                   Verify Pipeline Health Agent detects and logs.
                              Simulate MV staleness (pause incremental
                              refresh). Verify Data Freshness Agent detects and
                              logs alert. Verify both agents route through
                              gateway. Verify rate limiting applies. Test kill
                              switches for both agents.

  **3. Deploy Push to         Deploy Pipeline Health Agent in observe mode.
  to Prod**   production      Deploy Data Freshness Agent in observe mode.
                              Configure daily summary email to Marston.
                              Configure staleness alert thresholds.

  **4. Test   Validate in     Verify Pipeline Health Agent detects next
  (prod)**    production      scheduled cron execution and logs assessment.
                              Verify Data Freshness Agent reports current MV
                              freshness. Verify Marston receives daily summary
                              email. Verify agent action logs capture all
                              activity.

  **5. Sync   Align all envs  Deploy both agents to staging in observe mode.
  Envs**                      

  **6.        Tag             Tag: admin@X.Y.Z-crewai-agents-2-3.
  Version                     
  Bump**                      

  **7. Update Handoff         Document both agents in
  Docs**                      docs/scaling/adr-05-crewai.md. Record
                              observe-mode decision patterns for Marston
                              review. Write handoff for SA-012.

  **8. Update Mark progress   Update ROADMAP.md Phase S: 'SA-011 Agents 2-3 in
  Roadmap**                   observe mode --- DONE \[date\]'.

**SA-012: Agent Graduation: Observe to Suggest Mode + Admin Dashboard**

*Backend (CrewAI) + Admin \| ADR: ADR-05 (CrewAI) \| Hours: 10-14h \|
Pair: Backend + Frontend*

  **Step**    **Action**      **Detail**

  **0. Entry  Verify          SA-011 complete. All 3 agents running in observe
  Gate**      prerequisites   mode for 2+ weeks. Marston has reviewed agent
                              decision logs and validated judgment quality.
                              Zero false positives above acceptable threshold
                              (\< 5% for Content QA, \< 10% for Pipeline
                              Health).

  **1.        Graduate        Promote Content QA Agent to suggest mode:
  Develop**   agents + build  recommends approve/reject in admin panel
              dashboard       notifications. Marston approves/rejects each.
                              Promote Pipeline Health Agent to suggest mode:
                              recommends restart/alert actions. Build CrewAI
                              dashboard in admin panel: per-agent status
                              (observe/suggest/auto/autonomous), action log
                              browser with filters (agent, date, action type,
                              confidence), override rate tracking (how often
                              Marston overrides agent suggestions), agent
                              health metrics (uptime, actions/day, error rate).
                              Keep Data Freshness Agent in observe mode (needs
                              more validation time).

  **2. Test   Validate        Trigger editorial content. Verify Content QA
  (local)**   graduation      Agent shows suggestion in admin panel. Approve
                              suggestion. Verify action executed. Reject
                              suggestion. Verify action logged as overridden.
                              Verify override rate tracking updates. Test admin
                              dashboard renders all 3 agents with correct
                              statuses.

  **3. Deploy Push to         Deploy agent graduation config (Content QA →
  to Prod**   production      suggest, Pipeline Health → suggest). Deploy
                              CrewAI admin dashboard.

  **4. Test   Validate in     Verify Content QA suggestions appear in admin
  (prod)**    production      panel. Verify Pipeline Health suggestions appear.
                              Verify admin dashboard shows correct agent
                              statuses. Verify Marston can approve/reject from
                              dashboard.

  **5. Sync   Align all envs  Deploy admin dashboard to staging. Keep staging
  Envs**                      agents in observe mode.

  **6.        Tag             Tag: admin@X.Y.Z-crewai-dashboard.
  Version                     
  Bump**                      

  **7. Update Handoff         Document graduation criteria and process in
  Docs**                      docs/scaling/adr-05-crewai.md. Record override
                              rates from first week. Write handoff for SA-013.

  **8. Update Mark progress   Update ROADMAP.md Phase S: 'SA-012 Agent
  Roadmap**                   graduation + admin dashboard --- DONE \[date\]'.
                              ADR-05 Phase 1 complete.

**Phase S3: Frontend Modernization (Weeks 5-12)**

Phase S3 migrates all authenticated surfaces --- the 3,821-line
monolithic dashboard and the admin panel --- to a unified Vite + React
Router SPA with full TypeScript, a design system built on Tailwind
design tokens, and dark mode across every component. The design system
foundation is established in SA-013, then every subsequent page
migration enforces zero inline styles, design token usage only, and dark
mode completeness as hard exit gates. The CSS/Tailwind Engineer pairs
with the Frontend Engineer on every session. Public-facing surfaces
(landing page, SEO pages) are NOT part of this migration --- they stay
static/server-rendered for SEO. The legacy shell is removed only after
all dashboard + admin pages are migrated.

**SA-013: Vite + React Router Scaffold + Design System Foundation +
Dual-Mode Shell**

*Dashboard + Admin (all authenticated surfaces) \| ADR: ADR-02 (SPA
Migration) + CSS/Design System \| Hours: 18-24h \| Pair: Frontend +
CSS/Tailwind Eng + Eng Lead*

  **Step**    **Action**      **Detail**

  **0. Entry  Verify          SA-006 complete (TypeScript Phase 1 core files
  Gate**      prerequisites   migrated). Vite build pipeline already in place
                              from remediation (CS-016). tsconfig.json strict
                              mode on core files. All existing tests passing.
                              DS1-3 inline style audit from Pod 4 available
                              (categorized list of all 827 dashboard + admin
                              inline styles).

  **1.        Build           DESIGN SYSTEM FOUNDATION: Define design tokens as
  Develop**   scaffold +      CSS custom properties: color palette (light +
              design system + dark), spacing scale (4px base), type scale,
              dual shell      shadow system, border radii. Clean Tailwind
                              config: remove all 30+ regex safelist patterns,
                              replace with explicit safelist or component
                              extraction. Configure dark mode (class strategy).
                              Create base component primitives: Button, Card,
                              Badge, Input, Select, Modal shell --- all using
                              design tokens via Tailwind utilities, zero inline
                              styles, dark mode complete. Document component
                              pattern library as the standard every subsequent
                              page migration must follow. DATA PROVIDER
                              ABSTRACTION (hook for future backend
                              flexibility): Create a data access layer with
                              provider interfaces --- SearchProvider,
                              JobProvider, UserProvider, PipelineProvider. Each
                              provider is an abstraction over the current
                              Supabase/Typesense implementation. Components
                              consume data through providers, never directly
                              through Supabase client or fetch calls. Current
                              implementations: SupabaseJobProvider,
                              TypesenseSearchProvider. This is a 'scar' ---
                              swapping to a different backend, adding caching
                              layers, or mocking for tests becomes a provider
                              swap, not a component rewrite. Forward-Looking
                              Developer reviews provider interface contracts
                              for extensibility. SPA SCAFFOLD: Install React
                              Router. Create unified app shell for dashboard +
                              admin behind auth. Build route definitions for
                              all dashboard pages (14) + admin pages (cron
                              dashboard, cost tracking, audit trail, kill
                              switch, agent dashboard). Role-based route
                              guards: admin routes require admin role.
                              LegacyPageWrapper for both dashboard and admin
                              legacy pages. Configure Vite code splitting:
                              dashboard and admin are separate route groups
                              with independent chunks. Admin routes lazy-loaded
                              (most users never touch them).

  **2. Test   Validate        Design system: verify all tokens render in light
  (local)**   scaffold +      and dark mode. Verify base components match
              design system + design tokens (zero hardcoded colors, zero inline
              providers       styles). Verify Tailwind output \< 100KB after
                              safelist cleanup. Data providers: verify
                              SearchProvider interface works with
                              TypesenseSearchProvider. Verify JobProvider
                              interface works with SupabaseJobProvider. Verify
                              providers can be swapped via config (mock
                              provider for test). SPA: Navigate all dashboard +
                              admin routes via URL. Verify all legacy pages
                              render through LegacyPageWrapper. Verify admin
                              routes blocked for non-admin users. Verify code
                              splitting: dashboard and admin chunks load
                              independently. Initial payload \< 160KB. All
                              existing tests pass unchanged. Back/forward
                              navigation works.

  **3. Deploy Push to         Deploy dual-mode shell with unified dashboard +
  to Prod**   production      admin routing. Deploy design system tokens and
                              base components. Feature flag: SPA_MODE=dual (can
                              revert to legacy-only). Verify Vercel serves all
                              routes correctly (SPA fallback configured).

  **4. Test   Validate in     Navigate all dashboard + admin routes in
  (prod)**    production      production. Verify zero functionality
                              regressions. Verify admin role gating works.
                              Verify PostHog page_view events fire for route
                              transitions. Verify extension communication works
                              through dual shell. Toggle dark mode --- verify
                              base components render correctly in both modes.
                              Monitor PostHog errors for 2 hours.

  **5. Sync   Align all envs  Deploy to staging. Verify SPA routing works in
  Envs**                      staging Vercel. Verify admin routes accessible in
                              staging.

  **6.        Tag             Tag: dashboard@X.Y.Z-spa-scaffold,
  Version                     admin@X.Y.Z-spa-scaffold.
  Bump**                      

  **7. Update Handoff         Create ADR-02 implementation log:
  Docs**                      docs/scaling/adr-02-spa.md. Document dual-mode
                              shell architecture (dashboard + admin unified).
                              Document design system: token definitions,
                              component pattern library, dark mode strategy.
                              Document data provider abstraction: interface
                              contracts, current implementations, extension
                              guide for future providers. Document migration
                              rules: every page migration must use design
                              tokens, zero inline styles, dark mode complete,
                              Tailwind utilities only, data access through
                              providers only. Chief Architect sign-off on
                              provider interfaces and component extension
                              points. Write handoff for SA-014.

  **8. Update Mark progress   Update ROADMAP.md Phase S: 'SA-013 SPA
  Roadmap**                   scaffold + design system foundation + dual-mode
                              shell --- DONE \[date\]'.

**SA-014: Feed Page Migration (React + TypeScript + Design System)**

*Dashboard \| ADR: ADR-02 (SPA) + ADR-04 (TypeScript Phase 2) +
CSS/Design System \| Hours: 20-26h \| Pair: Frontend + CSS/Tailwind Eng*

  **Step**    **Action**      **Detail**

  **0. Entry  Verify          SA-013 complete. Dual-mode shell operational.
  Gate**      prerequisites   React Router serving all dashboard + admin
                              routes. Design system tokens and base components
                              established. Component pattern library
                              documented. Core TypeScript types available
                              (SearchResults, SupabaseJob, etc.).

  **1.        Migrate Feed    Rewrite Feed page as React + TypeScript component
  Develop**   page            tree using design system: FeedPage (container),
                              JobCard (display --- design system Card + Badge),
                              SearchBar (design system Input + Button),
                              FilterSidebar (facets from Typesense --- design
                              system Select + Badge), PaginationControls,
                              SortControls. ALL components use design tokens
                              via Tailwind utilities. ZERO inline styles ---
                              every style that was inline in the legacy Feed
                              page is now a Tailwind class or design token.
                              Dark mode complete on every component (light +
                              dark verified). Migrate job-feed.js → job-feed.ts
                              (TypeScript Phase 2 data layer). Integrate with
                              Typesense search via gateway. Implement infinite
                              scroll or pagination. Port all existing Feed
                              functionality.

  **2. Test   Validate        Functional: compare React Feed vs legacy ---
  (local)**   migration       identical functionality, identical data. Test
                              search, all filters, all sort options,
                              pagination, job card interactions. DESIGN SYSTEM
                              COMPLIANCE: grep for inline style= attributes ---
                              must be zero. grep for hardcoded hex/rgb colors
                              --- must be zero. Verify dark mode: toggle theme,
                              verify every element renders correctly in both
                              modes. Verify all components use design system
                              primitives. Verify TypeScript strict mode.
                              Accessibility: focus management, keyboard
                              navigation, contrast ratios in both themes.
                              Bundle: Feed chunk \< 80KB. CSS output not
                              increased by Feed migration.

  **3. Deploy Push to         Deploy React Feed page. Remove Feed from
  to Prod**   production      LegacyPageWrapper. Verify Vercel serves React
                              Feed at /feed route.

  **4. Test   Validate in     Full Feed page smoke test. Compare search results
  (prod)**    production      with Typesense. Verify dark mode works in
                              production. Verify PostHog events fire for all
                              Feed interactions. Monitor PostHog errors for 2
                              hours. Verify mobile responsiveness in both
                              themes.

  **5. Sync   Align all envs  Deploy React Feed to staging.
  Envs**                      

  **6.        Tag             Tag: dashboard@X.Y.Z-spa-feed.
  Version                     
  Bump**                      

  **7. Update Handoff         Document Feed migration in
  Docs**                      docs/scaling/adr-02-spa.md. Record component
                              tree. Record inline styles eliminated (count).
                              Record bundle size. Note any design system
                              additions (new components or token extensions).
                              Write handoff for SA-015.

  **8. Update Mark progress   Update ROADMAP.md Phase S: 'SA-014 Feed page
  Roadmap**                   migrated to React + TS + design system --- DONE
                              \[date\]'.

**SA-015: Pipeline + Keywords Pages Migration (React + TypeScript +
Design System)**

*Dashboard \| ADR: ADR-02 (SPA) + ADR-04 (TypeScript Phase 2) +
CSS/Design System \| Hours: 18-24h \| Pair: Frontend + CSS/Tailwind
Eng + QA*

  **Step**    **Action**      **Detail**

  **0. Entry  Verify          SA-014 complete. Feed page running as React +
  Gate**      prerequisites   TypeScript with design system in production. Zero
                              inline styles on Feed. Dark mode complete on
                              Feed. Component patterns established (JobCard,
                              SearchBar, FilterSidebar reusable). Zero
                              regressions.

  **1.        Migrate         Rewrite Pipeline page as React + TypeScript using
  Develop**   Pipeline +      design system: PipelinePage, PipelineStage
              Keywords        (design system Card variant), PipelineCard
                              (extends JobCard), DragDropContainer. Migrate
                              pipeline.js → pipeline.ts. Rewrite Keywords page:
                              KeywordsPage, KeywordManager (design system
                              Input + Button), KeywordSuggestions (design
                              system Badge), KeywordStats (design system Card).
                              Migrate keywords.js → keywords.ts. ALL components
                              use design tokens --- zero inline styles. Dark
                              mode complete on both pages. Share components
                              where possible. Both pages use gateway-routed API
                              calls.

  **2. Test   Validate        Pipeline: test all stage transitions, drag-drop,
  (local)**   migration       card interactions. Keywords: test add/remove/edit
                              keywords, suggestions, stats display. DESIGN
                              SYSTEM COMPLIANCE: zero inline styles on both
                              pages. Zero hardcoded colors. Dark mode verified
                              on every component of both pages. TypeScript
                              strict mode. Accessibility tests. Bundle sizes:
                              Pipeline chunk \< 60KB, Keywords chunk \< 40KB.

  **3. Deploy Push to         Deploy React Pipeline and Keywords pages. Remove
  to Prod**   production      both from LegacyPageWrapper.

  **4. Test   Validate in     Full smoke test on both pages in both themes.
  (prod)**    production      Verify PostHog events. Monitor errors for 2
                              hours. Verify mobile responsiveness in both
                              themes.

  **5. Sync   Align all envs  Deploy to staging.
  Envs**                      

  **6.        Tag             Tag: dashboard@X.Y.Z-spa-pipeline-keywords.
  Version                     
  Bump**                      

  **7. Update Handoff         Update docs/scaling/adr-02-spa.md with Pipeline +
  Docs**                      Keywords migration notes. Record inline styles
                              eliminated. Record any new design system
                              components added. Write handoff for SA-016.

  **8. Update Mark progress   Update ROADMAP.md Phase S: 'SA-015 Pipeline +
  Roadmap**                   Keywords migrated --- DONE \[date\]'.

**SA-016: Stats + Settings + Billing Migration (React + TypeScript +
Design System)**

*Dashboard \| ADR: ADR-02 (SPA) + ADR-04 (TypeScript Phase 3) +
CSS/Design System \| Hours: 18-24h \| Pair: Frontend + CSS/Tailwind
Eng + QA*

  **Step**    **Action**      **Detail**

  **0. Entry  Verify          SA-015 complete. Feed, Pipeline, Keywords all
  Gate**      prerequisites   running as React + TypeScript with design system.
                              Zero inline styles on all migrated pages. Dark
                              mode complete on all migrated pages. Zero
                              regressions.

  **1.        Migrate Stats + Rewrite Stats page using design system:
  Develop**   Settings +      StatsPage, StatCard (design system Card),
              Billing         ChartContainer (recharts styled with design
                              tokens), StalenessIndicator (design system Badge
                              variant from SA-009). Migrate stats.js →
                              stats.ts. Rewrite Settings page: SettingsPage,
                              PreferencePanel (design system Card + Input +
                              Select). Migrate settings.js → settings.ts.
                              Rewrite Billing page: BillingPage, PlanCard
                              (design system Card variant), UpgradeFlow (design
                              system Button + Modal). Migrate billing.js →
                              billing.ts. Migrate remaining UI modules:
                              sort-bar.ts, query-builder.ts, chat.ts,
                              overlay-analytics.ts. ALL components use design
                              tokens --- zero inline styles. Dark mode complete
                              on all pages. Charts styled with design token
                              colors in both themes.

  **2. Test   Validate        Stats: all charts render in both themes,
  (local)**   migration       staleness badge works, data matches materialized
                              views. Settings: all preference saves. Billing:
                              plan display, upgrade flow. DESIGN SYSTEM
                              COMPLIANCE: zero inline styles. Zero hardcoded
                              colors. Dark mode on every element of all 3
                              pages. Chart colors use design tokens in both
                              themes. TypeScript strict. Accessibility tests.

  **3. Deploy Push to         Deploy migrated pages. Remove from
  to Prod**   production      LegacyPageWrapper.

  **4. Test   Validate in     Full smoke test on all migrated pages in both
  (prod)**    production      themes. Monitor errors for 2 hours.

  **5. Sync   Align all envs  Deploy to staging.
  Envs**                      

  **6.        Tag             Tag: dashboard@X.Y.Z-spa-stats-settings.
  Version                     
  Bump**                      

  **7. Update Handoff         Update docs/scaling/adr-02-spa.md. Record inline
  Docs**                      styles eliminated. Record dashboard HTML line
                              count reduction (target: \< 1,500 lines
                              remaining). Write handoff for SA-017.

  **8. Update Mark progress   Update ROADMAP.md Phase S: 'SA-016 Stats +
  Roadmap**                   Settings + Billing migrated --- DONE \[date\]'.

**SA-017: Remaining Dashboard + Admin Pages Migration + Legacy Shell
Removal**

*Dashboard + Admin \| ADR: ADR-02 (SPA) + ADR-04 (TypeScript Phase 4) +
CSS/Design System \| Hours: 22-30h \| Pair: Frontend + CSS/Tailwind
Eng + Eng Lead + QA*

  **Step**    **Action**      **Detail**

  **0. Entry  Verify          SA-016 complete. Feed, Pipeline, Keywords, Stats,
  Gate**      prerequisites   Settings, Billing all React + TypeScript with
                              design system. Dashboard HTML \< 1,500 lines.
                              Zero inline styles on all migrated pages. Dark
                              mode complete on all migrated pages. Remaining
                              pages identified: Resumes, Applications, any
                              other dashboard legacy tabs, plus all admin pages
                              (cron dashboard, cost tracking, audit trail, kill
                              switch, CrewAI agent dashboard).

  **1.        Migrate         DASHBOARD: Migrate all remaining dashboard pages
  Develop**   remaining +     (Resumes, Applications, etc.) to React +
              admin + remove  TypeScript using design system. ADMIN: Migrate
              legacy          all admin pages to React + TypeScript:
                              CronDashboard, CostTracker, AuditTrail,
                              KillSwitchPanel, AgentDashboard (from SA-012).
                              Admin pages use same design system tokens with an
                              admin-specific layout wrapper. Migrate remaining
                              ~55 JS files to TypeScript. Remove
                              LegacyPageWrapper. Remove legacy tab-toggling CSS
                              and JavaScript. Remove legacy HTML markup.
                              Target: original 3,821-line dashboard HTML +
                              admin HTML reduced to \< 200 lines (shell only).
                              ALL components use design tokens --- zero inline
                              styles across entire application. Dark mode
                              complete on every page (dashboard + admin). Full
                              TypeScript strict mode. CSS FINAL AUDIT: grep
                              entire codebase for inline style= attributes ---
                              must be zero on all authenticated surfaces.
                              Verify Tailwind output CSS is under target (\<
                              100KB). Purge any unused design tokens.

  **2. Test   Validate full   Navigate every dashboard + admin route. Verify
  (local)**   migration       zero functionality regressions. Verify admin role
                              gating on all admin routes. DESIGN SYSTEM
                              COMPLIANCE: zero inline styles on entire
                              application (grep verification). Zero hardcoded
                              colors. Dark mode on every page and every
                              component. Tailwind output \< 100KB. tsc
                              \--noEmit zero errors. ESLint no-explicit-any
                              zero violations. Bundle: initial payload \<
                              120KB. Admin chunk loads independently. All test
                              suites pass. Full accessibility audit across both
                              themes. Component library complete --- document
                              all shared components.

  **3. Deploy Push to         Deploy fully-migrated SPA (dashboard + admin
  to Prod**   production      unified). Remove SPA_MODE feature flag. Verify
                              Vercel serves all routes.

  **4. Test   Validate in     Full smoke test on every dashboard page in both
  (prod)**    production      themes. Full smoke test on every admin page in
                              both themes. Extension communication test. Admin
                              role gating verified. Monitor PostHog for 4 hours
                              (extended monitoring for full migration). Verify
                              initial bundle \< 120KB in production.

  **5. Sync   Align all envs  Deploy to staging and dev.
  Envs**                      

  **6.        Tag             Tag: dashboard@X.Y.Z-spa-complete,
  Version                     admin@X.Y.Z-spa-complete. Major version bump
  Bump**                      recommended.

  **7. Update Handoff         Mark ADR-02 as IMPLEMENTED. Mark ADR-04 Phases
  Docs**                      1-4 as IMPLEMENTED. Document final bundle
                              analysis. Document complete component library and
                              design system. Record total inline styles
                              eliminated (827 dashboard + admin count). Record
                              final Tailwind CSS output size. Write handoff for
                              SA-018.

  **8. Update Mark progress   Update ROADMAP.md Phase S: 'SA-017 SPA migration
  Roadmap**                   complete (dashboard + admin) + design system +
                              legacy removed --- DONE \[date\]'. ADR-02
                              complete. ADR-04 Phases 1-4 complete.

**Phase S4: Scale Validation + Full Automation (Weeks 10-16)**

Phase S4 completes all remaining scaling work: read replicas, database
partitioning, the final three CrewAI agents, extension and Edge Function
TypeScript migration, and the definitive load test at 5,000 concurrent
users. SA-023 is the final gate --- if the load test passes, Phase S is
complete and the platform is validated for scale.

**SA-018: Read Replica Setup + Query Routing**

*Infrastructure + Backend \| ADR: ADR-06 (Data Pipeline) \| Hours:
10-14h \| Pair: DevOps + Backend*

  **Step**    **Action**      **Detail**

  **0. Entry  Verify          SA-003 complete (Typesense handling search,
  Gate**      prerequisites   reducing read load). SA-017 complete (SPA
                              migration of dashboard + admin reduces
                              unnecessary data fetches). Database volume
                              approaching 500K+ jobs.

  **1.        Deploy read     Provision Supabase read replica (Pro plan add-on,
  Develop**   replica + route ~\$75/month). Configure replica connection
              queries         string in Vault. Update gateway: route all
                              SELECT/read-only requests to replica connection.
                              Keep all INSERT/UPDATE/DELETE on primary. Update
                              dashboard API calls: annotate read-only requests
                              in gateway routing. Add replica_lag monitoring:
                              track replication delay, alert if > 5 seconds.

  **2. Test   Validate        Verify read queries resolve via replica (check
  (local)**   routing         pg_stat_activity or connection logging). Verify
                              write queries still hit primary. Verify
                              replication lag \< 1 second under normal load.
                              Test failover: if replica unavailable, reads fall
                              back to primary with degraded badge.

  **3. Deploy Push to         Activate Supabase read replica. Deploy gateway
  to Prod**   production      routing update. Deploy replica connection string
                              to Vault. Deploy failover logic.

  **4. Test   Validate in     Monitor replication lag for 2 hours. Verify
  (prod)**    production      dashboard reads route to replica. Verify writes
                              hit primary. Check primary database CPU ---
                              should decrease with read offloading. Verify
                              PostHog tracks replica_query events.

  **5. Sync   Align all envs  Staging: document that staging does not have a
  Envs**                      read replica (cost). Dev: same.

  **6.        Tag             No surface version bumps. Git tag:
  Version                     infra@read-replica-v1.0.0.
  Bump**                      

  **7. Update Handoff         Document read replica in
  Docs**                      docs/scaling/adr-06-pipeline.md. Document routing
                              rules. Write handoff for SA-019.

  **8. Update Mark progress   Update ROADMAP.md Phase S: 'SA-018 Read replica
  Roadmap**                   operational --- DONE \[date\]'.

**SA-019: Database Partitioning: ats_jobs by Source**

*Backend (Database) \| ADR: ADR-06 (Data Pipeline) \| Hours: 12-16h \|
Pair: Data Eng + DevOps*

  **Step**    **Action**      **Detail**

  **0. Entry  Verify          SA-018 complete (read replica operational).
  Gate**      prerequisites   SA-008 complete (Common Crawl pipeline producing
                              records). ats_jobs approaching or exceeding 1M
                              rows. Data sources confirmed: ats, common_crawl,
                              amazon.

  **1.        Partition       Create partitioned ats_jobs table using Postgres
  Develop**   ats_jobs        native declarative partitioning on source column.
                              Three partitions: ats_jobs_ats,
                              ats_jobs_common_crawl, ats_jobs_amazon. Migrate
                              existing data: move ~400K ATS records to
                              ats_jobs_ats partition. Move Common Crawl records
                              to ats_jobs_common_crawl partition. Update all
                              queries, RPCs, and Edge Functions to work with
                              partitioned table (transparent for most queries
                              via partition key). Add per-partition vacuum and
                              index maintenance schedules. Verify Typesense
                              sync queue works with partitioned table.

  **2. Test   Validate        Query performance: verify partition pruning
  (local)**   partitioning    occurs (EXPLAIN ANALYZE shows single partition
                              scan for source-filtered queries). Verify
                              cross-partition queries still work (unfiltered
                              search). Verify all existing dashboard
                              functionality works unchanged. Verify Typesense
                              sync picks up changes from all partitions. Verify
                              materialized view refresh works with partitioned
                              source.

  **3. Deploy Push to         Execute partition migration during low-traffic
  to Prod**   production      window (2-6 AM UTC). Verify zero data loss (row
                              counts before and after). Update vacuum
                              schedules.

  **4. Test   Validate in     Verify all dashboard pages load correctly. Verify
  (prod)**    production      search returns results from all partitions.
                              Verify new Common Crawl ingestion targets correct
                              partition. Monitor query performance for 4 hours.

  **5. Sync   Align all envs  Apply partitioning to staging (with smaller
  Envs**                      dataset).

  **6.        Tag             No surface version bumps. Git tag:
  Version                     infra@partitioning-v1.0.0.
  Bump**                      

  **7. Update Handoff         Mark ADR-06 as IMPLEMENTED in
  Docs**                      docs/scaling/adr-06-pipeline.md. Document
                              partition strategy, maintenance schedules. Write
                              handoff for SA-020.

  **8. Update Mark progress   Update ROADMAP.md Phase S: 'SA-019 Database
  Roadmap**                   partitioning complete --- DONE \[date\]'. ADR-06
                              complete.

**SA-020: Cost Guardian Agent + User Support Agent**

*Backend (CrewAI) + Admin \| ADR: ADR-05 (CrewAI) \| Hours: 14-18h \|
Pair: Backend + Frontend*

  **Step**    **Action**      **Detail**

  **0. Entry  Verify          SA-012 complete (agent graduation pipeline
  Gate**      prerequisites   operational). Content QA Agent in suggest mode
                              for 4+ weeks with acceptable override rate (\<
                              15%). Pipeline Health Agent in suggest mode.
                              Vendor cost tracking table exists from
                              remediation (CS-019).

  **1.        Build Agents    Build Cost Guardian Agent (Agent 4): monitors
  Develop**   4 + 5           spend across all 12+ services via
                              vendor_cost_budgets table. Tracks Anthropic API
                              usage (via usage API), Supabase metrics,
                              Typesense Cloud metrics. Alerts at 80% of monthly
                              budget. Can throttle AI endpoints at 100%
                              (reduces CrewAI agent rate limits, pauses
                              enrichment queue). Marston override via admin
                              panel. Build User Support Agent (Agent 5):
                              triages support requests from Canny feedback.
                              Handles Tier 1 issues (password reset guidance,
                              billing questions, FAQ responses) via email
                              templates. Escalates complex issues to Marston.
                              Both agents start in observe mode.

  **2. Test   Validate agents Cost Guardian: simulate 80% budget threshold.
  (local)**                   Verify alert generated. Simulate 100% threshold.
                              Verify throttle recommendation logged. User
                              Support: submit 10 test support requests (5 Tier
                              1, 5 complex). Verify Tier 1 correctly
                              classified. Verify complex correctly escalated.
                              Both agents route through gateway. Kill switches
                              tested.

  **3. Deploy Push to         Deploy both agents in observe mode. Configure
  to Prod**   production      budget thresholds in admin panel. Configure Canny
                              integration for User Support Agent.

  **4. Test   Validate in     Verify Cost Guardian reports current spend
  (prod)**    production      levels. Verify User Support Agent processes any
                              pending Canny feedback. Verify admin panel shows
                              both agents with correct status.

  **5. Sync   Align all envs  Deploy to staging in observe mode.
  Envs**                      

  **6.        Tag             Tag: admin@X.Y.Z-crewai-agents-4-5.
  Version                     
  Bump**                      

  **7. Update Handoff         Document both agents in
  Docs**                      docs/scaling/adr-05-crewai.md. Document budget
                              thresholds and throttle behavior. Write handoff
                              for SA-021.

  **8. Update Mark progress   Update ROADMAP.md Phase S: 'SA-020 Cost
  Roadmap**                   Guardian + User Support agents --- DONE
                              \[date\]'.

**SA-021: Referral Pipeline Agent + Full Agent Graduation**

*Backend (CrewAI) + Admin \| ADR: ADR-05 (CrewAI) \| Hours: 12-16h \|
Pair: Backend + Eng Lead*

  **Step**    **Action**      **Detail**

  **0. Entry  Verify          SA-020 complete. All 5 agents deployed (3 in
  Gate**      prerequisites   suggest mode, 2 in observe mode). Content QA
                              Agent ready for auto-with-approval graduation (4+
                              weeks in suggest with \< 10% override rate).
                              Referral tables and check-referral-activation EF
                              exist from remediation.

  **1.        Build Agent 6 + Build Referral Pipeline Agent (Agent 6): tracks
  Develop**   graduate        referral activations via referral tables,
              existing        calculates reward eligibility, flags suspicious
                              referral patterns (same IP, rapid sign-ups). All
                              reward distributions require Marston approval.
                              Starts in observe mode. Graduate Content QA Agent
                              to auto-with-approval: auto-approves when
                              confidence > 90%, flags edge cases for Marston.
                              Graduate Pipeline Health Agent to
                              auto-with-approval: auto-restarts failed crons,
                              alerts on prolonged failures. Graduate Data
                              Freshness Agent to suggest mode. Graduate Cost
                              Guardian to suggest mode.

  **2. Test   Validate all    Referral Agent: test with mock referral data.
  (local)**   agents          Verify suspicious pattern detection. Verify
                              reward calculation. Test all graduated agents at
                              new trust levels. Verify auto-with-approval
                              agents execute routine actions. Verify edge cases
                              still route to Marston. Verify kill switches work
                              at all trust levels.

  **3. Deploy Push to         Deploy Referral Pipeline Agent in observe mode.
  to Prod**   production      Apply graduation config changes to all existing
                              agents. Update admin dashboard to show new trust
                              levels.

  **4. Test   Validate in     Verify Content QA auto-approves high-confidence
  (prod)**    production      items. Verify Pipeline Health auto-restarts a
                              test cron failure. Verify Referral Agent logs its
                              observations. Verify admin dashboard shows all 6
                              agents with correct statuses.

  **5. Sync   Align all envs  Deploy all agents to staging at observe mode
  Envs**                      (staging does not auto-execute).

  **6.        Tag             Tag: admin@X.Y.Z-crewai-complete.
  Version                     
  Bump**                      

  **7. Update Handoff         Mark ADR-05 as IMPLEMENTED in
  Docs**                      docs/scaling/adr-05-crewai.md. Document all 6
                              agents, their current trust levels, graduation
                              criteria. Write handoff for SA-022.

  **8. Update Mark progress   Update ROADMAP.md Phase S: 'SA-021 All 6 agents
  Roadmap**                   deployed + graduated --- DONE \[date\]'. ADR-05
                              complete.

**SA-022: Extension + Edge Functions TypeScript Migration**

*Extension + Backend (Edge Functions) \| ADR: ADR-04 (TypeScript Phases
5-6) \| Hours: 18-24h \| Pair: Frontend + Backend*

  **Step**    **Action**      **Detail**

  **0. Entry  Verify          SA-017 complete (dashboard + admin fully
  Gate**      prerequisites   TypeScript). Shared types package available
                              (SupabaseJob, APIResponse\<T>, etc.). Extension
                              build pipeline supports TypeScript. Edge
                              Functions use Deno (native TypeScript support).

  **1.        Migrate         Extension (Phase 5): migrate 43 files to
  Develop**   extension + EFs TypeScript --- priority order: background.js,
                              popup.js, contentScript.js, toolbar-overlay.js,
                              interceptor.js, then remaining. Use shared types
                              package for job data shapes and API responses.
                              Add separate tsconfig for extension with strict:
                              true. Edge Functions (Phase 6): enforce strict
                              mode on all 88 functions. Create shared types
                              package (published as internal npm package or
                              shared directory): request/response schemas for
                              all gateway endpoints. Migrate JS-body functions
                              to full TypeScript. Add type-safe Supabase client
                              initialization.

  **2. Test   Validate        Extension: tsc \--noEmit zero errors. Build
  (local)**   migration       extension. Verify all functionality: job
                              scraping, popup, toolbar overlay, background
                              sync. Edge Functions: tsc \--noEmit zero errors
                              on all functions. Deploy to dev Supabase. Verify
                              gateway routing works with typed functions.
                              Verify shared types consistent across dashboard,
                              extension, and EFs.

  **3. Deploy Push to         Deploy TypeScript extension. Deploy all Edge
  to Prod**   production      Functions with strict TypeScript. Publish shared
                              types package.

  **4. Test   Validate in     Full extension test: install, scrape a job page,
  (prod)**    production      verify data in dashboard. Full EF test: hit all
                              gateway endpoints, verify responses match typed
                              schemas. Monitor PostHog for 4 hours.

  **5. Sync   Align all envs  Deploy to staging.
  Envs**                      

  **6.        Tag             Tag: extension@X.Y.Z-typescript,
  Version                     infra@ef-typescript-v1.0.0.
  Bump**                      

  **7. Update Handoff         Mark ADR-04 as IMPLEMENTED (all 6 phases).
  Docs**                      Document shared types package. Write handoff for
                              SA-023.

  **8. Update Mark progress   Update ROADMAP.md Phase S: 'SA-022 Full
  Roadmap**                   TypeScript migration complete --- DONE
                              \[date\]'. ADR-04 complete.

**SA-023: Load Test (5,000 Concurrent) + Scale Validation Dry Run**

*All Surfaces + Infrastructure \| ADR: All ADRs (Validation) \| Hours:
14-20h \| Pair: Full Pod 3*

  **Step**    **Action**      **Detail**

  **0. Entry  Verify          All ADRs implemented: ADR-01 (Typesense), ADR-02
  Gate**      prerequisites   (SPA --- dashboard + admin), ADR-03 (Gateway),
                              ADR-04 (TypeScript), ADR-05 (CrewAI), ADR-06
                              (Data Pipeline). Design system complete with zero
                              inline styles and full dark mode. 1M+ jobs in
                              database (Common Crawl + ATS). Read replica
                              operational. Partitioning active. All 6 CrewAI
                              agents deployed.

  **1.        Build load test Create load test scenarios using k6 or Artillery:
  Develop**   suite           Scenario A (search heavy): 2,000 concurrent users
                              executing Typesense searches via gateway.
                              Scenario B (mixed workload): 1,500 dashboard
                              users + 50 admin users + 500 landing page
                              visitors + 200 extension syncs + 6 CrewAI agents.
                              Scenario C (ingestion + read): Common Crawl batch
                              processing 50K records while 1,000 users actively
                              search. Scenario D (spike): ramp from 0 to 5,000
                              concurrent in 60 seconds. Define pass/fail
                              criteria: p95 search \< 500ms, p99 \< 1s, zero
                              5xx errors, gateway overhead \< 100ms, replica
                              lag \< 5s, zero connection pool exhaustion.

  **2. Test   Validate test   Run each scenario at 10% scale against staging.
  (local)**   suite           Verify test harness works. Verify metrics
                              collection. Verify pass/fail criteria evaluation.

  **3. Deploy Prepare         Schedule load test window (low-traffic period).
  to Prod**   production      Ensure all monitoring dashboards ready: PostHog,
                              Typesense Cloud, Supabase metrics, gateway logs.
                              Set up real-time alerting during test. Notify all
                              stakeholders.

  **4. Test   Execute load    Run all 4 scenarios against production in
  (prod)**    tests           sequence. Record all metrics. If any scenario
                              fails: identify bottleneck, document, stop test.
                              If all pass: record peak metrics as baseline.
                              Verify CrewAI agents continue operating under
                              load. Verify no data corruption during concurrent
                              writes + reads.

  **5. Sync   Document        No env sync needed. Document all metrics in load
  Envs**      results         test report.

  **6.        Tag             Git tag: infra@load-test-v1.0.0-passed (or
  Version                     -failed).
  Bump**                      

  **7. Update Handoff         Create load test report:
  Docs**                      docs/scaling/load-test-results.md. Document all
                              scenario results, bottlenecks found, metrics. If
                              failed: document remediation needed before scale
                              launch.

  **8. Update Mark progress   Update ROADMAP.md Phase S: 'SA-023 Load test
  Roadmap**                   \[PASSED/FAILED\] at 5,000 concurrent --- DONE
                              \[date\]'. If passed: Phase S complete. If
                              failed: SA-024 created for remediation.

**Phase S5: Platform Evolution (Weeks 14-20)**

Phase S5 builds the long-term evolution infrastructure that ensures the
platform remains flexible, extensible, and maintainable as it grows
beyond the initial scaling targets. These sessions address four
strategic principles: Maximizing Flexibility (event bus, webhook system,
feature flags), Scalable Development (experimentation framework for
data-driven growth), Proactive Evolution (hooks for future integrations
and features), and Sustainable Design (architecture fitness functions,
evolvability reviews, dependency management, deprecation protocol). This
phase can overlap with late Phase S4 work --- SA-024 can begin while
SA-022 is in progress.

**SA-024: Event Bus + Webhook System**

*Backend (Gateway + Edge Functions + Database) \| ADR: Platform
Evolution: Flexibility + Proactive Evolution \| Hours: 16-22h \| Pair:
Backend + Lead Platform Eng + Forward-Looking Dev*

  **Step**    **Action**      **Detail**

  **0. Entry  Verify          SA-005 complete (gateway with middleware plugin
  Gate**      prerequisites   architecture operational). SA-023 complete (load
                              test passed). Gateway middleware plugin interface
                              documented and validated. API consumer management
                              table operational. Chief Architect has approved
                              event bus architecture.

  **1.        Build event     EVENT BUS: Create platform_events table:
  Develop**   bus + webhook   event_id, event_type, source
              delivery        (surface/agent/system), payload (JSONB),
                              created_at, processed_at. Define event taxonomy
                              --- standardized event types: job.created,
                              job.updated, job.enriched, user.signup,
                              user.action, pipeline.stage_change,
                              agent.decision, agent.alert, system.error,
                              content.approved, referral.activated. Build event
                              emission layer: every significant platform action
                              writes to platform_events via a shared emit()
                              function. This is a 'hook' --- any future
                              feature that needs to react to platform events
                              subscribes to this bus instead of polling or
                              building custom integrations. WEBHOOK DELIVERY:
                              Create webhook_subscriptions table:
                              subscription_id, consumer_id (from
                              api_consumers), event_type_pattern (supports
                              wildcards: 'job.\*'), target_url, secret_hash
                              (for signature verification), active,
                              retry_policy. Build webhook-dispatcher Edge
                              Function: reads unprocessed events, matches
                              against subscriptions, delivers via HTTP POST
                              with HMAC signature. Retry with exponential
                              backoff (3 attempts). Dead letter queue for
                              failed deliveries. Add webhook-dispatcher as
                              gateway middleware (fires asynchronously after
                              response --- does not add latency). Build webhook
                              management endpoints in admin panel:
                              create/edit/delete subscriptions, view delivery
                              logs, test webhook. Initial internal subscribers:
                              PostHog (analytics events), Resend (transactional
                              email triggers). This is the primary 'scar' for
                              external integrations --- Zapier, third-party
                              apps, mobile push, and any future consumer can
                              subscribe to platform events via webhook without
                              any platform code changes.

  **2. Test   Validate event  Event emission: create a job, verify job.created
  (local)**   bus + webhooks  event in platform_events. Update a job, verify
                              job.updated. Test 10 different event types.
                              Webhook delivery: create a test subscription to
                              httpbin.org. Emit matching event. Verify webhook
                              delivered with correct payload and HMAC
                              signature. Test wildcard subscription (job.\*)
                              receives all job events. Test retry: subscribe to
                              a failing URL, verify 3 retries with exponential
                              backoff. Verify dead letter queue captures
                              failures. Verify webhook dispatch adds zero
                              latency to gateway responses (async). Test admin
                              panel: create subscription, view delivery log,
                              test webhook button.

  **3. Deploy Push to         Deploy platform_events table. Deploy event
  to Prod**   production      emission layer across all surfaces + agents.
                              Deploy webhook_subscriptions table. Deploy
                              webhook-dispatcher Edge Function + pg_cron
                              trigger. Deploy admin panel webhook management
                              UI. Register internal subscribers (PostHog,
                              Resend).

  **4. Test   Validate in     Perform 5 platform actions (create job, update
  (prod)**    production      job, agent decision, etc.). Verify events in
                              platform_events. Verify internal webhook
                              subscribers receive deliveries. Verify admin
                              panel shows delivery logs. Monitor for 2 hours
                              --- verify zero impact on gateway latency.

  **5. Sync   Align all envs  Deploy event bus + webhook system to staging.
  Envs**                      

  **6.        Tag             Tag: admin@X.Y.Z-event-bus. Git tag:
  Version                     infra@event-bus-v1.0.0.
  Bump**                      

  **7. Update Handoff         Create docs/scaling/event-bus.md: event taxonomy,
  Docs**                      emission patterns, webhook subscription API, HMAC
                              verification guide, delivery guarantees. This is
                              the developer-facing documentation for future
                              consumers. Evolvability Strategist reviews for
                              long-term maintenance burden. Write handoff for
                              SA-025.

  **8. Update Mark progress   Update ROADMAP.md Phase S: 'SA-024 Event bus +
  Roadmap**                   webhook system --- DONE \[date\]'.

**SA-025: Feature Flag Infrastructure + Experimentation Framework**

*All Authenticated Surfaces + Backend \| ADR: Platform Evolution:
Flexibility + Proactive Evolution \| Hours: 14-18h \| Pair: Frontend +
Backend + Forward-Looking Dev*

  **Step**    **Action**        **Detail**

  **0. Entry  Verify            SA-017 complete (SPA with data provider
  Gate**      prerequisites     abstraction). SA-005 complete (gateway
                                operational). Current binary feature flags
                                (SEARCH_ENGINE, SPA_MODE) documented.

  **1.        Build feature     FEATURE FLAG INFRASTRUCTURE: Create feature_flags
  Develop**   flag system +     table: flag_key, flag_type (boolean, percentage,
              experimentation   user_segment, variant), default_value, overrides
                                (JSONB --- per-user, per-tier, per-percentage
                                rules), description, created_at, updated_at.
                                Build feature-flags Edge Function behind gateway:
                                evaluates flags for current user context
                                (user_id, tier, created_at, location).
                                Client-side SDK: React hook useFeatureFlag(key)
                                that evaluates flags at render time with local
                                cache (avoids per-render API calls). Server-side:
                                gateway middleware that evaluates flags for
                                backend feature gating. Admin panel: flag
                                management UI --- create flags, set targeting
                                rules, percentage rollouts, user segment
                                targeting, kill flags instantly. Migrate existing
                                binary flags (SEARCH_ENGINE, SPA_MODE) to new
                                system. EXPERIMENTATION FRAMEWORK (hook for A/B
                                testing): Extend feature_flags with variant type:
                                flag can return one of N variants (e.g.,
                                'control', 'variant_a', 'variant_b').
                                Variant assignment is sticky per user (stored in
                                user_flag_assignments table). PostHog
                                integration: emit experiment_assignment events
                                for each variant assignment, enabling analysis in
                                PostHog. This is a 'scar' --- full A/B testing
                                with statistical analysis is future work, but the
                                assignment and tracking infrastructure exists
                                now. Forward-Looking Developer identifies first 5
                                features that should launch behind flags.

  **2. Test   Validate flags +  Boolean flag: create flag, verify useFeatureFlag
  (local)**   experiments       returns correct value. Percentage rollout: create
                                50% flag, verify ~50% of test users see it. User
                                segment: create flag targeting Pro tier only,
                                verify Free users don't see it. Variant flag:
                                create A/B flag, verify sticky assignment (same
                                user always gets same variant). Verify PostHog
                                experiment_assignment events fire. Admin panel:
                                create flag, edit targeting, kill flag --- verify
                                immediate effect. Verify gateway middleware
                                evaluates flags for backend gating. Verify local
                                cache: flag evaluation does not call API on every
                                render.

  **3. Deploy Push to           Deploy feature_flags table +
  to Prod**   production        user_flag_assignments table. Deploy feature-flags
                                Edge Function. Deploy React SDK (useFeatureFlag
                                hook). Deploy gateway middleware. Deploy admin
                                panel flag management UI. Migrate existing binary
                                flags.

  **4. Test   Validate in       Create a test flag with 10% rollout. Verify only
  (prod)**    production        ~10% of sessions see it. Kill the flag. Verify
                                immediate effect. Verify PostHog tracks
                                assignments. Verify zero latency impact (flags
                                cached client-side).

  **5. Sync   Align all envs    Deploy to staging. Staging has its own
  Envs**                        feature_flags table (flags can differ between
                                environments).

  **6.        Tag               Tag: dashboard@X.Y.Z-feature-flags,
  Version                       admin@X.Y.Z-feature-flags.
  Bump**                        

  **7. Update Handoff           Create docs/scaling/feature-flags.md: flag types,
  Docs**                        targeting rules, SDK usage, admin panel guide,
                                experimentation setup. Document first 5 flagged
                                features (Forward-Looking Developer).
                                Evolvability Strategist reviews for flag
                                lifecycle management (stale flag cleanup). Write
                                handoff for SA-026.

  **8. Update Mark progress     Update ROADMAP.md Phase S: 'SA-025 Feature
  Roadmap**                     flags + experimentation framework --- DONE
                                \[date\]'.

**SA-026: Architecture Fitness Functions + Evolvability Framework +
Dependency Management**

*All Surfaces + CI/CD \| ADR: Platform Evolution: Sustainable Design \|
Hours: 14-20h \| Pair: Eng Lead + Evolvability Strategist + QA + DevOps*

  **Step**    **Action**      **Detail**

  **0. Entry  Verify          SA-023 complete (load test passed --- full platform
  Gate**      prerequisites   validated). All ADRs implemented. 10 quality gates
                              operational in CI. Evolvability Strategist has
                              completed full architecture review of post-scaling
                              codebase.

  **1.        Build fitness   ARCHITECTURE FITNESS FUNCTIONS: Automated tests that
  Develop**   functions +     verify architectural constraints survive code
              evolvability    changes. Build 8 fitness functions as CI checks: (1)
              framework +     Dependency direction --- data providers never import
              dependency      from components, components never import from pages
              management      (layer enforcement). (2) Gateway middleware contract
                              --- all middleware functions conform to the standard
                              interface (type-checked). (3) No direct Supabase
                              client usage outside provider layer --- enforces
                              data abstraction. (4) No direct EF calls outside
                              gateway --- enforces gateway routing. (5) Event
                              emission on all write operations --- every
                              POST/PUT/DELETE endpoint emits a platform event. (6)
                              Feature flag usage on new features --- new
                              route/component additions must reference a feature
                              flag. (7) Design token compliance --- no hardcoded
                              colors/spacing outside design tokens (extends
                              existing Gate 8). (8) Hook point accessibility ---
                              all documented hook points (provider interfaces,
                              middleware slots, event subscriptions, flag API)
                              remain accessible and unconsumed hooks are flagged
                              as maintenance items. These run in CI alongside
                              existing 10 gates (now 18 gates total). EVOLVABILITY
                              FRAMEWORK: Create
                              docs/architecture/evolvability-review-template.md:
                              standardized checklist for phase gate reviews.
                              Evolvability Strategist conducts review at each
                              phase gate (S1→S2, S2→S3, etc.) evaluating: hook
                              point utilization, scar point readiness, technical
                              debt accumulation, dependency health, architectural
                              drift from ADR decisions. Results documented in
                              docs/architecture/evolvability-reviews/. DEPRECATION
                              PROTOCOL: Create
                              docs/architecture/deprecation-protocol.md: process
                              for deprecating APIs, components, and patterns.
                              Three stages: (1) Deprecated --- logged warnings,
                              documentation updated, removal timeline set. (2)
                              Sunset --- functionality disabled for new consumers,
                              existing consumers notified. (3) Removed --- code
                              deleted, tests updated. Gateway middleware tracks
                              deprecated endpoint usage and alerts when safe to
                              remove. DEPENDENCY MANAGEMENT: Configure Dependabot
                              (or Renovate) for automated dependency PRs ---
                              weekly for patch/minor, monthly for major. Add npm
                              audit to CI gate (enforced, not advisory). Create
                              dependency review checklist for major version bumps.
                              Establish quarterly dependency health review ---
                              Evolvability Strategist reviews dependency tree for
                              abandoned packages, security advisories, and
                              migration paths. TECHNICAL DEBT TRACKING: Create
                              tech_debt_register.md in docs/architecture/: running
                              log of known debt with severity, impact, and target
                              resolution session. Quality gates flag new debt
                              additions. TPM reviews register at weekly Marston
                              sync.

  **2. Test   Validate        Run all 8 fitness functions against current codebase
  (local)**   fitness         --- all must pass (current code is the baseline).
              functions +     Intentionally violate each constraint --- verify CI
              framework       catches it: import Supabase client directly in a
                              component (fitness function 3 catches it), add a
                              hardcoded color (fitness function 7 catches it), add
                              a write endpoint without event emission (fitness
                              function 5 catches it). Verify Dependabot/Renovate
                              creates PRs for outdated dependencies. Verify
                              deprecation middleware logs warnings for deprecated
                              test endpoint.

  **3. Deploy Push to         Deploy 8 new CI fitness functions (18 gates total).
  to Prod**   production      Deploy deprecation middleware in gateway. Configure
                              Dependabot/Renovate. Commit evolvability review
                              template, deprecation protocol, and tech debt
                              register.

  **4. Test   Validate in     Submit a test PR that violates a fitness function
  (prod)**    production      --- verify CI blocks merge. Verify
                              Dependabot/Renovate opens first dependency PR.
                              Verify deprecation middleware logs on deprecated
                              test endpoint. Verify tech debt register is
                              accessible and current.

  **5. Sync   Align all envs  CI gates apply to all branches (already enforced).
  Envs**                      Deploy deprecation middleware to staging.

  **6.        Tag             Git tag: infra@fitness-functions-v1.0.0.
  Version                     
  Bump**                      

  **7. Update Handoff         Create docs/architecture/fitness-functions.md: all 8
  Docs**                      fitness functions documented with constraint
                              rationale. Commit evolvability review template,
                              deprecation protocol, dependency management policy,
                              tech debt register. Evolvability Strategist conducts
                              first official evolvability review of the complete
                              scaled platform and documents findings.

  **8. Update Mark progress   Update ROADMAP.md Phase S: 'SA-026 Architecture
  Roadmap**                   fitness functions + evolvability framework --- DONE
                              \[date\]'. Phase S complete.

**Investment Summary**

  **Phase**       **Sessions**   **Chat       **Timeline**   **ADRs**
                                 Hours**                     

  Phase S1:       6              80-110h      Weeks 1-4      ADR-01, ADR-03,
  Foundation                                                 ADR-04 P1

  Phase S2:       6              74-98h       Weeks 3-8      ADR-05 P1, ADR-06
  Automation +                                               
  Data                                                       

  Phase S3:       5              96-128h      Weeks 5-12     ADR-02, ADR-04 P2-4,
  Frontend                                                   CSS/Design System
  Modern.                                                    

  Phase S4: Scale 6              80-108h      Weeks 10-16    ADR-04 P5-6, ADR-05
  Validation                                                 P2, ADR-06 P2

  Phase S5:       3              44-60h       Weeks 14-20    Event Bus, Feature
  Platform                                                   Flags, Fitness
  Evolution                                                  Functions

  **TOTAL**       **26**         **374-504h   **20 weeks**   **All ADRs +
                                 (chat)**                    Evolution**

> *Chat hours represent the in-session execution time. The total
> engineering investment (including between-session planning, review,
> research, and coordination) is approximately 1.5-2x the chat hours.
> Budget a 20% contingency (75-100 additional hours) for surprises.*

**Phase S Completion Criteria (All 5 Phases)**

Phase S is complete when ALL of the following are true. These criteria
span all 5 phases --- Phases S1-S4 deliver the scaled platform, Phase S5
ensures it remains evolvable:

> *Typesense serving all dashboard search with \< 200ms p95 latency at
> 1M+ docs*
>
> *API gateway routing all 88 Edge Functions with middleware plugin
> architecture, unified auth, rate limiting, and CDN cache headers*
>
> *Dashboard + admin fully migrated to unified Vite + React Router SPA
> with strict TypeScript and data provider abstraction --- public-facing
> pages (landing, SEO) remain static/server-rendered*
>
> *All 75 dashboard JS files, 43 extension files, and 88 Edge Functions
> migrated to strict TypeScript*
>
> *Design system complete: all design tokens defined as CSS custom
> properties, Tailwind config cleaned (zero regex safelist), component
> pattern library documented and enforced*
>
> *Zero inline styles on all authenticated surfaces (dashboard + admin)
> --- 827+ inline styles eliminated and replaced with Tailwind utilities
> using design tokens*
>
> *Dark mode complete on every component of every authenticated page ---
> light and dark themes verified*
>
> *Tailwind CSS output \< 100KB after purge --- no hardcoded colors, no
> arbitrary values outside design tokens*
>
> *All 6 CrewAI agents deployed at appropriate trust levels with kill
> switches operational*
>
> *Common Crawl ingestion pipeline processing 50K+ records per batch
> with 30-40% dedup rate*
>
> *Incremental materialized views refreshing deltas only (not full
> table)*
>
> *Read replica operational and routing all SELECT queries*
>
> *Database partitioned by source (ats, common_crawl, amazon)*
>
> *Load test passed at 5,000 concurrent users with zero 5xx errors and
> p95 search \< 500ms*
>
> *Event bus operational with standardized event taxonomy --- all write
> operations emit platform events. Webhook delivery system with
> HMAC-signed payloads and retry logic*
>
> *Feature flag infrastructure with percentage rollouts, user segment
> targeting, variant assignments, and PostHog experiment tracking. React
> SDK (useFeatureFlag) and gateway middleware operational*
>
> *API consumer management with per-consumer keys, rate limits, and
> audit logging --- scar for future self-service developer portal*
>
> *8 architecture fitness functions enforced in CI (18 total gates) ---
> layer boundaries, gateway routing, event emission, feature flag usage,
> design token compliance, and hook point accessibility all verified on
> every PR*
>
> *Evolvability framework operational: phase gate reviews, deprecation
> protocol, dependency management (Dependabot/Renovate), and technical
> debt register maintained*
>
> *Data provider abstraction layer enforced --- no direct
> Supabase/Typesense client usage in component or page layers*
