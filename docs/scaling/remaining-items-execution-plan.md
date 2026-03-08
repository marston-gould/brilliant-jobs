# BRILLIANT JOBS

**Remaining Items Execution Plan**

P75 + P76 Items Not Covered by Scaling Sessions (SA-001 → SA-029)

March 2026 --- CONFIDENTIAL

> **⛔ EXECUTION RULES**

> 1. These sessions run AFTER the current Chat Session Remediation
> Plan (CS-001 → CS-024) is complete.

> 2. These sessions run IN PARALLEL with Scaling Architecture sessions
> (SA-006+) where no dependency exists.

> 3. REM-005 (CSP strict) is BLOCKED on SA-017 completion --- do not
> start until SPA migration removes inline handlers.

> 4. Every session updates BOTH ROADMAP.md AND roadmap.html. No
> exceptions.

**Part 1: Phase Review Summary**

All six phases (P75, P76, P91, P92, P94, P95) were reviewed against the
29 Scaling Architecture sessions (SA-001 through SA-029). Four of the
six phases are 100% covered by scaling. The remaining items come from
P75 and P76 only.

  **Phase**   **Name**         **Total**   **Done**   **Scaling**   **Remaining (This
                                                                    Plan)**

  P75         Audit            157         145        0             12 items → 5
              Remediation                                           sessions

  P76         Post-Launch      22          21         0             1 item → bundled
              Admin                                                 into REM-003

  P91         Data Pipeline +  6           0          6             0 --- SA-007 →
              CrewAI                                                SA-012

  P92         SPA Migration    5           0          5             0 --- SA-013 →
                                                                    SA-017

  P94         Platform         3           0          3             0 --- SA-024 →
              Services                                              SA-026

  P95         Architecture     3           0          3             0 --- SA-027 →
              Governance                                            SA-029

**Net result:** 12 items from P75 + 1 item from P76 = 13 items organized
into 5 execution sessions totaling ~19.5 hours. An additional item
(0.005 SE-005) is included but blocked on scaling --- it cannot execute
until SA-017 completes.

**Part 2: Master Item List**

All 13 items not covered by scaling, with session assignment.

  **\#**   **Finding**   **Title**              **Est.**   **Phase**   **Session**   **Note**

  0.002    SE-002        Service role key       2h         P75         REM-001       Procedure scripted. Needs
                         rotation                                                    maintenance window +
                                                                                     Marston. G3 launch gate.

  0.005    SE-005        CSP unsafe-inline on   3h         P75         REM-005       BLOCKED on SA-017. 122
                         dashboard                                                   inline handlers must be
                                                                                     removed by SPA migration
                                                                                     first.

  0.017    EXT-SEC-005   Content script CSP     1h         P75         REM-001       Audit all injection points
                         bypass vectors                                              in ATS pages.

  0.036    BE-006        Edge Function empty    2h         P75         REM-003       EF catches mirror dashboard
                         catches                                                     pattern. Apply
                                                                                     reportError().

  0.041    EXT-ES-002    19 fire-and-forget     1h         P75         REM-002       chrome.runtime.sendMessage
                         .catch(()=>{})                                             calls suppress errors.

  0.042    EXT-ES-003    7 console/comment-only 1h         P75         REM-002       Catch blocks with only
                         handlers                                                    console or comment.

  0.043    EXT-ES-004    14+ missing lastError  2h         P75         REM-002       Only toolbar-overlay checks.
                         checks                                                      All other chrome API calls
                                                                                     skip.

  0.066    EXT-BE-003    Token refresh          1h         P75         REM-002       Refresh fails silently. Add
                         reliability                                                 retry + notification +
                                                                                     re-auth flow.

  0.067    EXT-CWS-001   Manifest permissions   1h         P75         REM-004       Justify each permission or
                         minimize                                                    remove.

  0.140    LS1-6         Ahrefs analytics audit 30min      P75         REM-005       Decision item: redundant
                                                                                     with PostHog+GSC? Remove if
                                                                                     yes.

  0.170    Cost Monitor  Anthropic proxy +      3h         P76         REM-003       Pattern 2.
                         cache layer                                                 Daily/weekly/monthly cost
                                                                                     tracking per function.

  0.181    EXT-QA        Extension E2E against  2h         P75         REM-004       15 handlers validated.
                         live ATS                                                    Snapshot tests.

