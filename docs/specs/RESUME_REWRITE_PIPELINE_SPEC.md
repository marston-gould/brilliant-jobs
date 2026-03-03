# Resume Rewrite Pipeline — Technical Spec

**Date:** February 22, 2026  
**Status:** Draft  
**Depends on:** Premium Resume Scoring (PREMIUM_RESUME_SCORING_SPEC.md), Entitlements system

---

## 1. Product Summary

After a premium analysis, the user reviews each recommendation and accepts or rejects it. Accepted items become a "rewrite brief" that flows through a multi-agent pipeline:

```
Premium Analysis
      │
      ▼
┌─────────────────────┐
│  ACCEPTANCE UI       │  User toggles recommendations on/off
│  + Cover letter opt  │  Selects 1 of 3 resume templates
│  + Template select   │
└─────────────────────┘
      │
      ▼
┌─────────────────────┐
│  REWRITE TEAM        │  Agents generate updated resume
│  (+ cover letter)    │  (+ cover letter if opted in)
└─────────────────────┘
      │
      ▼
┌─────────────────────┐
│  QA TEAM             │  Review for accuracy, bleed,
│                      │  AI-speak, punctuation
└─────────────────────┘
      │
      ▼
   Downloadable .docx
   (chosen template)
```

---

## 2. Acceptance UI

### Recommendation Cards

Each recommendation from the premium coaching response becomes an interactive card:

```
┌──────────────────────────────────────────────────┐
│ ☐  Rewrite: "Helped team improve deployment"    │
│    → "Reduced deployment time from 45min to 8min │
│       by implementing CI/CD pipeline"            │
│                                                  │
│    Rationale: Quantifies impact, uses strong     │
│    verbs matching JD language                    │
│                                                  │
│    [Accept ✓]  [Reject ✗]                        │
└──────────────────────────────────────────────────┘
```

### Recommendation Categories (each rendered as a section)

| Category | Source Field | Card Format |
|----------|------------|-------------|
| Priority Actions | `coaching.priority_actions` | Action + why + expected impact |
| Rewrite Suggestions | `coaching.rewrite_suggestions` | Before → after with rationale |
| Missing Keywords | `coaching.missing_keyword_injections` | Keyword + where + phrasing |
| Title Translations | `coaching.title_translations` | Current → suggested with reasoning |
| Achievement Prompts | `coaching.achievement_prompts` | Weak bullet + questions to quantify |
| Format Improvements | `coaching.format_improvements` | Description of change |
| Gap Bridging | `coaching.gap_bridging` | Gap + bridge strategy |

### User Inputs Before Rewrite

1. **Accepted recommendations** — toggle on/off per item
2. **Cover letter** — checkbox opt-in ("Include a tailored cover letter")
3. **Template selection** — choose 1 of 3 templates (visual preview)
4. **Achievement answers** — for accepted achievement prompts, user fills in the actual numbers/metrics (text input per prompt)
5. **"Generate Rewrite" button** — submits the brief

### Achievement Prompts — Special Handling

When the user accepts an achievement prompt, they need to provide the actual data. The card expands to show the questions:

```
┌──────────────────────────────────────────────────┐
│ ☑  Quantify: "Managed client relationships"      │
│                                                   │
│    ? How many clients did you manage?             │
│    [ 35+ enterprise accounts_____________ ]       │
│                                                   │
│    ? What was the retention/growth rate?           │
│    [ 94% retention, 22% upsell rate______ ]       │
│                                                   │
│    ? What revenue was involved?                    │
│    [ $4.2M ARR portfolio_________________ ]       │
└──────────────────────────────────────────────────┘
```

These answers feed directly into the rewrite agent so it can produce real, user-verified metrics — not fabricated ones.

---

## 3. Template Selection

Three resume templates, each a distinct visual style. User sees a thumbnail preview and picks one:

| Template | Style | Best For |
|----------|-------|----------|
| **Executive** | Clean, minimal, generous whitespace. Navy header. Serif headings, sans body. | Senior/director+ roles, traditional industries |
| **Modern** | Two-column layout. Colored sidebar with skills/contact. Sans-serif throughout. | Tech, creative, mid-level roles |
| **Classic** | Single column, traditional reverse-chronological. Black and white. Times-style headings. | Finance, legal, consulting, conservative industries |

Templates are implemented as `docx-js` configurations — font choices, spacing, color scheme, layout structure. The content is the same; only the visual presentation changes.

### Template Configuration Schema

```javascript
{
  id: 'executive',
  name: 'Executive',
  description: 'Clean and minimal for senior roles',
  fonts: { heading: 'Georgia', body: 'Calibri' },
  colors: { primary: '1B365D', accent: '4A90D9', text: '333333' },
  layout: 'single-column',
  headerStyle: 'centered',  // or 'left-aligned' or 'sidebar'
  sectionSpacing: 240,      // DXA
  bulletStyle: 'minimal',   // or 'standard' or 'icon'
}
```

---

## 4. Rewrite Team — Agent Specs

### Agent: Resume Writer

**Purpose:** Take the user's current resume content, the accepted recommendations, and the user-provided achievement data, and produce a complete rewritten resume.

