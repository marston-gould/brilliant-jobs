# Pod 3 + Pod 4 — Team Manifest

> Last updated: 2026-03-14 | PC-002/003/004 complete

## Pod 3: Core Engineering (10 roles — original)

| Role | Responsibility |
|------|---------------|
| **Engineering Lead** | Technical direction, code review authority, architecture decisions |
| **Senior Backend Engineer** | Supabase Edge Functions, database, API layer |
| **Senior Frontend Engineer** | Dashboard, landing page, admin UI |
| **Security Engineer** | Auth, RLS, CSP, secrets management, vulnerability remediation |
| **DevOps/Infrastructure Engineer** | CI/CD, Vercel, Cloudflare, monitoring, environment management |
| **QA/Test Engineer** | Test suites, quality gates, regression prevention, load testing |
| **Data Engineer** | Cron jobs, materialized views, data pipeline, Common Crawl ingestion |
| **TPM** | Session management, standup coordination, phase gate reviews, weekly Marston syncs |
| **Technical Writer** | Audit artifacts, ADRs, HANDOFF.md, ROADMAP.md, commit conventions |
| **Senior CSS/Tailwind Engineer** | Design system, dark mode, inline style elimination, Tailwind config |

## Pod 4: Scaling Architecture — Hook & Scar Focus (5 roles — added SA-006)

| Role | Responsibility |
|------|---------------|
| **Chief Architect** | Defines overall architecture. Ensures hook-and-scar principles are embedded from the start, allowing for expandability. Reviews all foundation decisions for long-term extensibility. Signs off on ADR implementations. Conducts hook/scar reviews at phase transitions. |
| **Lead Platform Engineer** | Builds core platform components. Implements the hooks and scars necessary for flexible integration. Owns the API gateway plugin architecture, data provider abstractions, and shared type system. Pairs on SA-004/SA-005 (gateway), SA-006 (TypeScript), SA-013 (SPA scaffold). |
| **System Architect — Scalability** | Ensures the system can scale to handle future traffic and features. Owns read replica strategy, partitioning decisions, connection pooling config, and load test acceptance criteria. Reviews all database schema changes for scale implications. |
| **Forward-Looking Developer(s)** | Actively prototype and develop potential hooks, anticipating future needs and capabilities. Build event bus, webhook system, feature flag SDK, and CrewAI agent framework. Implement "scar" patterns (API consumer management, plugin interfaces) that are ready when product decisions come. |
| **Evolvability Strategist** | Dedicated to long-term planning. Ensures scars are sufficient and the architecture remains maintainable over time. Conducts formal evolvability reviews at each phase transition (S1→S2, S2→S3, S3→S4, S4→S5). Evaluates: hook point utilization, scar point readiness, technical debt accumulation, dependency health, architectural drift from ADR decisions. Owns deprecation protocol, tech debt register, architecture fitness functions. |

## Authority & Decision Flow

- **Marston**: Final authority on launch scope, strategic decisions, and agent graduation approvals.
- **Chief Architect**: Architecture sign-off required for all ADR implementations. Can trigger session scope adjustments.
- **Evolvability Strategist**: Phase transition reviews are async and non-blocking, but critical findings escalate to Marston + Chief Architect.
- **TPM**: Owns daily standups, phase gate reviews, and weekly Marston syncs. Central coordination across all pods.

## Pairing Assignments (Scaling Sessions)

| Session | Primary Pair | Pod 4 Reviewer |
|---------|-------------|----------------|
| SA-004/SA-005 | Backend + Security | Lead Platform Eng + Chief Architect |
| SA-006 | Frontend + Eng Lead | Chief Architect (type system review) |
| SA-007–SA-009 | Data Eng + Backend | System Architect—Scalability |
| SA-010–SA-012 | Backend + Eng Lead | Forward-Looking Dev |
| SA-013–SA-017 | Frontend + CSS/Tailwind Eng | Lead Platform Eng + Chief Architect |
| SA-018–SA-019 | Data Eng + DevOps | System Architect—Scalability |
| SA-020–SA-021 | Backend + Eng Lead | Forward-Looking Dev |
| SA-022 | Frontend + Backend | Chief Architect |
| SA-023 | Full Pod 3 | Full Pod 4 |
| SA-024–SA-025 | Backend + Lead Platform Eng | Forward-Looking Dev |
| SA-026 | Evolvability Strategist + Chief Architect | Full Pod 4 |
| SA-027 | Chief Architect + Lead Platform Eng | Evolvability Strategist |
| SA-028 | System Architect—Scalability + DevOps + Data Eng | Chief Architect |
| SA-029 | Forward-Looking Dev(s) + Evolvability Strategist + Chief Architect | Full Pod 4 |

## Phase Transition Reviews

