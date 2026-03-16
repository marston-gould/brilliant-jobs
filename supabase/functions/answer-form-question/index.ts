// supabase/functions/answer-form-question/index.ts
// Edge Function: AI-powered form question answering via Claude Haiku
// v1.0 — February 27, 2026
//
// When ATS form handlers encounter custom questions that the label map
// can't match (e.g. "Describe your experience with distributed systems"),
// this EF generates contextual answers using the user's resume and profile.
//
// Rate limited: 50 AI answers per user per day (shared with score-resume)
// Cost: ~$0.001 per question (Haiku, ~300 tokens avg)
//
// Deploy: supabase functions deploy answer-form-question --no-verify-jwt --project-ref qojhagupdnbtomfoxnsf

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { withAnthropicBreaker } from "../_shared/anthropic.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

const HAIKU_MODEL = "claude-haiku-4-5-20251001";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://brilliantjobs.app",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DAILY_LIMIT = 50;

// AIS-F4-S1: Credit model — 0.5 credits per new answer, cached = free
const CREDITS_PER_ANSWER = 0.5;
const ANSWER_CACHE_DAYS = 7; // Answers within 7 days on same field_label are cached

// ═══════════════════════════════════════════════════════════
// AIS-F4-S1: DB ANSWER CACHE
// ═══════════════════════════════════════════════════════════

/** Look up cached answers for a user from the answers table (within ANSWER_CACHE_DAYS). */
async function loadAnswerCache(
  sb: ReturnType<typeof createClient>,
  userId: string,
  fieldLabels: string[]
): Promise<Map<string, string>> {
  const cache = new Map<string, string>();
  if (!fieldLabels.length) return cache;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - ANSWER_CACHE_DAYS);

  const { data, error } = await sb
    .from("answers")
    .select("field_label, generated_answer")
    .eq("user_id", userId)
    .in("field_label", fieldLabels)
    .gte("created_at", cutoff.toISOString())
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("[answer-form-question] Cache load error:", error.message);
    return cache;
  }

  for (const row of data || []) {
    if (!cache.has(row.field_label)) {
      cache.set(row.field_label, row.generated_answer);
    }
  }
  return cache;
}

/** Persist generated answers to the answers table. */
async function persistAnswers(
  sb: ReturnType<typeof createClient>,
  userId: string,
  answers: Array<{ id: string; answer: string; confidence: string }>,
  questions: Array<{ id: string; label: string; field_type: string }>,
  jobId: string | undefined,
  jobTitle: string | undefined,
  companyName: string | undefined,
  cachedLabels: Set<string>
): Promise<void> {
  const rows = answers.map((a) => {
    const q = questions.find((q) => q.id === a.id);
    const label = q?.label || a.id;
    const isCached = cachedLabels.has(label);
    return {
      user_id: userId,
      job_id: jobId || null,
      job_title: jobTitle || null,
      company_name: companyName || null,
      field_label: label,
      field_type: q?.field_type || "text",
      generated_answer: a.answer,
      credits_charged: isCached ? 0 : CREDITS_PER_ANSWER,
      cached: isCached,
    };
  });

  const { error } = await sb.from("answers").insert(rows);
  if (error) {
    console.warn("[answer-form-question] Persist error:", error.message);
  }
}

/** Deduct credits for new (non-cached) answers. Fire-and-forget, non-fatal. */
async function deductCredits(
  sb: ReturnType<typeof createClient>,
  userId: string,
  newAnswerCount: number
): Promise<void> {
  if (newAnswerCount <= 0) return;
  const creditsToDeduct = newAnswerCount * CREDITS_PER_ANSWER;
  // Deduct from user_credits table (decrement balance, floor at 0)
  const { error } = await sb.rpc("deduct_credits", {
    p_user_id: userId,
    p_amount: creditsToDeduct,
    p_feature: "ai_answer",
  });
  if (error) {
    console.warn("[answer-form-question] Credit deduction error:", error.message);
  }
}