**Critical constraints:**
- ONLY modify sections related to accepted recommendations
- Preserve all content the user did NOT flag for changes
- Use ONLY metrics/numbers the user provided in achievement answers
- Never fabricate accomplishments, statistics, or claims
- Keep each bullet point anchored to the specific job it belongs to — no cross-job bleed
- Maintain the user's authentic voice — no AI-sounding language

**System prompt:**
```
You are a Professional Resume Writer. You receive:
1. The candidate's current resume (structured)
2. A set of ACCEPTED recommendations with user-provided data
3. The target job requirements profile

Your job is to rewrite ONLY the parts that correspond to accepted recommendations. Everything else stays exactly as-is.

ABSOLUTE RULES:
- NEVER invent metrics, numbers, or achievements. Only use data the user explicitly provided.
- NEVER move achievements from one job to another. Each bullet must stay under its original role.
- NEVER use AI-typical phrasing: "leveraged", "spearheaded", "synergized", "cutting-edge", "passionate about", "results-driven professional", "dynamic", "proven track record of excellence".
- Use natural, human language. Write like a strong candidate would write, not like a chatbot.
- Keep bullet points concise — max 2 lines each.
- Preserve the candidate's industry jargon and authentic terminology.
- If a recommendation was REJECTED, do NOT apply it.

Output a JSON object with:
- sections: array of {section_name, content} — the full resume broken into sections
- changes_made: array of {original, rewritten, recommendation_id} — what changed and why
- unchanged_sections: [string] — sections you did not touch
```

**Model:** Sonnet  
**Temperature:** 0.3  

### Agent: Cover Letter Writer (conditional — only if user opted in)

**Purpose:** Generate a tailored cover letter based on the rewritten resume and JD profile.

**System prompt:**
```
You are a Cover Letter Writer. You receive the candidate's rewritten resume and the target job requirements.

Write a cover letter that:
- Opens with a specific hook relevant to the company/role (not "I am writing to apply for...")
- Connects 2-3 of the candidate's strongest matches to specific JD requirements
- Uses natural, conversational-professional tone
- Is 3-4 paragraphs, max 350 words
- Does NOT repeat resume bullets verbatim — adds context and narrative
- Does NOT use: "I am excited to apply", "I believe I would be a great fit", "Dear Hiring Manager" (use company name if known)

ABSOLUTE RULES:
- NEVER fabricate experiences or achievements not in the resume
- Use the candidate's own terminology and voice
- No AI-speak: avoid "passionate", "leverage", "synergy", "dynamic professional"

Output a JSON object with:
- salutation: string
- paragraphs: [string] — each paragraph as a string
- closing: string
- word_count: int
```

**Model:** Sonnet  
**Temperature:** 0.4 (slightly more creative for letter voice)

---

## 5. QA Team — Agent Specs

The QA team runs AFTER the rewrite team and BEFORE the user sees the output. It's an adversarial review — each agent looks for a specific class of problem.

### Agent: Accuracy Auditor

**Purpose:** Verify that the rewritten resume doesn't contain fabricated or inflated claims.

**System prompt:**
```
You are a Resume Accuracy Auditor. Compare the ORIGINAL resume against the REWRITTEN resume.

Flag ANY instance where the rewrite:
1. Adds metrics, numbers, or achievements NOT present in the original AND NOT provided by the user as achievement answers
2. Inflates scope (e.g., "managed 3 people" became "led a team of 15")
3. Adds skills, tools, or certifications the candidate never mentioned
4. Changes job titles to something materially different (not just market translation)
5. Adds company names, clients, or projects that weren't in the original

For each flag:
- severity: "critical" (fabricated fact) | "warning" (possible inflation) | "note" (minor embellishment)
- original_text: what the resume originally said
- rewritten_text: what it now says
- issue: what's wrong
- fix: suggested correction

Output JSON: { flags: [...], clean: boolean, flag_count: int }
```

**Model:** Haiku (fast, mechanical comparison)  
**Temperature:** 0

### Agent: Bleed Detector

**Purpose:** Ensure achievements stay with their correct jobs — no cross-contamination.

**System prompt:**
```
You are a Resume Consistency Auditor. Check that each bullet point in the rewritten resume is correctly attributed to the right job.

Flag ANY instance where:
1. An achievement from Job A appears under Job B
2. Metrics from one role are mixed into another role's bullets
3. Skills demonstrated at one company are falsely attributed to a different company
4. Date ranges don't align with claimed achievements

For each flag:
- bullet_text: the problematic bullet
- current_section: where it currently appears
- likely_source: where it probably belongs
- issue: description of the bleed
- fix: suggested correction

Output JSON: { flags: [...], clean: boolean, flag_count: int }
```

**Model:** Haiku  
**Temperature:** 0

### Agent: Voice & Polish Auditor

**Purpose:** Strip AI-sounding language, fix punctuation, ensure natural voice.

