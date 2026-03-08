# Claude Remediation — Standing Instructions & Workflow Rules

> **This file consolidates all standing instructions, workflow rules, and session protocols that govern Claude's behavior during Brilliant Jobs remediation and scaling sessions.**
>
> Source documents: Chat Session Remediation Plan, Scaling Chat Session Plan, Remaining Items Execution Plan, Phase 1 Remediation Plan, HANDOFF.md, Session Management Framework.

---

## Session Startup Protocol

1. Run `git pull` on the `brilliant-jobs` repo.
2. Read `HANDOFF.md` in the repo root. This is the **single source of truth** for where to begin.
3. Start working on whatever "Session In Progress" or "Next Session" says.

**Do NOT:**
- Read `Chat_Session_Remediation_Plan.docx` from project knowledge. It is 1,780 lines and fills the context window before any work begins.
- Search past conversations or re-examine completed work.
- Guess at session state — HANDOFF.md has everything.

---

## Session Lifecycle (8 Steps — Non-Negotiable)

Every session — CS, SA, REM, or CS-P1 — follows these 8 steps in order. Do not skip. Do not reorder.

| Step | Action | What to Do |
|------|--------|-----------|
| 0 | **Entry Gate** | Verify prerequisites from prior sessions are met. |
| 1 | **Develop** | Write and review code changes for the fix items in this session. |
| 2 | **Test (Local)** | Run automated tests + manual verification locally / in CI. |
| 3 | **Deploy to Prod** | Push to production (git push, Supabase migrations, EF deploys). |
| 4 | **Test (Prod)** | Validate the fix in the live production environment. |
| 5 | **Sync Environments** | Apply changes to staging + dev. Confirm all 3 envs match. |
| 6 | **Version Bump** | See versioning rules below. |
| 7 | **⛔ Update ROADMAP.md + roadmap.html** | MANDATORY — BOTH files, EVERY session, NO exceptions. |
| 8 | **Update HANDOFF.md** | Update as the last commit of the session. |

---

## ⛔ Roadmap Update Rules (Non-Negotiable)

Steps 7–8 require updating **THREE files**:

- `ROADMAP.md` = markdown source of truth
- `roadmap.html` = live `/roadmap` page users see
- `HANDOFF.md` = session state for the next session

**All three must reflect the same status.** This has been flagged multiple times by Marston.

### Verification Before Committing

```bash
grep "SA-XXX" ROADMAP.md     # Must show ✅
grep "SA-XXX" roadmap.html   # Must show s: 'done'
```

Replace `SA-XXX` with the actual session ID (e.g., `SA-008`, `CS-019`, `REM-001`).

If either grep shows the old status, the update is incomplete. Fix it before committing.

**Do NOT close the session until all three files are updated, committed, and pushed.**

### ROADMAP.md Updates
- Find the session row → change status to ✅ with completion notes.

### roadmap.html Updates
- Find matching entry → change `s:` to `'done'`, `p:` to `100`.

### HANDOFF.md Updates
- Move current session to "Last Completed Session" with full details.
- Set "Next Session" with entry gate, tasks, and test plan.
- Update Version Manifest.

---

## Versioning Protocol

**Two version systems operate simultaneously:**

1. **Git tags** for audit tracking (e.g., `extension@0.8.0-architecture`, `infra@dedup-v1.0.0`).
2. **Product version** (`BJ_VERSION` in `js/version.js`) — controls cache busting on ALL HTML surfaces.

### When to Bump Product Version
Every session that changes JS, CSS, or HTML must bump the product version.

### How to Bump
```bash
bash scripts/bump-version.sh X.YY
node build.js && node build-admin.js && npm run bundle:css
bash scripts/pre-commit-version-check.sh   # Verify all surfaces in sync
```

### Infrastructure-Only Sessions
Sessions that only change database schemas, Edge Functions, or infrastructure (no JS/CSS/HTML) do NOT require a product version bump. They still get a git tag.

---

## Large File Rules

- **Never** `view` or `cat` a file over 500 lines in its entirety.
- Use `view_range` to read only the 10–20 lines around the code you need to change.
- Line numbers are provided in each session's task breakdown in HANDOFF.md.
- For scanning: use `grep -n` for targeted searches, then `view` with explicit line ranges.

---

## Execution Order Rules

### Chat Session Remediation (CS-001 → CS-024)
Sessions must execute in order within each phase. Some sessions across phases can run in parallel where noted in the plan.