/** Fetch parsed LinkedIn profile for richer answer context. */
async function fetchLinkedInProfile(
  sb: ReturnType<typeof createClient>,
  userId: string
): Promise<Record<string, unknown> | null> {
  const { data, error } = await sb
    .from("linkedin_profiles")
    .select("display_name, headline, experience_json, skills_array, education_json")
    .eq("user_id", userId)
    .order("parsed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data;
}

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

interface AnswerRequest {
  questions: QuestionInput[];
  profile: ProfileContext;
  resume_text?: string;
  job_id?: string;
  job_title?: string;
  company_name?: string;
}

interface QuestionInput {
  id: string;           // Unique field identifier (DOM id or index)
  label: string;        // The question label text
  field_type: string;   // "text", "textarea", "select", "radio", "checkbox"
  options?: string[];   // For select/radio/checkbox — available choices
  max_length?: number;  // Character limit if known
}

interface ProfileContext {
  name?: string;
  email?: string;
  phone?: string;
  location?: string;
  current_company?: string;
  current_title?: string;
  years_experience?: number;
  linkedin?: string;
  github?: string;
  portfolio?: string;
  skills?: string[];
  education?: string;
  visa_status?: string;
  willing_to_relocate?: boolean;
  desired_salary?: string;
  start_date?: string;
}

interface AnswerResult {
  id: string;
  answer: string;
  confidence: "high" | "medium" | "low";
  reasoning?: string;
}

// ═══════════════════════════════════════════════════════════
// ANTHROPIC CALLER
// ═══════════════════════════════════════════════════════════

async function callHaiku(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 1500
): Promise<{ text: string; ok: boolean; error?: string }> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: maxTokens,
        temperature: 0.3,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error(`[answer-form-question] Haiku error:`, res.status, errBody);
      return { text: "", ok: false, error: `API error ${res.status}` };
    }

    const data = await res.json();
    const text = data.content?.[0]?.text || "";
    return { text, ok: true };
  } catch (e) {
    console.error(`[answer-form-question] Haiku exception:`, e);
    return { text: "", ok: false, error: String(e) };
  }
}

// ═══════════════════════════════════════════════════════════
// RATE LIMITING
// ═══════════════════════════════════════════════════════════

async function checkAndIncrementUsage(
  sb: ReturnType<typeof createClient>,
  userId: string,
  questionCount: number
): Promise<{ allowed: boolean; remaining: number }> {
  const today = new Date().toISOString().split("T")[0];

  // Check current usage from ai_usage_log
  const { count } = await sb
    .from("ai_usage_log")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("usage_date", today);

  const used = count || 0;
  const remaining = DAILY_LIMIT - used;

  if (remaining < questionCount) {
    return { allowed: false, remaining };
  }

  return { allowed: true, remaining: remaining - questionCount };
}

async function logUsage(
  sb: ReturnType<typeof createClient>,
  userId: string,
  questionCount: number,
  feature: string
) {
  const today = new Date().toISOString().split("T")[0];
  const rows = Array.from({ length: questionCount }, () => ({
    user_id: userId,
    usage_date: today,
    feature,
    created_at: new Date().toISOString(),
  }));

  await sb.from("ai_usage_log").insert(rows).then(({ error }) => {
    if (error) console.error("[answer-form-question] Usage log error:", error.message);
  });
}

// ═══════════════════════════════════════════════════════════
// PROMPT BUILDER
// ═══════════════════════════════════════════════════════════

function buildSystemPrompt(): string {
  return `You are an AI assistant helping a job applicant fill out application forms. Your role is to generate professional, honest, and relevant answers to form questions based on the applicant's profile and resume.

Rules:
1. Be concise and professional. Match the expected answer length to the field type.
2. For text inputs: 1-2 sentences max. For textareas: 2-4 sentences.
3. For select/radio/checkbox fields: return EXACTLY one of the provided options.
4. Never fabricate experience or skills the applicant doesn't have.
5. If you truly cannot answer (no relevant info), set confidence to "low" and provide a generic professional response.
6. For salary questions, provide a range if known, or say "Open to discussion" if not.
7. For "How did you hear about us" type questions, say "Job board" unless the profile indicates otherwise.
8. Answer in first person as the applicant.

Respond ONLY with valid JSON array. No markdown, no code fences, no explanation outside the JSON.`;
}