**System prompt:**
```
You are an Editorial Auditor specializing in detecting AI-generated text patterns. Review the rewritten resume and cover letter.

Flag AND auto-fix:

AI-SPEAK PATTERNS (always flag):
- "Leveraged" → use "used", "applied", or specific verb
- "Spearheaded" → use "led", "started", "launched"
- "Synergized" / "synergy" → remove or rephrase
- "Cutting-edge" / "state-of-the-art" → name the specific technology
- "Passionate about" → remove entirely or replace with evidence
- "Results-driven professional" → remove entirely
- "Dynamic" → remove or use specific descriptor
- "Proven track record" → remove, let the bullets prove it
- "Utilized" → use "used"
- "Facilitated" → use "ran", "organized", "led"
- "Endeavor" / "endeavors" → use "work", "project", "effort"
- Any sentence starting with "As a [adjective] [noun]..." — rewrite
- Excessive em dashes (—) — AI overuses these; limit to 1 per page max
- Semicolons in bullet points — replace with periods or restructure
- Oxford comma inconsistency — pick one style and enforce

PUNCTUATION ISSUES:
- Smart quotes vs straight quotes — standardize to smart
- Double spaces after periods
- Inconsistent bullet point endings (some with periods, some without)
- Inconsistent date formats
- Orphaned parentheses or brackets

TONE ISSUES:
- Overly formal language that doesn't match the candidate's original voice
- Generic filler phrases that add no information
- Unnecessarily complex sentences that could be simpler

For each issue:
- location: where in the document
- original: the problematic text
- fixed: the corrected text
- category: "ai_speak" | "punctuation" | "tone"

Output JSON: {
  flags: [...],
  auto_fixes_applied: int,
  clean_text_sections: {section_name: cleaned_text} — the fully cleaned resume sections,
  clean_cover_letter: [string] | null — cleaned cover letter paragraphs if applicable,
  flag_count: int
}
```

**Model:** Sonnet (needs nuance for voice detection)  
**Temperature:** 0

---

## 6. Pipeline Orchestration

### Edge Function: `rewrite-resume`

New Edge Function, separate from `score-resume`. Accepts the curated rewrite brief.

```typescript
// Request body
{
  resume_text: string,           // Original resume text
  resume_profile: object,        // Structured profile from premium analysis
  jd_profile: object,            // JD requirements from premium analysis
  accepted_recommendations: [    // User-curated list
    {
      id: string,                // Recommendation ID
      type: string,              // "rewrite" | "keyword" | "title" | "achievement" | "format" | "gap"
      data: object,              // The recommendation itself
      user_input?: string        // User-provided metrics for achievement prompts
    }
  ],
  include_cover_letter: boolean,
  template_id: "executive" | "modern" | "classic",
  filter_name: string
}
```

### Execution Flow

```
1. Validate request + auth + credit check
2. REWRITE TEAM (sequential):
   a. Resume Writer (Sonnet) → rewritten sections
   b. Cover Letter Writer (Sonnet, conditional) → cover letter
3. QA TEAM (parallel):
   a. Accuracy Auditor (Haiku) → fabrication flags
   b. Bleed Detector (Haiku) → cross-job flags
   c. Voice & Polish Auditor (Sonnet) → AI-speak fixes + cleaned text
4. RECONCILIATION:
   - If Accuracy Auditor has critical flags → auto-fix using original text
   - Apply Voice Auditor's auto-fixes to cleaned text
   - Log all QA flags for transparency
5. DOCUMENT GENERATION:
   - Build .docx from cleaned text using selected template
   - Build cover letter .docx if requested
6. Return download URLs + QA report
```

### Response Schema

```json
{
  "status": "complete",
  "resume_url": "/storage/v1/object/public/rewrites/{id}/resume.docx",
  "cover_letter_url": "/storage/v1/object/public/rewrites/{id}/cover-letter.docx",
  "template_used": "executive",
  "changes_summary": {
    "recommendations_applied": 8,
    "recommendations_rejected": 3,
    "sections_modified": ["Experience - Company A", "Skills"],
    "sections_unchanged": ["Education", "Experience - Company B"]
  },
  "qa_report": {
    "accuracy": { "clean": true, "flags": [] },
    "bleed": { "clean": true, "flags": [] },
    "voice": {
      "ai_speak_fixed": 4,
      "punctuation_fixed": 2,
      "tone_fixed": 1,
      "flags": [...]
    }
  },
  "agents_used": 5,
  "timing_ms": 18500,
  "cover_letter_included": true
}
```

---

## 7. Document Generation

Resume .docx files are generated server-side using `docx-js` (or equivalent Deno-compatible library in the Edge Function). Each template defines:

- Page layout (margins, columns)
- Font stack (heading + body)
- Color scheme
- Section ordering and spacing
- Header/footer format
- Bullet style

The cleaned text sections from the QA pipeline are slotted into the template structure. The Edge Function generates the .docx buffer and uploads to Supabase Storage.

### Template Previews (Frontend)

Three thumbnail images (static PNGs) shown in the template picker. These are pre-rendered examples, not live previews. Each shows:
- Template name
- 1-2 sentence description
- Best-for label
- Thumbnail of a sample resume in that template

---

## 8. Frontend Flow

### Step 1: Review Recommendations (after premium analysis)

New panel replaces or appears below the coaching section:

```
┌─────────────────────────────────────────────┐
│  ✨ Rewrite Your Resume                      │
│                                              │
│  Review the recommendations below.           │
│  Accept the ones you want applied.           │
│                                              │
│  [Select All]  [Deselect All]  5/8 accepted  │
│                                              │
│  ☑ Priority: Add Kubernetes to skills...     │
│  ☑ Rewrite: "Helped team improve..."  →...   │
│  ☐ Rewrite: "Responsible for client..."      │
│  ☑ Keyword: Add "CI/CD" to...               │
│  ☑ Title: "Team Lead" → "Engineering Mgr"   │
│  ☑ Achievement: Quantify "Managed clients"   │
│     → How many? [35+ enterprise________]     │
│     → Revenue?  [$4.2M ARR____________]      │
│  ☐ Format: Move education to bottom          │
│  ☑ Gap: Bridge career gap with...            │
│                                              │
│  ☐ Include cover letter                      │
│                                              │
│  Choose template:                            │
│  [Executive ✓]  [Modern]  [Classic]          │
│                                              │
│  [Generate Rewrite →]  costs X credits       │
└─────────────────────────────────────────────┘
```

### Step 2: Processing

Show progress with agent-by-agent status:

```
Writing resume...        ✓
Writing cover letter...  ✓
Checking accuracy...     ✓
Checking consistency...  ✓
Polishing language...    ◌
```

### Step 3: Results

```
┌─────────────────────────────────────────────┐
│  ✅ Rewrite Complete                         │
│                                              │
│  📄 Download Resume (.docx)                  │
│  📄 Download Cover Letter (.docx)            │
│                                              │
│  QA Summary:                                 │
│  ✓ Accuracy: Clean — no fabricated claims    │
│  ✓ Consistency: Clean — no cross-job bleed   │
│  ✓ Polish: 4 AI phrases fixed,              │
│            2 punctuation fixes               │
│                                              │
│  Changes made: 8 recommendations applied     │
│  Sections modified: Experience, Skills       │
│  Sections unchanged: Education, Certs        │
│                                              │
│  [View QA Details ▸]                         │
└─────────────────────────────────────────────┘
```

---

## 9. Credit Gating

| Feature | Entitlement ID | Credits |
|---------|---------------|---------|
| Resume rewrite (no cover letter) | `resume_rewrite` | Higher than premium analysis |
| Resume rewrite + cover letter | `resume_rewrite_cover` | Highest |
| Rewrite revision round | `resume_rewrite_revision` | Lower than initial rewrite |

---

## 10. Gap Interview — Closing JD Gaps Before Rewrite

### Problem

The premium analysis identifies gaps between the resume and JD requirements. Some gaps are genuinely missing experience — but many are experience the user HAS but didn't articulate well (or at all) on their resume. Before rewriting, we should try to close as many gaps as possible by asking the user directly.

### Flow

After the user sees gap analysis but BEFORE the acceptance UI:

```
Premium Analysis Complete
      │
      ▼
┌─────────────────────────────────┐
│  GAP INTERVIEW                   │
│                                  │
│  "We found 6 gaps between your   │
│   resume and target roles.       │
│   Let's see if you can close     │
│   some of them."                 │
│                                  │
│  Gap 1: Kubernetes experience    │
│  Prevalence: 70% of JDs          │
│                                  │
│  ? Do you have any container or  │
│    orchestration experience?     │
│  [ Yes — Docker, ECS, some K8s  │
│    in staging environments_____ ]│
│                                  │
│  ? Any certifications planned?   │
│  [ Currently studying for CKA__ ]│
│                                  │
│  Gap 2: Team leadership (10+)    │
│  ? Largest team you've managed?  │
│  [ 8 direct, 15 with contractors]│
│                                  │
│  [Skip remaining]  [Continue →]  │
└─────────────────────────────────┘
```

### Agent: Gap Interviewer

**Purpose:** Generate smart, targeted questions for each gap identified in the premium analysis. Questions should help uncover adjacent experience the user may not have thought to include.

**System prompt:**
```
You are a Career Interview Specialist. For each gap between the candidate's resume and the job requirements, generate 2-3 targeted questions that could uncover relevant experience the candidate has but didn't include on their resume.

Think laterally:
- If the gap is "Kubernetes", ask about Docker, containers, cloud infrastructure, deployment tools
- If the gap is "team leadership of 10+", ask about cross-functional teams, dotted-line reports, contractor management
- If the gap is "Python", ask about any scripting, automation, data analysis tools

Each question should be conversational and non-intimidating. The goal is to help the user realize they may have relevant experience.

Output JSON: {
  gap_questions: [
    {
      gap: string,
      severity: "critical"|"important"|"minor",
      questions: [string],
      hint: string — a brief note like "Even adjacent experience counts — Docker, ECS, cloud deployments"
    }
  ]
}
```

**Model:** Haiku  
**When:** Runs once after premium analysis, before acceptance UI  
**User answers** feed into the rewrite brief alongside accepted recommendations

---

## 11. User Highlights — Custom Inclusions

### Problem

The AI recommendations are based on gap analysis — what's missing or weak. But the user may also want to emphasize specific achievements, change how certain things are framed, or include items the AI didn't flag.

### UI Addition

Below the AI recommendations, add a freeform section:

