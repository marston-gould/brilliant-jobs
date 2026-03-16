// classify-pipeline-signal Edge Function — FB-PI-001 S2
// Reads pending items from pipeline_signal_inbox, classifies them using
// Claude Sonnet with structured output, writes results back to pipeline_signals.
//
// Called by: pg_cron every 15 minutes (classify-pipeline-signals cron)
// Auth: service role (internal cron, not user-facing)
//
// HOOK H-PI-02: SignalClassifier interface — swap Anthropic for fine-tuned/local model here.
// SCAR S-PI-06: Classification result + user feedback stored for future ML training dataset.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { withAnthropicBreaker } from "../_shared/anthropic.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Spec §5.1: batch 10 per cron invocation
const BATCH_SIZE = 10;
// Spec §5.1: max 50 classifications/minute → 10 per 15min cycle is well within limit
// CRON-COST-OPT §4.2: Haiku is the ONLY permitted model. Sonnet costs 90% more.
const HAIKU_MODEL = "claude-haiku-4-5-20251001";
// Confidence thresholds (spec §3.3)
const CONFIDENCE_HIGH = 0.85;
const CONFIDENCE_MEDIUM = 0.50;

// ── System prompt (cached via ephemeral cache_control) ─────────────────────
// HOOK H-PI-02: this prompt is the classifier "model". A fine-tuned model would
// replace this prompt while keeping the same interface.
const CLASSIFIER_SYSTEM_PROMPT = `You are an expert job application signal classifier for a job search tracking platform.

Your task: Given a raw email or calendar event, classify it as one of 8 signal types and extract structured data.

## Signal Types

ACK — Application Acknowledged
- Email confirms receipt of an application
- Examples: "Thank you for applying", "We received your application", "Your application has been submitted", ATS confirmation emails
- Confidence: Medium (0.55–0.75). These are often automated.
- Pipeline transition: Applied → Applied (confirm only, no stage change needed)

REJ-PRE — Pre-Interview Rejection
- Rejected before any interview took place
- Examples: "Unfortunately, we will not be moving forward", "After careful review we have decided to pursue other candidates", "The position has been filled"
- Confidence: Medium-High (0.65–0.90). Watch for polite but clear rejection language.
- Pipeline transition: Applied/Responded → Rejected

INT — Interview Invitation
- An invitation to interview or schedule an interview
- Examples: "We'd like to schedule an interview", "Please select a time on my Calendly", "Next steps in the process", "Would you be available for a phone screen?", links to GoodTime/Calendly/Calendly-style scheduling tools
- Confidence: High (0.80–0.95). Interview invites are usually unambiguous.
- Pipeline transition: Applied/Responded → Interview

REJ-POST — Post-Interview Rejection  
- Rejected after one or more interviews
- Key signal: mentions "your interview", "after speaking with you", "after our conversation", "the team really enjoyed meeting you but..."
- Examples: "After your interview, we've decided to move forward with other candidates", "Thank you for taking the time to meet with our team"
- Confidence: Medium-High (0.70–0.90).
- Pipeline transition: Interview → Rejected

OFFER — Job Offer
- An actual job offer is being extended
- Examples: "We are pleased to offer you", "Offer of employment", "Compensation package", attached offer letter or DocuSign, "We'd like to extend an offer"
- Confidence: High (0.85–0.95). Offers are usually explicit.
- Pipeline transition: Interview → Offer

RESCHED — Reschedule Request
- An existing interview is being rescheduled or cancelled + rescheduled
- Examples: "I need to reschedule our interview", "Can we move our meeting?", "A conflict has come up", calendar cancellation followed by new invite
- Confidence: Medium (0.60–0.80).
- Pipeline transition: Interview → Interview (no stage change, but signal logged)

CAL-INT — Calendar Interview Invite (calendar source only)
- A calendar event from an external domain with interview-related keywords
- Look for: external organizer domain (not Gmail/personal), Zoom/Teams/Meet link, keywords like "interview", "phone screen", "technical", "meet the team", "panel"
- Confidence: High if keywords + video link present (0.80–0.90). Medium if only keywords (0.55–0.75).
- Pipeline transition: Applied/Responded → Interview

CAL-OFFER — Calendar Offer Meeting (calendar source only)
- A calendar event suggesting an offer discussion
- Keywords: "offer review", "offer discussion", "compensation", "welcome call", "onboarding"
- Confidence: Always LOW (0.30–0.49) — offer meetings are ambiguous and consequential. NEVER auto-move.
- Pipeline transition: Interview → Offer (prompt user to confirm)

NONE — Not a job application signal
- Use when the email/event is clearly not related to a job application (newsletters, spam, personal calendar events, unrelated work emails)
- Confidence: 0.95 (very certain it's noise)

## Extraction Rules

Always extract (if present):
- company: The hiring company name (NOT the recruiter agency name unless that's what user applied to)
- role: Job title being applied for (extract from subject/body, clean up if needed)
- date: Any mentioned interview date/time in ISO 8601 format

Extract when relevant to signal type:
- interviewer_names: Array of names of people user will meet (for INT/CAL-INT signals)
- format: "phone", "video", "onsite", "technical", "panel" (for interview signals)
- scheduling_link: Calendly/GoodTime/scheduling URL if present (for INT signals)
- salary_range: Any salary/comp numbers mentioned (for OFFER signals)
- rejection_stage: "pre_interview" or "post_interview" (for REJ-* signals)

## Output Format

Respond with ONLY valid JSON, no markdown, no explanation:
{
  "signal_type": "ACK|REJ-PRE|INT|REJ-POST|OFFER|RESCHED|CAL-INT|CAL-OFFER|NONE",
  "confidence": 0.00,
  "extracted_fields": {
    "company": "string or null",
    "role": "string or null",
    "date": "ISO 8601 string or null",
    "interviewer_names": ["string"] or [],
    "format": "string or null",
    "scheduling_link": "string or null",
    "salary_range": "string or null",
    "rejection_stage": "pre_interview|post_interview|null"
  },
  "reasoning": "One sentence explaining classification decision"
}

## Few-Shot Examples

### Example 1 — ACK (gmail)
Subject: Your application to Stripe has been received
From: recruiting@stripe.com
Snippet: Thank you for applying to the Software Engineer position at Stripe. We have received your application and will be in touch if your qualifications match our requirements.

Output:
{"signal_type":"ACK","confidence":0.82,"extracted_fields":{"company":"Stripe","role":"Software Engineer","date":null,"interviewer_names":[],"format":null,"scheduling_link":null,"salary_range":null,"rejection_stage":null},"reasoning":"Standard ATS application confirmation email from recruiting@stripe.com with clear receipt language."}

### Example 2 — INT (gmail)
Subject: Interview Invitation - Senior Engineer at Anthropic
From: talent@anthropic.com
Snippet: Hi! I'd love to schedule a 30-minute call to discuss the Senior Engineer role. Please book a time here: https://calendly.com/anthropic-talent/30min

Output:
{"signal_type":"INT","confidence":0.94,"extracted_fields":{"company":"Anthropic","role":"Senior Engineer","date":null,"interviewer_names":[],"format":"phone","scheduling_link":"https://calendly.com/anthropic-talent/30min","salary_range":null,"rejection_stage":null},"reasoning":"Clear interview invitation with Calendly scheduling link from talent@anthropic.com for named Senior Engineer role."}

### Example 3 — REJ-PRE (gmail)
Subject: Update on your application - Product Manager
From: noreply@lever.co
Snippet: After careful consideration, we have decided to move forward with other candidates whose experience more closely aligns with our current needs. We appreciate your interest in the Product Manager position.

Output:
{"signal_type":"REJ-PRE","confidence":0.89,"extracted_fields":{"company":null,"role":"Product Manager","date":null,"interviewer_names":[],"format":null,"scheduling_link":null,"salary_range":null,"rejection_stage":"pre_interview"},"reasoning":"Standard pre-interview rejection with 'move forward with other candidates' language; no interview was mentioned."}

### Example 4 — OFFER (gmail)
Subject: Offer of Employment - Staff Engineer
From: hr@openai.com
Snippet: We are excited to extend an offer of employment for the Staff Engineer position. Your compensation package includes a base salary of $280,000 and equity. Please review the attached offer letter.

Output:
{"signal_type":"OFFER","confidence":0.97,"extracted_fields":{"company":"OpenAI","role":"Staff Engineer","date":null,"interviewer_names":[],"format":null,"scheduling_link":null,"salary_range":"$280,000 base + equity","rejection_stage":null},"reasoning":"Explicit offer of employment with compensation details from hr@openai.com."}

### Example 5 — CAL-INT (calendar)
Title: Technical Interview - Backend Engineer - Figma
Organizer: jsmith@figma.com
Description: Hi! Looking forward to our technical discussion. Join via Zoom: https://zoom.us/j/123456

Output:
{"signal_type":"CAL-INT","confidence":0.92,"extracted_fields":{"company":"Figma","role":"Backend Engineer","date":null,"interviewer_names":["jsmith"],"format":"video","scheduling_link":"https://zoom.us/j/123456","salary_range":null,"rejection_stage":null},"reasoning":"Calendar event from figma.com domain with 'Technical Interview' in title and Zoom video link — high confidence interview invite."}

### Example 6 — NONE (gmail)
Subject: Your GitHub Actions workflow failed
From: notifications@github.com
Snippet: The workflow 'Deploy to production' in repository my-project failed on the main branch.

Output:
{"signal_type":"NONE","confidence":0.97,"extracted_fields":{"company":null,"role":null,"date":null,"interviewer_names":[],"format":null,"scheduling_link":null,"salary_range":null,"rejection_stage":null},"reasoning":"GitHub Actions notification unrelated to job applications."}`;