| Transition | Reviewer | Focus |
|-----------|----------|-------|
| S1 → S2 | Evolvability Strategist + Chief Architect | Gateway extensibility, TypeScript foundation quality, hook utilization |
| S2 → S3 | Evolvability Strategist | Data pipeline scalability, CrewAI agent framework flexibility |
| S3 → S4 | Evolvability Strategist + CSS/Tailwind Eng | SPA architecture, design system completeness, dark mode coverage |
| S4 → S5 | Evolvability Strategist + System Architect | Scale validation results, partition strategy, read replica health |
| S5 → S6 | Evolvability Strategist + Chief Architect | Platform evolution completeness, fitness function coverage, hook/scar utilization rates, event bus adoption, feature flag usage |
| S6 Final | Full Pod 4 + Marston | Architecture governance readiness, capacity model accuracy, evolvability baseline established, Phase S complete |

## Pairing Assignments (Remaining Items Sessions)

| Session | Primary Pair | Pod 4 Reviewer |
|---------|-------------|----------------|
| REM-001 | Security + DevOps | Chief Architect |
| REM-002 | Frontend + QA | Lead Platform Eng |
| REM-003 | Backend + DevOps | System Architect—Scalability |
| REM-004 | Frontend + QA | Forward-Looking Dev |
| REM-005 | Frontend + Security | Evolvability Strategist + Chief Architect |

## Pairing Assignments (Build Instrumentation Sessions)

| Session | Primary Pair | Pod 4 Reviewer |
|---------|-------------|----------------|
| BI-01 | DevOps + Lead Platform Engineer | Chief Architect |
| BI-02 | DevOps + Lead Platform Engineer | Chief Architect + System Architect—Scalability |
| BI-03 | DevOps + Lead Platform Engineer | Chief Architect + System Architect—Scalability |
| BI-04 | DevOps + Lead Platform Engineer | Chief Architect + Evolvability Strategist |
| BI-05 | DevOps + Lead Platform Engineer | Chief Architect + Evolvability Strategist |
| BI-06 | DevOps + Lead Platform Engineer | Chief Architect + Evolvability Strategist + System Architect—Scalability |

## Pairing Assignments (Feature Build: Pay After You Land)

| Session | Primary Pair | Pod 4 Reviewer |
|---------|-------------|----------------|
| FB-PAYL-S1 | Lead Platform Eng + Forward-Looking Dev | Chief Architect + Evolvability Strategist |
| FB-PAYL-S2 | Frontend + Lead Platform Eng | System Architect—Scalability + Chief Architect |
| FB-PAYL-S3 | DevOps + Lead Platform Eng | Chief Architect + System Architect—Scalability |
| FB-PAYL-S4 | Lead Platform Eng + Security Eng | Chief Architect + Evolvability Strategist |
| UX-001-S1 | Lead Platform Eng + Forward-Looking Dev | Chief Architect + Evolvability Strategist |
| UX-001-S2 | Lead Platform Eng + System Architect—Scalability | Chief Architect + Evolvability Strategist |
| UX-001-S3 | Lead Platform Eng + Forward-Looking Dev | Chief Architect + System Architect—Scalability |

## Pairing Assignments (Feature Build: Extension Auto-Submit)

| Session | Primary Pair | Pod 4 Reviewer |
|---------|-------------|----------------|
| EXT-AS-1 | Lead Platform Eng + Forward-Looking Dev | Chief Architect + Evolvability Strategist |
| EXT-AS-2 | Frontend + Lead Platform Eng | Chief Architect + System Architect—Scalability |
| EXT-AS-3 | Lead Platform Eng + Forward-Looking Dev | Chief Architect + System Architect—Scalability |
| EXT-AS-4 | Lead Platform Eng + Forward-Looking Dev | Chief Architect + Evolvability Strategist |
| EXT-AS-5 | Lead Platform Eng + Forward-Looking Dev | Chief Architect + Evolvability Strategist |
| EXT-AS-6 | Lead Platform Eng + Forward-Looking Dev | Chief Architect + Evolvability Strategist |
| EXT-AS-7 | Lead Platform Eng + Forward-Looking Dev | Chief Architect + System Architect—Scalability |
| EXT-AS-8 | Lead Platform Eng + Forward-Looking Dev | Chief Architect + Evolvability Strategist |

## Pairing Assignments (Applicant Form Extension)

| Session | Primary Pair | Pod 4 Reviewer |
|---------|-------------|----------------|
| AF-001 | Lead Platform Eng + Forward-Looking Dev | Chief Architect + Evolvability Strategist |
| AF-002 | Lead Platform Eng + Forward-Looking Dev | Chief Architect + Evolvability Strategist |
| AF-003 | Lead Platform Eng + Forward-Looking Dev | Chief Architect + System Architect—Scalability |
| AF-004 | Lead Platform Eng + Forward-Looking Dev | Chief Architect + System Architect—Scalability |
| AF-005 | Lead Platform Eng + Forward-Looking Dev | Chief Architect + Evolvability Strategist |
| AF-006 | Lead Platform Eng + Forward-Looking Dev | Chief Architect + System Architect—Scalability |
| APR-001 | Senior Frontend Eng + Lead Platform Eng | Chief Architect + Evolvability Strategist |
| APR-002 | Senior Frontend Eng + Lead Platform Eng | Chief Architect + Evolvability Strategist |