```
┌──────────────────────────────────────────────┐
│  📝 Your Additions                            │
│                                               │
│  Anything else you want changed, emphasized,  │
│  or included in the rewrite?                  │
│                                               │
│  [ I want to emphasize my patent filing      │
│    from 2024. Also, my current title is      │
│    officially "Sr. Engineer" but I've been    │
│    functioning as tech lead for 6 months —   │
│    I want that reflected. Don't include the  │
│    freelance work from 2019.______________ ]  │
│                                               │
│  Add specific highlights:                     │
│  + [ Won company innovation award 2024___ ]  │
│  + [ Led migration from AWS to GCP_______ ]  │
│  + [________________________________ ] (+)    │
└──────────────────────────────────────────────┘
```

### How It Flows

User highlights are included in the rewrite brief as a separate `user_directives` field:

```json
{
  "user_highlights": [
    "Won company innovation award 2024",
    "Led migration from AWS to GCP"
  ],
  "user_notes": "Emphasize patent filing from 2024. Title is Sr. Engineer but functioning as tech lead for 6 months. Don't include freelance work from 2019.",
  "exclusions": ["freelance work 2019"]
}
```

The Resume Writer agent receives these alongside accepted recommendations and must honor them. The QA team's Accuracy Auditor verifies that user-provided highlights appear in the output and exclusions are respected.

---

## 12. LinkedIn Profile Validation

### Problem

The rewritten resume should be consistent with the user's LinkedIn profile. Discrepancies (different titles, dates, companies) create red flags for recruiters who cross-reference.

### Approach

The Chrome Extension already crawls LinkedIn profiles for connection data. Extend it to capture the user's own profile data (with consent):

1. **Profile crawl trigger** — when user initiates a rewrite, prompt: "Validate against your LinkedIn profile? This helps ensure consistency."
2. **Extension captures** — the user's own LI profile: titles, companies, dates, education, skills, headline, summary
3. **Stored in Supabase** — `linkedin_profiles` table, user-scoped, encrypted

### Agent: LinkedIn Alignment Checker

**Purpose:** Compare the rewritten resume against the user's LinkedIn profile and flag discrepancies.

**System prompt:**
```
You are a Profile Consistency Auditor. Compare the rewritten resume against the candidate's LinkedIn profile.

Flag ANY discrepancies:
1. Title differences (resume says "Director", LinkedIn says "Senior Manager")
2. Date mismatches (resume says "2021-2023", LinkedIn says "2020-2022")
3. Company name variations that could look inconsistent (not just abbreviations)
4. Missing roles — jobs on LinkedIn not on resume (may be intentional) or vice versa
5. Education differences
6. Skills on resume not reflected in LinkedIn skills section

For each discrepancy:
- field: "title" | "dates" | "company" | "role_missing" | "education" | "skills"
- resume_value: what the resume says
- linkedin_value: what LinkedIn says
- severity: "critical" (looks like dishonesty) | "warning" (inconsistent) | "note" (minor)
- recommendation: how to resolve (update resume, update LinkedIn, or both)

Output JSON: { discrepancies: [...], aligned: boolean, discrepancy_count: int }
```

**Model:** Haiku  
**When:** Runs as part of QA team (parallel with other auditors)  
**Requires:** User consent + Chrome Extension profile crawl

### Frontend Display

In the QA report, add a LinkedIn alignment section:

```
LinkedIn Alignment:
⚠ Title mismatch: Resume says "Engineering Manager",
  LinkedIn says "Senior Software Engineer"
  → Recommendation: Update LinkedIn to match or use
    consistent title on both

✓ Dates: All aligned
✓ Companies: All aligned
⚠ 1 role on LinkedIn not on resume (Freelance, 2019)
  → Note: This was excluded per your request
```

### Privacy & Data Handling

- Profile data is user-initiated only — never crawled without explicit action
- Stored encrypted in Supabase with RLS (user can only see their own)
- User can delete their LI profile data at any time
- Data is NOT sent to any third party — only used within the rewrite pipeline agents
- Chrome Extension already has LinkedIn access — this extends existing permissions

---

## 13. Feedback & Iteration System

### Problem

Resume rewriting is rarely perfect in one pass. Users need the ability to request revisions, and the system should help them understand whether another round is worth the credits.

### Feedback Flow

After receiving their rewrite:

```
┌──────────────────────────────────────────────┐
│  How did we do?                               │
│                                               │
│  Overall quality:                             │
│  [★ ★ ★ ★ ☆]  4/5                            │
│                                               │
│  Rate each area:                              │
│  Accuracy:     [★★★★★] 5/5                   │
│  Relevance:    [★★★★☆] 4/5                   │
│  Voice/tone:   [★★★☆☆] 3/5                   │
│  Formatting:   [★★★★☆] 4/5                   │
│                                               │
│  What would you change?                       │
│  [ The skills section feels too generic.     │
│    I want more emphasis on my AWS work.      │
│    The second bullet under Company B         │
│    sounds robotic.________________________ ] │
│                                               │
│  [Submit Feedback]                            │
└──────────────────────────────────────────────┘
```

### Improvement Prediction

After the user submits feedback, before they spend credits on a revision, show an honest assessment:

```
┌──────────────────────────────────────────────┐
│  📊 Revision Assessment                       │
│                                               │
│  Based on your feedback, a revision is        │
│  LIKELY to improve your resume.               │
│                                               │
│  Estimated improvement:                       │
│  • Voice/tone: +15-20% (your main concern)   │
│  • Skills section: specific refinements       │
│  • Overall score: ~78 → ~83 estimated        │
│                                               │
│  Confidence: HIGH — your feedback is specific │
│  and actionable.                              │
│                                               │
│  [Request Revision — X credits]               │
│  [I'm satisfied — done]                       │
└──────────────────────────────────────────────┘
```

If the feedback is vague ("it's not great") the prediction should say so:

```
│  Confidence: LOW — your feedback is general.  │
│  For better results, try pointing to specific │
│  bullets or sections that need work.          │
│                                               │
│  [Add specific feedback]                      │
│  [Request Revision anyway — X credits]        │
```

### Agent: Revision Assessor

**Purpose:** Evaluate user feedback and predict whether a revision will meaningfully improve the output.

**System prompt:**
```
You are a Revision Advisor. You receive:
1. The current rewritten resume
2. The user's star ratings (overall, accuracy, relevance, voice, formatting)
3. The user's qualitative feedback

Assess:
- Is the feedback specific enough to act on? (specific bullet references, section names, concrete changes)
- What dimensions would improve most from a revision?
- Estimated score improvement (based on gap between current and what feedback implies)
- Is another round likely to be worth the cost?

Be honest. If the resume is already strong and feedback is minor, say so. If the feedback suggests fundamental issues, say that too.

Output JSON: {
  revision_recommended: boolean,
  confidence: "high" | "medium" | "low",
  confidence_reason: string,
  estimated_improvements: [{ area: string, current_rating: int, estimated_after: int }],
  estimated_score_change: string,
  feedback_quality: "specific" | "moderate" | "vague",
  suggestion_to_user: string — if feedback is vague, suggest how to make it more actionable
}
```

**Model:** Haiku  
**When:** After user submits feedback, before they commit credits to a revision

### Revision Round

If the user requests a revision:
- Same rewrite pipeline runs again
- BUT the rewrite brief includes: previous output + user feedback + star ratings
- Resume Writer agent receives explicit instruction: "The user rated voice/tone 3/5 and said: [feedback]. Focus revisions on these areas."
- QA team runs again on the revision
- Each revision round costs credits (less than initial rewrite)
- History of all rounds is stored for the user to compare

### Data Model

```sql
-- Rewrite sessions
CREATE TABLE rewrite_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users,
  resume_id text NOT NULL,              -- links to user's resume
  filter_name text,
  template_id text NOT NULL,
  include_cover_letter boolean DEFAULT false,
  status text DEFAULT 'pending',         -- pending, processing, complete, failed
  created_at timestamptz DEFAULT now()
);

-- Rewrite rounds (each revision is a new round)
CREATE TABLE rewrite_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES rewrite_sessions,
  round_number int NOT NULL DEFAULT 1,
  
  -- Input
  accepted_recommendations jsonb,
  user_highlights jsonb,
  user_notes text,
  gap_interview_answers jsonb,
  previous_feedback jsonb,               -- null for round 1
  
  -- Output
  resume_url text,
  cover_letter_url text,
  qa_report jsonb,
  linkedin_alignment jsonb,
  changes_summary jsonb,
  
  -- Feedback
  rating_overall int CHECK (rating_overall BETWEEN 1 AND 5),
  rating_accuracy int CHECK (rating_accuracy BETWEEN 1 AND 5),
  rating_relevance int CHECK (rating_relevance BETWEEN 1 AND 5),
  rating_voice int CHECK (rating_voice BETWEEN 1 AND 5),
  rating_formatting int CHECK (rating_formatting BETWEEN 1 AND 5),
  feedback_text text,
  revision_assessment jsonb,             -- from Revision Assessor agent
  
  -- Meta
  agents_used int,
  timing_ms int,
  credits_consumed int,
  created_at timestamptz DEFAULT now()
);
```

---

## 14. Updated Pipeline — Full Flow

```
PREMIUM ANALYSIS (existing)
      │
      ▼
GAP INTERVIEW (new — Agent: Gap Interviewer)
  User answers questions about gaps
      │
      ▼
ACCEPTANCE UI (updated)
  + Accept/reject recommendations
  + User highlights & notes
  + Achievement prompt answers
  + Gap interview answers feed in
  + Cover letter opt-in
  + Template selection
  + LI validation opt-in
      │
      ▼
REWRITE TEAM
  Agent: Resume Writer (Sonnet)
  Agent: Cover Letter Writer (Sonnet, conditional)
      │
      ▼
QA TEAM (parallel)
  Agent: Accuracy Auditor (Haiku)
  Agent: Bleed Detector (Haiku)
  Agent: Voice & Polish Auditor (Sonnet)
  Agent: LinkedIn Alignment Checker (Haiku, conditional)
      │
      ▼
DOCUMENT GENERATION
  .docx from selected template
      │
      ▼
USER REVIEW + FEEDBACK
  Star ratings + qualitative feedback
      │
      ▼
REVISION ASSESSMENT (Agent: Revision Assessor)
  "Is another round worth it?"
      │
      ├── Yes → REWRITE TEAM again (with feedback context)
      │
      └── No / User satisfied → Done
```

### Updated Agent Count