// ── PostHog capture (fire-and-forget) ─────────────────────────────────────
const POSTHOG_HOST = Deno.env.get("POSTHOG_HOST") || "https://us.i.posthog.com";
const POSTHOG_KEY = Deno.env.get("POSTHOG_KEY") || "";

function capturePostHog(event: string, props: Record<string, unknown>): void {
  if (!POSTHOG_KEY) return;
  fetch(`${POSTHOG_HOST}/capture/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: POSTHOG_KEY, event, distinct_id: "system", properties: props }),
  }).catch(() => {});
}

// ── Anthropic classification ───────────────────────────────────────────────
interface ClassificationResult {
  signal_type: string;
  confidence: number;
  extracted_fields: {
    company: string | null;
    role: string | null;
    date: string | null;
    interviewer_names: string[];
    format: string | null;
    scheduling_link: string | null;
    salary_range: string | null;
    rejection_stage: string | null;
  };
  reasoning: string;
}

const VALID_SIGNAL_TYPES = new Set([
  "ACK", "REJ-PRE", "INT", "REJ-POST", "OFFER", "RESCHED",
  "CAL-INT", "CAL-OFFER", "NONE",
]);

function confidenceToLevel(score: number): "high" | "medium" | "low" {
  if (score >= CONFIDENCE_HIGH) return "high";
  if (score >= CONFIDENCE_MEDIUM) return "medium";
  return "low";
}

async function classifySignal(
  source: string,
  rawSubject: string | null,
  rawSnippet: string | null,
  rawFrom: string | null,
  rawDate: string | null,
  rawMetadata: Record<string, unknown>,
): Promise<ClassificationResult | null> {
  // Build user message from raw signal data
  const parts: string[] = [];

  if (source === "calendar") {
    parts.push(`Source: Calendar Event`);
    if (rawSubject) parts.push(`Title: ${rawSubject}`);
    if (rawFrom) parts.push(`Organizer: ${rawFrom}`);
    if (rawDate) parts.push(`Date: ${rawDate}`);
    if (rawSnippet) parts.push(`Description: ${rawSnippet}`);
    const attendees = rawMetadata.attendees as string[] | undefined;
    if (attendees?.length) parts.push(`Attendees: ${attendees.slice(0, 5).join(", ")}`);
    const videoLink = rawMetadata.video_link as string | undefined;
    if (videoLink) parts.push(`Video Link: ${videoLink}`);
  } else {
    // gmail
    parts.push(`Source: Email`);
    if (rawFrom) parts.push(`From: ${rawFrom}`);
    if (rawSubject) parts.push(`Subject: ${rawSubject}`);
    if (rawDate) parts.push(`Date: ${rawDate}`);
    if (rawSnippet) parts.push(`Snippet: ${rawSnippet}`);
  }

  const userMessage = parts.join("\n");

  // BP-001: Circuit breaker wraps Anthropic classification call
  const breakerResult = await withAnthropicBreaker(sb, 'classify-pipeline-signal', async () => {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "prompt-caching-2024-07-31",
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: 400,
        system: [
          {
            type: "text",
            text: CLASSIFIER_SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [
          { role: "user", content: userMessage },
        ],
      }),
    });
    if (!r.ok) {
      const errText = await r.text();
      throw new Error(`Anthropic API ${r.status}: ${errText.slice(0, 200)}`);
    }
    return r;
  });

  if (breakerResult.circuitOpen) {
    throw new Error("Circuit breaker open — Anthropic API temporarily unavailable");
  }
  if (!breakerResult.result) {
    throw new Error(breakerResult.error || "Anthropic call failed");
  }

  const res = breakerResult.result;

  const data = await res.json();
  const rawText = (data.content || [])
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("") || "";

  // Strip any markdown fences (defensive)
  const clean = rawText.replace(/```json\n?|```\n?/g, "").trim();

  let parsed: ClassificationResult;
  try {
    parsed = JSON.parse(clean) as ClassificationResult;
  } catch {
    throw new Error(`JSON parse failed: ${clean.slice(0, 200)}`);
  }

  // Validate required fields
  if (!parsed.signal_type || !VALID_SIGNAL_TYPES.has(parsed.signal_type)) {
    throw new Error(`Invalid signal_type: ${parsed.signal_type}`);
  }
  if (typeof parsed.confidence !== "number" || parsed.confidence < 0 || parsed.confidence > 1) {
    throw new Error(`Invalid confidence: ${parsed.confidence}`);
  }

  // Normalise extracted_fields (ensure arrays are arrays)
  parsed.extracted_fields = parsed.extracted_fields || {};
  if (!Array.isArray(parsed.extracted_fields.interviewer_names)) {
    parsed.extracted_fields.interviewer_names = [];
  }

  // Log cache hit rate for cost monitoring
  const usage = data.usage || {};
  const cacheHits = usage.cache_read_input_tokens || 0;
  const totalInput = usage.input_tokens || 0;
  if (cacheHits > 0) {
    capturePostHog("classifier_cache_hit", {
      cache_read_tokens: cacheHits,
      total_input_tokens: totalInput,
      hit_rate: cacheHits / Math.max(totalInput, 1),
    });
  }

  return parsed;
}

// ── Write classified signal to pipeline_signals ────────────────────────────
interface InboxRow {
  id: string;
  user_id: string;
  source: string;
  source_message_id: string;
  raw_subject: string | null;
  raw_snippet: string | null;
  raw_from: string | null;
  raw_date: string | null;
  raw_metadata: Record<string, unknown>;
  retry_count: number;
}

async function processInboxItem(
  item: InboxRow,
): Promise<{ success: boolean; signal_type?: string; confidence?: number; action?: string }> {
  let result: ClassificationResult | null = null;

  try {
    result = await classifySignal(
      item.source,
      item.raw_subject,
      item.raw_snippet,
      item.raw_from,
      item.raw_date,
      item.raw_metadata,
    );
  } catch (e) {
    // Classification failed — mark as error, increment retry
    const newRetry = item.retry_count + 1;
    await sb.from("pipeline_signal_inbox").update({
      classification_status: newRetry >= 3 ? "error" : "pending",
      retry_count: newRetry,
    }).eq("id", item.id);

    capturePostHog("classifier_error", {
      inbox_id: item.id,
      source: item.source,
      error: (e as Error).message,
      retry_count: newRetry,
    });

    return { success: false };
  }

  // NONE signal — mark skipped, don't create pipeline_signal
  if (result.signal_type === "NONE") {
    await sb.from("pipeline_signal_inbox").update({
      classification_status: "skipped",
      classified_at: new Date().toISOString(),
    }).eq("id", item.id);
    return { success: true, signal_type: "NONE", confidence: result.confidence, action: "skipped" };
  }

  const confidenceLevel = confidenceToLevel(result.confidence);

  // Insert into pipeline_signals
  const { error: insertError } = await sb.from("pipeline_signals").insert({
    user_id: item.user_id,
    signal_source: item.source,  // existing column
    inbox_id: item.id,           // new column (S1)
    signal_type: result.signal_type,  // new column (S1)
    confidence_score: result.confidence,  // new column (S1)
    confidence_level: confidenceLevel,    // new column (S1)
    extracted_fields: result.extracted_fields,  // new column (S1)
    evidence_preview: buildEvidencePreview(item, result),
    evidence_metadata: {
      source_message_id: item.source_message_id,
      raw_from: item.raw_from,
      raw_date: item.raw_date,
      reasoning: result.reasoning,
      source_metadata: item.raw_metadata,
    },
    // action_taken set by process-pipeline-action (S3) — not set here
    status: "pending_confirmation",  // will be updated by process-pipeline-action
    proposed_stage: signalTypeToStage(result.signal_type),
  });

  if (insertError) {
    // If duplicate (signal already exists for this inbox_id), still mark classified
    if (!insertError.message.includes("duplicate")) {
      await sb.from("pipeline_signal_inbox").update({
        classification_status: "error",
        retry_count: item.retry_count + 1,
      }).eq("id", item.id);
      return { success: false };
    }
  }

  // Mark inbox item as classified
  await sb.from("pipeline_signal_inbox").update({
    classification_status: "classified",
    classified_at: new Date().toISOString(),
  }).eq("id", item.id);

  capturePostHog("pipeline_signal_classified", {
    signal_type: result.signal_type,
    confidence: result.confidence,
    confidence_level: confidenceLevel,
    source: item.source,
    has_company: !!result.extracted_fields.company,
    has_role: !!result.extracted_fields.role,
    has_date: !!result.extracted_fields.date,
  });

  return {
    success: true,
    signal_type: result.signal_type,
    confidence: result.confidence,
    action: "classified",
  };
}

// ── Helper: evidence preview for signal card UI ────────────────────────────
function buildEvidencePreview(item: InboxRow, result: ClassificationResult): string {
  const company = result.extracted_fields.company;
  const role = result.extracted_fields.role;

  if (item.source === "calendar") {
    if (company && role) return `Calendar: ${result.signal_type} from ${company} for ${role}`;
    if (company) return `Calendar event from ${company}`;
    return item.raw_subject?.slice(0, 120) || "Calendar event";
  }

  // gmail
  if (item.raw_snippet) return item.raw_snippet.slice(0, 150);
  if (company && role) return `Email from ${company} re: ${role}`;
  return item.raw_subject?.slice(0, 120) || "Email signal";
}

// ── Helper: signal type → proposed pipeline stage ─────────────────────────
function signalTypeToStage(signalType: string): string {
  const stageMap: Record<string, string> = {
    "ACK":       "applied",
    "REJ-PRE":   "rejected",
    "INT":       "interview",
    "REJ-POST":  "rejected",
    "OFFER":     "offer",
    "RESCHED":   "interview",
    "CAL-INT":   "interview",
    "CAL-OFFER": "offer",
  };
  return stageMap[signalType] || "applied";
}

// ── Main handler ───────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  // Service role auth — this EF is internal cron only
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "");
  if (!token || token !== SUPABASE_SERVICE_ROLE_KEY) {
    // Also accept requests from pg_net (no auth header in some setups)
    const isInternalCron = req.headers.get("x-supabase-internal") === "true" || !authHeader;
    if (!isInternalCron) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // Check ANTHROPIC_API_KEY is configured
  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({
      error: "ANTHROPIC_API_KEY not configured",
      message: "Add ANTHROPIC_API_KEY to Supabase Vault to enable signal classification",
    }), { status: 503, headers: { "Content-Type": "application/json" } });
  }

  const startTime = Date.now();
  let classified = 0, skipped = 0, errors = 0;
  const results: Array<{ signal_type?: string; confidence?: number; action?: string }> = [];

  try {
    // Fetch up to BATCH_SIZE pending inbox items (spec §5.1: 10 per cron invocation)
    const { data: items, error: fetchError } = await sb
      .from("pipeline_signal_inbox")
      .select("id, user_id, source, source_message_id, raw_subject, raw_snippet, raw_from, raw_date, raw_metadata, retry_count")
      .eq("classification_status", "pending")
      .lt("retry_count", 3)
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchError) throw fetchError;

    if (!items?.length) {
      return new Response(JSON.stringify({
        message: "No pending items",
        stats: { classified: 0, skipped: 0, errors: 0, elapsed_ms: Date.now() - startTime },
      }), { headers: { "Content-Type": "application/json" } });
    }

    console.log(`[classify-pipeline-signal] Processing ${items.length} inbox items`);

    for (const item of items as InboxRow[]) {
      try {
        const result = await processInboxItem(item);
        if (result.success) {
          if (result.action === "skipped") skipped++;
          else classified++;
        } else {
          errors++;
        }
        results.push({ signal_type: result.signal_type, confidence: result.confidence, action: result.action });
      } catch (e) {
        console.error(`[classify-pipeline-signal] Item ${item.id} failed:`, (e as Error).message);
        errors++;
      }
    }

    const stats = {
      items_processed: items.length,
      classified,
      skipped,
      errors,
      elapsed_ms: Date.now() - startTime,
    };

    console.log("[classify-pipeline-signal] Complete", stats);

    capturePostHog("classifier_batch_complete", stats);

    return new Response(JSON.stringify({ message: "Classification complete", stats, results }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("[classify-pipeline-signal] Fatal:", (e as Error).message);
    capturePostHog("classifier_fatal_error", { error: (e as Error).message });
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
