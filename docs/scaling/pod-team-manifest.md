# Pod 3 + Pod 4 — Team Manifest

> Last updated: 2026-03-08 | SA-028 in progress

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