function buildUserPrompt(req: AnswerRequest, linkedIn?: Record<string, unknown> | null): string {
  const parts: string[] = [];

  parts.push("## Applicant Profile");
  if (req.profile.name) parts.push(`Name: ${req.profile.name}`);
  if (req.profile.current_title) parts.push(`Current Title: ${req.profile.current_title}`);
  if (req.profile.current_company) parts.push(`Current Company: ${req.profile.current_company}`);
  if (req.profile.location) parts.push(`Location: ${req.profile.location}`);
  if (req.profile.years_experience) parts.push(`Years of Experience: ${req.profile.years_experience}`);
  if (req.profile.skills?.length) parts.push(`Key Skills: ${req.profile.skills.join(", ")}`);
  if (req.profile.education) parts.push(`Education: ${req.profile.education}`);
  if (req.profile.visa_status) parts.push(`Work Authorization: ${req.profile.visa_status}`);
  if (req.profile.willing_to_relocate !== undefined) parts.push(`Willing to Relocate: ${req.profile.willing_to_relocate ? "Yes" : "No"}`);
  if (req.profile.desired_salary) parts.push(`Desired Salary: ${req.profile.desired_salary}`);
  if (req.profile.start_date) parts.push(`Available Start Date: ${req.profile.start_date}`);
  if (req.profile.linkedin) parts.push(`LinkedIn: ${req.profile.linkedin}`);
  if (req.profile.github) parts.push(`GitHub: ${req.profile.github}`);

  if (req.resume_text) {
    // Truncate resume to ~2000 chars to control token usage
    const truncated = req.resume_text.slice(0, 2000);
    parts.push(`\n## Resume Summary\n${truncated}`);
  }

  // AIS-F4-S1: LinkedIn profile for richer personal context
  if (linkedIn) {
    parts.push(`\n## LinkedIn Profile`);
    if (linkedIn.display_name) parts.push(`Name: ${linkedIn.display_name}`);
    if (linkedIn.headline) parts.push(`Headline: ${linkedIn.headline}`);
    if (Array.isArray(linkedIn.skills_array) && linkedIn.skills_array.length) {
      parts.push(`Skills: ${(linkedIn.skills_array as string[]).slice(0, 20).join(", ")}`);
    }
    if (linkedIn.experience_json) {
      try {
        const exp = typeof linkedIn.experience_json === "string"
          ? JSON.parse(linkedIn.experience_json)
          : linkedIn.experience_json;
        if (Array.isArray(exp) && exp.length) {
          parts.push(`Recent Experience: ${exp.slice(0, 3).map((e: Record<string, unknown>) =>
            `${e.title || ""} at ${e.company || ""}`).join("; ")}`);
        }
      } catch { /* non-fatal */ }
    }
  }

  if (req.job_title || req.company_name) {
    parts.push(`\n## Job Context`);
    if (req.job_title) parts.push(`Position: ${req.job_title}`);
    if (req.company_name) parts.push(`Company: ${req.company_name}`);
  }

  parts.push(`\n## Questions to Answer`);
  parts.push(`Return a JSON array with one object per question:`);
  parts.push(`[{"id": "...", "answer": "...", "confidence": "high|medium|low"}]`);
  parts.push(``);

  for (const q of req.questions) {
    let desc = `- ID: "${q.id}" | Label: "${q.label}" | Type: ${q.field_type}`;
    if (q.options?.length) desc += ` | Options: ${JSON.stringify(q.options)}`;
    if (q.max_length) desc += ` | Max length: ${q.max_length} chars`;
    parts.push(desc);
  }

  return parts.join("\n");
}

// ═══════════════════════════════════════════════════════════
// RESPONSE PARSER
// ═══════════════════════════════════════════════════════════

function parseAIResponse(text: string, questionIds: string[]): AnswerResult[] {
  try {
    // Strip any markdown fences if present
    const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned);

    if (!Array.isArray(parsed)) {
      console.error("[answer-form-question] AI response is not an array");
      return questionIds.map((id) => ({
        id,
        answer: "",
        confidence: "low" as const,
        reasoning: "AI response parse error",
      }));
    }

    // Map by ID, fill gaps
    const resultMap = new Map<string, AnswerResult>();
    for (const item of parsed) {
      if (item.id && item.answer !== undefined) {
        resultMap.set(item.id, {
          id: item.id,
          answer: String(item.answer),
          confidence: ["high", "medium", "low"].includes(item.confidence) ? item.confidence : "medium",
        });
      }
    }

    return questionIds.map((id) =>
      resultMap.get(id) || { id, answer: "", confidence: "low" as const }
    );
  } catch (e) {
    console.error("[answer-form-question] JSON parse error:", e, "Raw:", text.slice(0, 200));
    return questionIds.map((id) => ({
      id,
      answer: "",
      confidence: "low" as const,
      reasoning: "Parse error",
    }));
  }
}