### Scaling Architecture (SA-001 → SA-026)
- Sessions within a phase are strictly sequential.
- Cross-phase parallelism is permitted where documented.
- Key dependency chain: SA-001→SA-003 (search) | SA-004→SA-005 (gateway) | SA-006 (TypeScript) — Phase S1, can overlap.
- SA-005 (gateway) MUST precede SA-010 (CrewAI agents route through gateway).
- SA-006 (TypeScript core) MUST precede SA-013 (SPA scaffold uses typed core modules).
- SA-017 (SPA migration) MUST precede SA-025 (feature flag SDK integrates with React).

### Remaining Items (REM-001 → REM-005)
- REM-001 → REM-002 → REM-004 (extension track)
- REM-001 → REM-003 (EF track, can parallel with extension track)
- REM-001–4 + SA-017 → REM-005 (blocked on scaling)
- REM-001 through REM-004 can run concurrently with SA-006 onward.

### Phase 1 Remediation (CS-P1-001 → CS-P1-017)
- **Do NOT start until** CS-001→CS-024 is 100% complete, June 1 launch has occurred and is stable, and Phase 0c post-launch sessions are complete.
- Phase order: A (Security) → B (Error Handling) → C (Observability) → D (CX) → E (SEO) → F (Architecture) → G (Admin).

---

## Standing Rules (All Plans)

### Universal Rules
1. Every session updates THREE files: `ROADMAP.md`, `roadmap.html`, and `HANDOFF.md`. No exceptions.
2. Run grep for all finding IDs touched in the session across BOTH `ROADMAP.md` AND `roadmap.html` to verify sync BEFORE committing.
3. `HANDOFF.md` is the single source of truth for session state. Update it last, every session.
4. Product version must bump (`BJ_VERSION` via `bump-version.sh`) for any session that changes JS/CSS/HTML.
5. Do NOT read `Chat_Session_Remediation_Plan.docx` or any other large plan document from project knowledge during active sessions. `HANDOFF.md` contains everything needed.

### Security Rules
6. Feature freeze remains in effect for security sessions (REM-001, CS-P1-001, CS-P1-002).
7. Paired assignments required for all P0 fix sessions and all security sessions.

### Blocking Rules
8. Do NOT start REM-005 until SA-017 is complete. CSP enforcement on a dashboard with 122 inline handlers will break everything.
9. Do NOT start Phase 1 Remediation until Chat Session Remediation is 100% complete.
10. Do NOT start any CS-P1 session until June 1 launch is stable and 72-hour dry run is clean.

---

## Evolvability Review Protocol (Scaling Sessions Only)

At each phase transition (S1→S2, S2→S3, S3→S4, S4→S5):
- The **Evolvability Strategist** conducts a formal architecture review.
- The **Chief Architect** reviews all hook and scar implementations for extensibility.
- Reviews are async and do not block sessions.
- Critical findings escalate to Marston + Chief Architect and can trigger session scope adjustments.

Reviews evaluate:
- Hook point utilization (are hooks being used or orphaned?)
- Scar point readiness (are scars still soft enough to cut open?)
- Technical debt accumulation
- Dependency health
- Architectural drift from ADR decisions

---

## Standing Meetings

| Meeting | Frequency | Duration | Facilitator |
|---------|-----------|----------|-------------|
| Daily standup | Daily, 9:00 AM | 15 min | TPM |
| Phase gate review | End of each phase | 60 min | Full pod |
| Weekly Marston sync | Fridays | 30 min | TPM |
| Sentry triage | End of day | 15 min | DevOps + on-call |
| Extension health check | Mondays | 15 min | Frontend + QA |

---

## Commit Conventions

- Audit artifacts: `audit(session-N): description`
- Remediation sessions: `fix(CS-NNN): description`
- Scaling sessions: `feat(SA-NNN): description` or `infra(SA-NNN): description`
- Remaining items: `fix(REM-NNN): description`
- Documentation: `docs: description`
- All artifacts committed under `docs/audit/` or `docs/scaling/` as appropriate.

---

## Decision Authority

| Person/Role | Authority |
|-------------|-----------|
| **Marston** | Final authority on launch scope, strategic decisions, and agent graduation approvals. |
| **Chief Architect** | Architecture sign-off required for all ADR implementations. Can trigger session scope adjustments. |
| **Evolvability Strategist** | Phase transition reviews. Critical findings escalate to Marston + Chief Architect. |
| **Engineering Lead** | Final call on technical approach within sessions. |
| **TPM** | Final call on sequencing and priority. Owns daily standups, phase gate reviews, weekly Marston syncs. |