| # | Agent | Model | Purpose | Stage |
|---|-------|-------|---------|-------|
| 1 | Gap Interviewer | Haiku | Generate gap-closing questions | Pre-rewrite |
| 2 | Resume Writer | Sonnet | Rewrite accepted sections | Rewrite |
| 3 | Cover Letter Writer | Sonnet | Tailored cover letter | Rewrite |
| 4 | Accuracy Auditor | Haiku | Flag fabrication | QA |
| 5 | Bleed Detector | Haiku | Flag cross-job contamination | QA |
| 6 | Voice & Polish Auditor | Sonnet | Strip AI-speak, fix punctuation | QA |
| 7 | LinkedIn Alignment Checker | Haiku | Cross-reference with LI profile | QA |
| 8 | Revision Assessor | Haiku | Predict revision value | Feedback |

**Total: 8 agents per rewrite** (6 if no cover letter and no LI validation).

Combined with premium analysis (4 agents), a full analyze → rewrite → revise cycle is **12+ agents across 3 Edge Functions**.

---

## 16. Output Integration — Resumes & Cover Letters Back Into the System

### Problem

A rewrite produces a polished .docx, but it's disconnected from the rest of the platform. The user has to manually download, re-upload, and re-assign. That's friction that kills the value loop.

### Design

When a rewrite completes, the output automatically integrates back into Brilliant Jobs:

**Resume:**
- Auto-added to the user's resume library (same as a manual upload)
- Auto-assigned to the same saved filter(s) that the analysis was run against
- Named: `{original_name} — {filter_name} v{round}` (e.g., "Marston Resume — Growth Marketing v2")
- Level label inherited from the original resume
- Previous version is NOT archived — user keeps both and can compare performance
- The new resume's `source` field = `'rewrite'` (vs. `'upload'` or `'gdrive'`)
- Links back to `rewrite_rounds.id` so the user can trace lineage

**Cover Letter:**
- Saved to a new **Cover Letters** section within the Resumes page (or a dedicated tab)
- Auto-associated with the same filter
- Named: `Cover Letter — {filter_name} — {company/role if single JD}` 
- Stored in Supabase Storage under `rewrites/{session_id}/cover-letter.docx`
- Also stored as structured text (paragraphs) in the database for quick preview without download
- Downloadable as .docx at any time

### Data Flow

```
Rewrite Complete
      │
      ├── Resume .docx
      │     │
      │     ├── Upload to Supabase Storage: rewrites/{session_id}/resume.docx
      │     ├── Create entry in resumes[] array (localStorage + cloud sync)
      │     │     - id: 'res_rw_{session_id}_{round}'
      │     │     - name: '{original} — {filter} v{round}'
      │     │     - source: 'rewrite'
      │     │     - rewrite_session_id: session_id
      │     │     - rewrite_round: round_number
      │     │     - filterIds: [filter_name]  ← auto-assigned
      │     │     - levelLabel: inherited from original
      │     │     - extractedText: cleaned text from QA pass
      │     │     - keywords: auto-extracted on save
      │     │     - textStatus: 'ready'
      │     │
      │     └── File blob stored in IndexedDB (for offline download)
      │
      └── Cover Letter .docx (if opted in)
            │
            ├── Upload to Supabase Storage: rewrites/{session_id}/cover-letter.docx
            └── Create entry in cover_letters table
                  - id: uuid
                  - user_id: auth user
                  - session_id: rewrite session
                  - round_number: int
                  - filter_name: string
                  - target_company: string (if single-JD mode)
                  - target_role: string (if single-JD mode)
                  - paragraphs: jsonb (structured text for preview)
                  - storage_path: text
                  - created_at: timestamptz
```

### Cover Letters Table

```sql
CREATE TABLE cover_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users ON DELETE CASCADE,
  session_id uuid REFERENCES rewrite_sessions,
  round_number int NOT NULL DEFAULT 1,
  filter_name text,
  target_company text,
  target_role text,
  paragraphs jsonb NOT NULL,           -- [{text: "...", type: "opening|body|closing"}]
  salutation text,
  closing text,
  word_count int,
  storage_path text NOT NULL,          -- path in Supabase Storage
  created_at timestamptz DEFAULT now()
);

ALTER TABLE cover_letters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_cover_letters" ON cover_letters
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "service_manage_cover_letters" ON cover_letters
  FOR ALL USING (true);

CREATE INDEX idx_cover_letters_user ON cover_letters (user_id, created_at DESC);
CREATE INDEX idx_cover_letters_filter ON cover_letters (user_id, filter_name);
```

### Frontend — Resume Card After Rewrite

The auto-created resume card shows its lineage:

```
┌─────────────────────────────────────────────┐
│  📄 Marston Resume — Growth Marketing v2     │
│  Rewrite · Feb 22, 2026 · 42 KB             │
│                                              │
│  Source: ✨ AI Rewrite (Round 2)              │
│  Based on: Marston Resume (original)         │
│  Filter: Growth Marketing                    │
│  QA: ✓ Clean                                │
│                                              │
│  [Download]  [View Changes]  [Rename]        │
│                                              │
│  Performance:  3 applied · 2 responded · 67% │
└─────────────────────────────────────────────┘
```

The "View Changes" link opens a diff view comparing the rewrite to the original — showing what was modified across rounds.

