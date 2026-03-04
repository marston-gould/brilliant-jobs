// analyze-application-gap — Edge Function
// v7.08 — Brilliant Jobs
//
// Triggered when user marks an application ghosted or rejected.
// Extracts 1-gram + 2-gram tokens from JD and resume text,
// computes gap (JD terms missing from resume), inserts into application_gaps.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

const STOPWORDS = new Set([
  "the","and","or","a","an","to","of","in","for","with","on","at","by","from",
  "as","is","are","was","were","be","been","being","have","has","had","do","does",
  "did","will","would","could","should","may","might","shall","can","that","this",
  "these","those","they","their","them","we","our","you","your","it","its","he",
  "she","his","her","not","but","also","if","then","than","when","where","which",
  "who","how","what","work","working","able","use","using","used","new","other",
  "more","all","any","some","such","each","well","good","great","strong","into",
  "out","about","up","over","own","one","two","three","four","five","per","etc",
]);

function extractNgrams(text: string): string[] {
  if (!text || typeof text !== "string") return [];
  const normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9\s\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = normalized.split(" ").filter(
    (t) => t.length >= 4 && !STOPWORDS.has(t) && !/^\d+$/.test(t)
  );
  const ngrams: Set<string> = new Set();
  for (const t of tokens) { ngrams.add(t); }
  for (let i = 0; i < tokens.length - 1; i++) {
    const bigram = `${tokens[i]} ${tokens[i + 1]}`;
    if (bigram.length >= 8) { ngrams.add(bigram); }
  }
  return Array.from(ngrams);
}

function computeGap(jdNgrams: string[], resumeNgrams: string[]): string[] {
  const resumeSet = new Set(resumeNgrams);
  return jdNgrams.filter((t) => !resumeSet.has(t));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  const token = (req.headers.get("Authorization") || "").replace("Bearer ", "").trim();
  if (!token) return json({ error: "Unauthorized" }, 401);

  const { data: { user }, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !user) return json({ error: "Unauthorized" }, 401);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const { job_id, resume_id, outcome } = body as {
    job_id?: string; resume_id?: string; outcome?: string;
  };

  if (!outcome || !["ghosted", "rejected"].includes(outcome)) {
    return json({ error: "outcome must be 'ghosted' or 'rejected'" }, 400);
  }

  // PostHog: gap_analysis_triggered
  try {
    await fetch("https://app.posthog.com/capture/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: Deno.env.get("POSTHOG_API_KEY") || "",
        event: "gap_analysis_triggered",
        distinct_id: user.id,
        properties: { job_id, resume_id, outcome },
      }),
    });
  } catch { /* non-fatal */ }

  let jdText = "";
  if (job_id) {
    const { data: jdRow } = await sb
      .from("ats_jobs").select("content").eq("greenhouse_id", job_id).maybeSingle();
    jdText = jdRow?.content || "";
    if (!jdText) {
      const { data: bySlug } = await sb
        .from("ats_jobs").select("content")
        .or(`greenhouse_id.eq.${job_id},lever_id.eq.${job_id},ashby_id.eq.${job_id}`)
        .maybeSingle();
      jdText = bySlug?.content || "";
    }
  }

  let resumeText = "";
  if (resume_id) {
    const { data: resRow } = await sb
      .from("resume_texts").select("extracted_text")
      .eq("resume_id", resume_id).eq("user_id", user.id).maybeSingle();
    resumeText = resRow?.extracted_text || "";
    if (!resumeText) {
      const { data: res2 } = await sb
        .from("resumes").select("extracted_text, keywords").eq("id", resume_id).maybeSingle();
      resumeText = res2?.extracted_text || (res2?.keywords || []).join(" ");
    }
  }

  const jdNgrams = extractNgrams(jdText);
  const resumeNgrams = extractNgrams(resumeText);
  const gapTerms = computeGap(jdNgrams, resumeNgrams);

  const { error: insertErr } = await sb.from("application_gaps").insert({
    user_id: user.id, job_id: job_id || null, resume_id: resume_id || null,
    outcome, jd_ngrams: jdNgrams, resume_ngrams: resumeNgrams, gap_terms: gapTerms,
  });

  if (insertErr) {
    console.error("[analyze-application-gap] Insert error:", insertErr.message);
    return json({ error: "Failed to record gap data" }, 500);
  }

  // PostHog: gap_analysis_completed
  try {
    await fetch("https://app.posthog.com/capture/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: Deno.env.get("POSTHOG_API_KEY") || "",
        event: "gap_analysis_completed",
        distinct_id: user.id,
        properties: {
          job_id, resume_id, outcome,
          jd_ngram_count: jdNgrams.length, resume_ngram_count: resumeNgrams.length,
          gap_term_count: gapTerms.length,
          has_jd_text: jdText.length > 0, has_resume_text: resumeText.length > 0,
        },
      }),
    });
  } catch { /* non-fatal */ }

  return json({ ok: true, gap_term_count: gapTerms.length, top_gaps: gapTerms.slice(0, 10) });
});