// ═══════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  try {
    // ── Auth ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await sb.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const userId = user.id;

    // ── Parse body ──
    const body: AnswerRequest = await req.json();

    if (!body.questions?.length) {
      return new Response(
        JSON.stringify({ error: "No questions provided" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // Cap at 10 questions per call
    const questions = body.questions.slice(0, 10);

    // AIS-F4-S1: Check DB answer cache (answers within 7 days on same field_label are free)
    const fieldLabels = questions.map((q) => q.label);
    const answerCache = await loadAnswerCache(sb, userId, fieldLabels);
    const cachedLabels = new Set(answerCache.keys());

    // Serve cached answers immediately
    const cachedAnswers: Array<{ id: string; answer: string; confidence: string }> = [];
    const missedQuestions = questions.filter((q) => {
      const cached = answerCache.get(q.label);
      if (cached) {
        cachedAnswers.push({ id: q.id, answer: cached, confidence: "cached" });
        return false;
      }
      return true;
    });

    // If all questions are cached, return immediately without hitting Anthropic
    if (missedQuestions.length === 0) {
      console.log(`[answer-form-question] All ${questions.length} answers served from DB cache`);
      return new Response(
        JSON.stringify({
          answers: cachedAnswers,
          limit: DAILY_LIMIT,
          cache_hits: cachedAnswers.length,
          credits_charged: 0,
        }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // AIS-F4-S1: Fetch LinkedIn profile for richer context
    const linkedInProfile = await fetchLinkedInProfile(sb, userId);

    // ── Rate limit (only for non-cached questions) ──
    const { allowed, remaining } = await checkAndIncrementUsage(sb, userId, missedQuestions.length);
    if (!allowed) {
      return new Response(
        JSON.stringify({
          error: "Daily AI limit reached",
          remaining: 0,
          limit: DAILY_LIMIT,
        }),
        { status: 429, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // ── Call Haiku for missed questions only ──
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt({ ...body, questions: missedQuestions }, linkedInProfile);

    console.log(`[answer-form-question] Answering ${missedQuestions.length} questions (${cachedAnswers.length} from cache) for user ${userId}`);

    // BP-001: Circuit breaker
    const _br = await withAnthropicBreaker(sb, 'answer-form-question', async () => {
      const r = await callHaiku(systemPrompt, userPrompt);
      if (!r.ok) throw new Error(r.error || 'AI call failed');
      return r;
    });
    if (_br.circuitOpen) {
      return new Response(
        JSON.stringify({ error: "AI service temporarily unavailable — please retry in a few minutes" }),
        { status: 503, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }
    const aiResult = _br.result || { ok: false, text: '', error: _br.error };

    if (!aiResult.ok) {
      return new Response(
        JSON.stringify({ error: "AI service unavailable", detail: aiResult.error }),
        { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // ── Parse response ──
    const questionIds = missedQuestions.map((q) => q.id);
    const newAnswers = parseAIResponse(aiResult.text, questionIds);

    // ── Log usage ──
    await logUsage(sb, userId, missedQuestions.length, "form_question_answer");

    // AIS-F4-S1: Persist new answers to DB (fire-and-forget, non-fatal)
    await persistAnswers(sb, userId, newAnswers, missedQuestions, body.job_id, body.job_title, body.company_name, cachedLabels);

    // AIS-F4-S1: Deduct credits for new answers only (0.5/answer, cached=free)
    await deductCredits(sb, userId, newAnswers.length);

    const allAnswers = [...cachedAnswers, ...newAnswers];
    const creditsCharged = newAnswers.length * CREDITS_PER_ANSWER;

    console.log(`[answer-form-question] Success: ${newAnswers.length} new + ${cachedAnswers.length} cached, ${remaining - missedQuestions.length} remaining today, ${creditsCharged} credits charged`);

    return new Response(
      JSON.stringify({
        answers: allAnswers,
        remaining: remaining - missedQuestions.length,
        limit: DAILY_LIMIT,
        cache_hits: cachedAnswers.length,
        credits_charged: creditsCharged,
      }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("[answer-form-question] Unhandled error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});