**Part 3: Session Details**

5 sessions covering 13 items. Each session follows the standard 8-step
lifecycle from the Session Management Framework.

**REM-001: Security Hygiene**

  **Surface**     Extension + Dashboard + All Surfaces

  **Fix Items**   0.002 (SE-002), 0.017 (EXT-SEC-005)

  **Hours**       3h

  **Pair**        Security + DevOps

  -----------------------------------------------------------------------
  **ENTRY GATE:** All 24 CS sessions complete. Marston available for
  maintenance window coordination.

  -----------------------------------------------------------------------

  **Finding   **Title**                **Description**                 **Est.**
  ID**                                                                 

  0.002       SE-002: Key rotation     Execute                         2h
                                       scripts/rotate-jwt-secret.sh.   
                                       Coordinate maintenance window.  
                                       Invalidate old key. Update all  
                                       EF references. Verify no        
                                       service disruption. Clear G3    
                                       launch gate.                    

  0.017       EXT-SEC-005: CSP bypass  Audit all injection points in   1h
                                       ATS content scripts. Document   
                                       each                            
                                       innerHTML/insertAdjacentHTML    
                                       usage. Verify DOMPurify         
                                       coverage or add escHtml().      
                                       Produce audit report.           

  -----------------------------------------------------------------------
  **EXIT GATE:** Service role key rotated and old key invalidated. G3
  launch gate GREEN. Extension content script injection audit documented
  with mitigations.

  -----------------------------------------------------------------------

**Session Checklist:**

☐ Step 0: Entry gate verified

☐ Step 1: Code developed

☐ Step 2: Tests pass (local)

☐ Step 3: Deployed to prod

☐ Step 4: Tests pass (prod)

☐ Step 5: Environments synced

☐ Step 6: Version bumped + tagged

☐ Step 7: ROADMAP.md + roadmap.html updated

☐ Step 8: HANDOFF.md updated

**Notes:** *SE-002 requires Marston coordination for the maintenance
window. Schedule outside peak hours. Notify all services consuming the
key.*

**REM-002: Extension Error Handling Sweep**

  **Surface**     Extension

  **Fix Items**   0.041 (EXT-ES-002), 0.042 (EXT-ES-003), 0.043
                  (EXT-ES-004), 0.066 (EXT-BE-003)

  **Hours**       5h

  **Pair**        Frontend + QA

  -----------------------------------------------------------------------
  **ENTRY GATE:** REM-001 complete. Extension source available. PostHog
  SDK operational on extension.

  -----------------------------------------------------------------------

  **Finding   **Title**                **Description**                **Est.**
  ID**                                                                

  0.041       EXT-ES-002:              19 chrome.runtime.sendMessage  1h
              Fire-and-forget          calls with .catch(()=>{}).    
                                       Replace with reportError() +   
                                       PostHog capture. Categorize:   
                                       telemetry (downgrade to        
                                       console.warn) vs critical      
                                       (escalate to user              
                                       notification).                 

  0.042       EXT-ES-003: Console      7 catch blocks with only       1h
              handlers                 console.log or comment. Wire   
                                       to reportError() pattern       
                                       established in FIX-11.         

  0.043       EXT-ES-004: Missing      14+ chrome API calls without   2h
              lastError                chrome.runtime.lastError       
                                       checks. Only toolbar-overlay   
                                       has checks (4x). Add lastError 
                                       check after every chrome.tabs, 
                                       chrome.storage, chrome.runtime 
                                       call. Log to PostHog.          

  0.066       EXT-BE-003: Token        Token refresh fails silently.  1h
              refresh                  Add retry (3x exponential      
                                       backoff), notification to user 
                                       on final failure, and re-auth  
                                       flow trigger. Wire to PostHog  
                                       auth_refresh_failed event.     

  -----------------------------------------------------------------------
  **EXIT GATE:** Zero fire-and-forget catches in extension. All chrome
  API calls check lastError. Token refresh has retry + re-auth flow. All
  errors surface in PostHog.

  -----------------------------------------------------------------------

**Session Checklist:**

☐ Step 0: Entry gate verified

☐ Step 1: Code developed

☐ Step 2: Tests pass (local)

☐ Step 3: Deployed to prod

☐ Step 4: Tests pass (prod)

☐ Step 5: Environments synced

☐ Step 6: Version bumped + tagged

☐ Step 7: ROADMAP.md + roadmap.html updated