### Frontend — Cover Letter Archive

New tab or section on the Resumes page:

```
┌─────────────────────────────────────────────┐
│  Cover Letters (3)                           │
│                                              │
│  📄 Growth Marketing — General               │
│     Feb 22, 2026 · 320 words                │
│     [Preview]  [Download]  [Delete]          │
│                                              │
│  📄 Growth Marketing — Acme Corp, Sr. PM     │
│     Feb 21, 2026 · 285 words                │
│     [Preview]  [Download]  [Delete]          │
│                                              │
│  📄 Data Science — General                   │
│     Feb 20, 2026 · 310 words                │
│     [Preview]  [Download]  [Delete]          │
└─────────────────────────────────────────────┘
```

"Preview" expands inline to show the cover letter text without downloading. The structured `paragraphs` field enables this without fetching the .docx.

### Tier Provenance Tracking

Every resume and cover letter created or modified through the system carries a `tier_history` that shows exactly which service level was used at each stage. This is visible to the user and persists across revisions.

**Resume entry fields (added):**
```javascript
{
  // ... existing fields ...
  source: 'rewrite',                  // 'upload' | 'gdrive' | 'rewrite'
  analysis_tier: 'premium',           // 'basic' | 'premium' | null (for uploads)
  rewrite_tier: 'premium',            // 'basic' | 'premium' | null
  tier_history: [                     // Full audit trail
    { action: 'analyzed', tier: 'basic', timestamp: '2026-02-20T...' },
    { action: 'analyzed', tier: 'premium', timestamp: '2026-02-22T...' },
    { action: 'rewritten', tier: 'premium', round: 1, timestamp: '2026-02-22T...' },
    { action: 'revised', tier: 'premium', round: 2, timestamp: '2026-02-22T...' }
  ]
}
```

**Cover letter table (added column):**
```sql
ALTER TABLE cover_letters ADD COLUMN tier text NOT NULL DEFAULT 'premium'
  CHECK (tier IN ('basic', 'premium'));
ALTER TABLE cover_letters ADD COLUMN analysis_tier text
  CHECK (analysis_tier IN ('basic', 'premium'));
```

**Frontend display — Resume card badge:**
```
📄 Marston Resume — Growth Marketing v2
Rewrite · Feb 22, 2026 · 42 KB

[✨ Premium]  Analysis + Rewrite + QA (Round 2)
```

vs.

```
📄 Marston Resume — Growth Marketing v1
Rewrite · Feb 20, 2026 · 38 KB

[AI] Basic  Analysis + Rewrite
```

**Badge logic:**
| Analysis Tier | Rewrite Tier | Badge |
|--------------|-------------|-------|
| basic | — (no rewrite) | `[AI] Basic Analysis` |
| premium | — (no rewrite) | `[✨ Premium] Analysis` |
| basic | basic | `[AI] Basic Analysis + Rewrite` |
| basic | premium | `[✨ Premium] Rewrite` (upgraded) |
| premium | premium | `[✨ Premium] Full Pipeline` |
| — (upload) | — | No badge |

**Cover letter archive badge:**
```
📄 Growth Marketing — Acme Corp
Feb 22, 2026 · 320 words · [✨ Premium]
```

The tier badge also appears in the apply flow when selecting a resume, so the user knows which quality level backs each version. Hovering or tapping the badge shows the full tier history timeline.

Because rewritten resumes are full resume entries in the system, they automatically get tracked by the existing pipeline performance system:

- Jobs applied with this resume version
- Response rate
- Interview conversion

This creates a natural A/B comparison: original resume performance vs. rewrite v1 vs. rewrite v2. The user can see which version is actually getting results.

### Apply Flow Integration

When the user applies to a job (manual, notification, or auto-apply), the system already selects the best resume by filter assignment. Rewritten resumes will naturally be selected since they're assigned to the correct filter. If the user has a cover letter for the same filter, the apply flow can offer: "Include your cover letter for {filter}?"

---

## 17. Implementation Order (Final)

1. **Spec review** (this doc) → align on UX
2. **Gap Interview agent + UI** — question generation and answer collection
3. **Acceptance UI** — toggleable cards + user highlights + achievement inputs
4. **Template configs** — 3 templates + thumbnails
5. **`rewrite-resume` Edge Function** — rewrite team agents
6. **QA team agents** — accuracy, bleed, voice
7. **Document generation** — docx-js templates
8. **Supabase Storage** — `rewrites` bucket
9. **Output integration** — auto-add resume to library, auto-assign filter, cover letter archive
10. **`cover_letters` table + RLS** — database for cover letter storage and preview
11. **Cover letter UI** — archive tab with preview/download
12. **LinkedIn profile capture** — extend Chrome Extension
13. **LinkedIn Alignment Checker agent**
14. **Feedback UI** — star ratings + qualitative input
15. **Revision Assessor agent** — improvement prediction
16. **Revision loop** — re-run pipeline with feedback context, create new resume version
17. **Data model** — `rewrite_sessions`, `rewrite_rounds` tables
18. **Entitlement features** — `resume_rewrite`, `resume_rewrite_cover`, `resume_rewrite_revision`
19. **End-to-end testing**
20. **Deploy + version bump**