## Pairing Assignments (Trial Gate)

| Session | Primary Pair | Pod 4 Reviewer |
|---------|-------------|----------------|
| FB-TRIAL-001-S1 | Lead Platform Eng + Evolvability Strategist | Chief Architect + Evolvability Strategist |
| FB-TRIAL-001-S2 | Lead Platform Eng + Forward-Looking Dev | Chief Architect + Evolvability Strategist |
| FB-TRIAL-001-S3 | Lead Platform Eng + Forward-Looking Dev | Chief Architect + Evolvability Strategist |
| FB-TRIAL-001-S4 | Lead Platform Eng + Forward-Looking Dev | Chief Architect + Evolvability Strategist |
| FB-TRIAL-001-S5 | Lead Platform Eng + Forward-Looking Dev | Chief Architect + Evolvability Strategist |
| FB-TRIAL-001-S6 | Lead Platform Eng + Forward-Looking Dev | Chief Architect + Evolvability Strategist |
| FB-TRIAL-001-S7 | Lead Platform Eng + Evolvability Strategist | Chief Architect + Forward-Looking Dev |
| FB-GHOST-BADGE-001 | Lead Platform Eng + Forward-Looking Dev | Chief Architect + Evolvability Strategist |
| FB-PI-001-S1 | Lead Platform Eng + Forward-Looking Dev | Chief Architect + System Architect—Scalability |
| FB-PI-001-S2 | Lead Platform Eng + Forward-Looking Dev | Chief Architect + Evolvability Strategist |
| FB-PI-001-S3 | Lead Platform Eng + Forward-Looking Dev | Chief Architect + Evolvability Strategist |
| FB-PI-001-S4 | Senior Frontend Eng + Lead Platform Eng | Chief Architect + Evolvability Strategist |
| FB-PI-001-S5 | Lead Platform Eng + Forward-Looking Dev | Chief Architect + Evolvability Strategist |
| FB-PI-001-S6 | Full Pod 3 | Full Pod 4 |

## Pairing Assignments (Pipeline Consolidation Cleanup)

| Session | Primary Pair | Pod 4 Reviewer |
|---------|-------------|----------------|
| PC-002 | Lead Platform Eng + Forward-Looking Dev | Chief Architect + Evolvability Strategist |
| PC-003 | QA/Test Eng + Forward-Looking Dev | Chief Architect + System Architect—Scalability |
| PC-004 | DevOps + Lead Platform Eng | Evolvability Strategist |

## Pairing Assignments (Spec Compliance Remediation)

| Session | Primary Pair | Pod 4 Reviewer |
|---------|-------------|----------------|
| SCA-REM-S1 | Evolvability Strategist + Lead Platform Eng | Chief Architect + Forward-Looking Dev |
| SCA-REM-S2 | Lead Platform Eng + Forward-Looking Dev | Chief Architect + Evolvability Strategist |
| SCA-REM-S3 | Chief Architect + Evolvability Strategist | Lead Platform Eng + System Architect—Scalability |
| SCA-REM-S4 | Lead Platform Eng + Forward-Looking Dev | Chief Architect + Evolvability Strategist |
| SCA-REM-S5 | Chief Architect + Lead Platform Eng | Evolvability Strategist + Forward-Looking Dev |
| SCA-REM-S6 | Lead Platform Eng + Forward-Looking Dev | Chief Architect + System Architect—Scalability |
| SCA-REM-S7 | Chief Architect + Evolvability Strategist | Lead Platform Eng + Forward-Looking Dev |
| BP-001+002 | Chief Architect + System Architect—Scalability | Lead Platform Eng + Forward-Looking Dev |

## Pairing Assignments (Cohort-Based Pricing)

| Session | Primary Pair | Pod 4 Reviewer |
|---------|-------------|----------------|
| COHORT-PRICING-S1 | Lead Platform Eng + Senior Backend Eng | Chief Architect + Evolvability Strategist |

## Pairing Assignments (Extension Build Pipeline)

| Session | Primary Pair | Pod 4 Reviewer |
|---------|-------------|----------------|
| EXT-BUILD-001-S1 | Lead Platform Eng + Forward-Looking Dev | Chief Architect + Evolvability Strategist |
| EXT-BUILD-001-S2 | Lead Platform Eng + Forward-Looking Dev | Chief Architect + System Architect—Scalability |
| EXT-BUILD-001-S3 | Chief Architect + Evolvability Strategist | Lead Platform Eng + System Architect—Scalability |
| EXT-BUILD-001-B5 | Lead Platform Eng + Forward-Looking Dev | Chief Architect + Evolvability Strategist |