☐ Step 8: HANDOFF.md updated

**Notes:** *This session completes the extension error handling work
started in FIX-11 (EXT-ES-001). After this session, extension error
handling is fully remediated.*

**REM-003: Edge Function Hardening + Cost Monitoring**

  **Surface**     Edge Functions + Admin

  **Fix Items**   0.036 (BE-006), 0.170 (Cost Monitor)

  **Hours**       5h

  **Pair**        Backend + DevOps

  -----------------------------------------------------------------------
  **ENTRY GATE:** REM-001 complete. ai-guard.ts utility available
  (CS-009). Admin monitoring dashboard operational (CS-023/CS-024).

  -----------------------------------------------------------------------

  **Finding   **Title**                **Description**                **Est.**
  ID**                                                                

  0.036       BE-006: EF empty catches Edge Function catches mirror   2h
                                       dashboard pattern of silent    
                                       suppression. Audit all EF      
                                       source. Apply reportError() +  
                                       structured error response      
                                       pattern from ai-guard.ts.      
                                       Target: zero empty catch       
                                       blocks across all 93 EFs.      

  0.170       Cost Monitor: Anthropic  Build Anthropic API proxy EF   3h
              proxy                    that logs token usage per      
                                       call. Store in ai_usage_log    
                                       (exists from CS-009). Admin    
                                       cost dashboard:                
                                       daily/weekly/monthly           
                                       aggregation, per-function      
                                       breakdown, budget threshold    
                                       alerts. Wire to                
                                       evaluate-alerts pipeline.      

  -----------------------------------------------------------------------
  **EXIT GATE:** Zero empty catches in Edge Functions. Anthropic API
  proxy with per-function cost tracking live. Cost dashboard shows
  daily/weekly/monthly breakdown.

  -----------------------------------------------------------------------

**Session Checklist:**

☐ Step 0: Entry gate verified

☐ Step 1: Code developed

☐ Step 2: Tests pass (local)

☐ Step 3: Deployed to prod

☐ Step 4: Tests pass (prod)

☐ Step 5: Environments synced

☐ Step 6: Version bumped + tagged

☐ Step 7: ROADMAP.md + roadmap.html updated

☐ Step 8: HANDOFF.md updated

**Notes:** *0.170 extends the ai_usage_log table and ai-guard.ts utility
created in CS-009. The proxy pattern should be reusable for future AI
vendor additions.*

**REM-004: Extension QA + Manifest Hardening**

  **Surface**     Extension

  **Fix Items**   0.067 (EXT-CWS-001), 0.181 (Extension E2E)

  **Hours**       3h

  **Pair**        Frontend + QA

  -----------------------------------------------------------------------
  **ENTRY GATE:** REM-002 complete. Extension error handling fully wired.
  15 ATS handlers available for testing.

  -----------------------------------------------------------------------

  **Finding   **Title**                **Description**                **Est.**
  ID**                                                                

  0.067       EXT-CWS-001: Manifest    Review every permission in     1h
              perms                    manifest.json. Document        
                                       justification for each. Remove 
                                       any not actively used. Test    
                                       extension functionality after  
                                       removal. Update extension      
                                       docs.                          

  0.181       Extension E2E: Live ATS  Build E2E test suite against   2h
                                       all 15 ATS handlers (LinkedIn, 
                                       Greenhouse React/Legacy,       
                                       Lever, Workday, etc.). DOM     
                                       snapshot tests for each        
                                       handler. Verify graceful       
                                       degradation when selectors     
                                       change. Add to CI.             

  -----------------------------------------------------------------------
  **EXIT GATE:** Manifest permissions documented and minimized. E2E test
  suite covers all 15 ATS handlers with snapshot tests.

  -----------------------------------------------------------------------

**Session Checklist:**

☐ Step 0: Entry gate verified

☐ Step 1: Code developed

☐ Step 2: Tests pass (local)

☐ Step 3: Deployed to prod

☐ Step 4: Tests pass (prod)

☐ Step 5: Environments synced

☐ Step 6: Version bumped + tagged

☐ Step 7: ROADMAP.md + roadmap.html updated

☐ Step 8: HANDOFF.md updated

**Notes:** *E2E tests should use the resilientDOM.js utilities from
CS-010. Snapshot tests catch selector drift early.*

