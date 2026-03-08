# Dependency Management Policy

**Brilliant Jobs — Scaling Architecture**  
**Established:** SA-029 (2026-03-08)  
**Maintained by:** DevOps/Infrastructure Engineer + Evolvability Strategist  
**Reviewed by:** Chief Architect

---

## 1. Automation

Dependabot is configured (`.github/dependabot.yml`, SA-027) with two ecosystems:

- **npm packages:** Weekly PRs on Mondays. Patch updates grouped. Supabase and React major versions pinned (upgrade manually per ADR-02, ADR-04). Limit: 5 open PRs.
- **GitHub Actions:** Monthly PRs. Limit: 3 open PRs.

All Dependabot PRs must pass the full 18-gate CI pipeline before merge.

---

## 2. Pinning Rules

| Dependency | Pin Strategy | Reason | Upgrade Process |
|-----------|-------------|--------|----------------|
| `@supabase/supabase-js` | Pin minor | Core data layer. Major version change = schema migration risk | Manual: full test suite + staging validation |
| `react` / `react-dom` | Pin major | ADR-02 architecture decision. Major = SPA rewrite risk | Manual: Chief Architect sign-off |
| `esbuild` | Float patch | Build tool. Patch updates safe | Auto via Dependabot |
| `deno std` | Pinned 0.177.0 | All EFs use this version (TD-010). Upgrade blocked until post-launch | Manual: staged EF rollout with test per function |
| `tailwindcss` | Float minor | CSS utility. Minor updates add classes | Auto via Dependabot |
| All other npm deps | Float patch, pin minor | Standard approach | Dependabot weekly |

---

## 3. Review Protocol

When a Dependabot PR arrives:

1. **Check CI passes** — all 18 gates (10 quality + 8 fitness)
2. **Check changelog** for breaking changes (Dependabot links it)
3. **If security advisory:** Merge within 48 hours. Fast-track: skip staging if patch-level and CI green.
4. **If major version:** Do NOT merge Dependabot PR. Create a dedicated SA session or tech debt item. Update relevant ADR if architectural implications.
5. **If grouped patch PR:** Merge if CI green. No further review required.

---

## 4. Vulnerability Response

| Severity | Response Time | Process |
|---------|--------------|---------|
| Critical (CVSS ≥ 9.0) | 24 hours | Immediate patch. Skip staging if CI green. Notify Marston. |
| High (CVSS 7.0–8.9) | 48 hours | Patch in next deploy cycle. Staging validation. |
| Medium (CVSS 4.0–6.9) | 1 week | Scheduled patch. Standard review. |
| Low (CVSS < 4.0) | Next Dependabot cycle | Auto-merged if patch-level. |

GitHub Advanced Security alerts are monitored. `npm audit` runs in CI (quality gate 10).

---

## 5. Deno Dependency Strategy

Supabase Edge Functions import from `https://deno.land/std@0.177.0/` and `https://esm.sh/`. These are URL-based imports without a lockfile.

- **Deno std:** Pinned to 0.177.0 across all 46 EF files (TD-010 tracks upgrade)
- **esm.sh imports:** Version-pinned in import URL (e.g., `@supabase/supabase-js@2`)
- **No Deno lockfile:** Accepted risk. EFs are deployed to Supabase's runtime which caches resolved modules. Import map not used.

Post-launch: evaluate Deno import maps for centralized version management.

---

## 6. Supply Chain Security

- **No private npm registry.** All packages from public npm.
- **Dependabot groups** dev dependencies separately to reduce PR noise.
- **Commit convention:** `deps(npm): bump <package>` / `deps(actions): bump <action>` for automated PRs.
- **Lock file:** `package-lock.json` committed and CI uses `npm ci` (exact versions).

---

## 7. Annual Review

This policy is reviewed annually or when the dependency count exceeds 100 production packages (currently ~45).

Triggers for policy revision:
- New runtime added (e.g., Bun, Node.js for EFs)
- Private npm registry adopted
- Deno import maps implemented
- Third-party security scanning tool added (e.g., Snyk, Socket)