**REM-005: Analytics Cleanup + CSP Strict**

  **Surface**     Landing Page + Dashboard

  **Fix Items**   0.140 (LS1-6), 0.005 (SE-005)

  **Hours**       3.5h

  **Pair**        Frontend + Security

  -----------------------------------------------------------------------
  **ENTRY GATE:** REM-001 through REM-004 complete. SA-017 complete (SPA
  migration has removed all inline event handlers from dashboard).
  PostHog operational on all surfaces.

  -----------------------------------------------------------------------

  **Finding   **Title**                **Description**                **Est.**
  ID**                                                                

  0.140       LS1-6: Ahrefs audit      Evaluate Ahrefs analytics      30min
                                       overlap with PostHog + Google  
                                       Search Console. If redundant:  
                                       remove script, update CSP,     
                                       verify no data loss. If unique 
                                       value: document what Ahrefs    
                                       provides that others do not.   
                                       Decision item --- produce      
                                       recommendation.                

  0.005       SE-005: CSP strict       BLOCKED on SA-017. Once SPA    3h
              dashboard                migration removes 122          
                                       dashboard + 21 admin inline    
                                       event handlers (onclick=,      
                                       onchange=), switch CSP from    
                                       report-only to enforce. Remove 
                                       unsafe-inline. Verify no       
                                       functionality breaks. Monitor  
                                       CSP reports for 24h.           

  -----------------------------------------------------------------------
  **EXIT GATE:** Ahrefs decision documented (keep or remove). Dashboard
  CSP enforced (no unsafe-inline). Zero inline event handlers remaining.

  -----------------------------------------------------------------------

**Session Checklist:**

☐ Step 0: Entry gate verified

☐ Step 1: Code developed

☐ Step 2: Tests pass (local)

☐ Step 3: Deployed to prod

☐ Step 4: Tests pass (prod)

☐ Step 5: Environments synced

☐ Step 6: Version bumped + tagged

☐ Step 7: ROADMAP.md + roadmap.html updated

☐ Step 8: HANDOFF.md updated

**Notes:** *⛔ CRITICAL: 0.005 is BLOCKED on SA-017 (Remaining pages +
legacy removal). Do NOT attempt CSP enforcement until SPA migration has
removed all inline handlers. Starting early will break the entire
dashboard.*

**Part 4: Dependency Map + Scheduling**

**Execution Order**

Sessions are strictly sequential except where noted. REM-005 has a hard
dependency on scaling session SA-017.

  **Session**   **Title**             **Hours**   **Dependencies**

  REM-001       Security Hygiene      3h          CS-024 complete. Marston
                                                  available.

  REM-002       Extension Error       5h          REM-001 complete.
                Handling                          

  REM-003       EF + Cost Hardening   5h          REM-001 complete. Can parallel
                                                  with REM-002.

  REM-004       Extension QA +        3h          REM-002 complete.
                Manifest                          

  REM-005       Analytics + CSP       3.5h        REM-001--4 complete AND SA-017
                Strict                            complete (SPA migration).

**Critical Path:**

REM-001 → REM-002 → REM-004 (extension track)

REM-001 → REM-003 (EF track, can parallel with extension track)

REM-001--4 + SA-017 → REM-005 (blocked on scaling)

**Parallel Execution with Scaling**

REM-001 through REM-004 have no dependencies on any SA session and can
run concurrently with SA-006 onward. REM-005 is the only session that
requires a scaling session to complete first.

**Total estimated effort:** 19.5 hours across 5 sessions.

**Part 5: Standing Rules**

> **⚠ RULE 1:** Every session updates THREE files: ROADMAP.md (✅
> status), roadmap.html (s: 'done', p: 100), and HANDOFF.md. No
> exceptions.

> **⚠ RULE 2:** Run grep for all finding IDs touched in the session
> across BOTH ROADMAP.md AND roadmap.html to verify sync BEFORE
> committing.

> **⚠ RULE 3:** HANDOFF.md is the single source of truth. Update it
> last, every session.

> **⚠ RULE 4:** Product version must bump (BJ_VERSION via
> bump-version.sh) for any session that changes JS/CSS/HTML.

> **⛔ RULE 5:** Do NOT start REM-005 until SA-017 is complete. CSP
> enforcement on a dashboard with 122 inline handlers will break
> everything.

> **⚠ RULE 6:** Feature freeze remains in effect for security sessions
> (REM-001).
