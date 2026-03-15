// generate-editorial-content Edge Function
// Content Engine Phase 2B + Wave 4 + #15 Approval Gates
// Takes pending content_stories → generates content → validates → routes to pending_review or validation_failed.
// NEVER goes straight to published. All content requires editorial approval via approve-content EF.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdmin, authErrorResponse } from "../_shared/admin-auth.ts";
import { withAnthropicBreaker } from "../_shared/anthropic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Claude System Prompt (from Editorial Rules doc) ───
const SYSTEM_PROMPT = `You are the editorial engine for Brilliant Jobs, a job search intelligence platform. You write short, data-driven articles about the job market based on real-time data from ATS career pages.

STYLE RULES:
- Lead with the number. First sentence contains the key data point.
- 200-400 words maximum. One insight per story.
- Use specific numbers: "2,340 open positions" not "thousands of positions."
- Always include both percentage change AND absolute numbers.
- When reporting salary data, note it is based on posted salary ranges.
- Never speculate about causes, predictions, or economic implications.
- Never use exclamation points, "breaking," or "exclusive."
- Never round misleadingly ($87,400 is not "nearly $90K").
- End with one actionable sentence for job seekers.

REQUIRED OUTPUT (JSON):
{
  "headline": "string (max 80 chars)",
  "lede": "string (1-2 sentences, the finding stated plainly)",
  "body_html": "string (HTML, 2-3 paragraphs, no <h1> tags)",
  "chart_config": { ECharts option object for the inline chart },
  "meta_description": "string (120-155 chars)",
  "social_snippet": "string (50-80 chars)",
  "tags": ["string array of category tags"],
  "evergreen_link": "string (URL of related standing page, or null)"
}

Respond with valid JSON only. No markdown fences, no preamble.`;

// ─── Template Prompts by Story Type ───
function getTemplatePrompt(storyType: string, data: Record<string, unknown>): string {
  const templates: Record<string, string> = {
    volume_spike: `Story type: volume_spike
Data provided: ${JSON.stringify(data)}

Write a 200-300 word article about this hiring volume change.
Headline formula: "{Role} Hiring {Up/Down} {X}% This Week"
Include: absolute numbers (not just %), top companies if available, salary context, remote availability.
Chart: Weekly volume bar chart (last 8 weeks) with the current week highlighted.
Link to: /trends/${(data.role as string || "").replace(/\s+/g, "-").toLowerCase()}`,

    metro_volume_spike: `Story type: volume_spike_location
Data provided: ${JSON.stringify(data)}

Write a 200-300 word article about this geographic hiring shift.
Headline formula: "{City} Job Market {Surging/Cooling} — {X}% Change This Week"
Include: absolute numbers, what roles are driving it, salary context, comparison to national average.
Chart: Weekly volume for this city (last 8 weeks).
Link to: /jobs-by-location`,

    company_surge: `Story type: company_surge
Data provided: ${JSON.stringify(data)}

Write a 200-300 word article about this company's hiring activity.
Headline formula: "{Company} {Doubles/Triples} Hiring — {X} New Roles This Week"
Include: what roles they're hiring for, where, whether remote is available.
Do NOT speculate about why they're hiring.
Chart: Company weekly posting volume (last 8 weeks).
Link to: /company/${(data.company as string || "").replace(/\s+/g, "-").toLowerCase()}`,

    metro_crossover: `Story type: metro_crossover
Data provided: ${JSON.stringify(data)}

Write a 200-300 word article about this geographic ranking change.
Headline formula: "{City A} Surpasses {City B} in Job Postings"
Include: both cities' numbers, salary comparison between the two.
Chart: Dual-line chart showing both cities' weekly volume (last 12 weeks).
Link to: /jobs-by-location`,

    metro_comparison: `Story type: metro_comparison
Data provided: ${JSON.stringify(data)}

Write a 200-300 word article about this salary differential between two metro areas.
Headline formula: "{City A} Jobs Pay {X}% More Than {City B}"
Include: both cities' job counts, salary medians, what roles drive the gap.
Chart: Side-by-side bar chart comparing job volume and median salary.
Link to: /jobs-by-location`,

    new_entrant: `Story type: new_entrant
Data provided: ${JSON.stringify(data)}

Write a 150-250 word article about this company entering the hiring market.
Headline formula: "{Company} Enters the Hiring Market with {X} Openings"
Include: what they're hiring for, where, salary range if available.
Keep it factual — no speculation about growth or funding.
Chart: None (not enough historical data). Use a stat card instead — generate chart_config as a simple gauge or number display.
Link to: signup CTA`,

    nyfed_quarterly: `Story type: nyfed_quarterly
Data provided: ${JSON.stringify(data)}

Write a 250-350 word article about the latest NY Fed College Labor Market data cross-referenced with Brilliant Jobs hiring data.
Headline formula: "Recent Graduate Underemployment at {X}% — Meanwhile, {Y}K+ Positions Open"
Include: NY Fed underemployment rate, median wage data, total open positions on Brilliant Jobs, the contrast between backward-looking survey data and real-time hiring demand.
Note: This data comes from the Federal Reserve Bank of New York College Labor Market series.
Chart: Dual-axis chart — NY Fed unemployment/underemployment line + BJ job volume bars.
Link to: /college-major-outcomes`,

    nyfed_major_spotlight: `Story type: nyfed_major_spotlight
Data provided: ${JSON.stringify(data)}

Write a 200-300 word article spotlighting this college major's employment outcomes.
Headline formula: "{Major} Grads: {X} Open Positions Paying {Y}K"
Include: NY Fed metrics (underemployment, median wage) alongside BJ live data (open positions, median posted salary, remote %).
Chart: Split view — NY Fed metrics left, BJ live metrics right.
Link to: /college-major-outcomes`,

    nyfed_salary_divergence: `Story type: nyfed_salary_divergence
Data provided: ${JSON.stringify(data)}

Write a 200-300 word article about the gap between posted salaries on Brilliant Jobs and the NY Fed's reported median for this field.
Headline formula: "Posted {Major} Salaries {X}% {Above/Below} the NY Fed Reported Median"
Include: both numbers (BJ median vs NY Fed median), sample size, note that BJ data reflects current postings while NY Fed reflects historical survey data.
Chart: Comparison bar chart showing NY Fed median vs BJ posted median.
Link to: /college-major-outcomes`,

    nyfed_college_premium: `Story type: nyfed_college_premium
Data provided: ${JSON.stringify(data)}

Write a 200-300 word article about the wage premium of a bachelor's degree vs high school diploma.
Headline formula: "College Premium Holds: BA Median {X}K vs HS $40K — {Y}% Gap"
Include: the dollar amounts, the percentage gap, how this has trended over time.
Note this data is from the Federal Reserve Bank of New York.
Chart: 35-year line chart of BA median vs HS median.
Link to: /college-major-outcomes`,

    nyfed_underemploy_hiring: `Story type: nyfed_underemploy_hiring
Data provided: ${JSON.stringify(data)}

Write a 200-300 word article about the contrast between underemployment rates and actual hiring demand.
Headline formula: "{X}% of {Major} Grads Are Underemployed — But We Found {Y} Matching Jobs"
Include: the underemployment rate, the number of matching positions on Brilliant Jobs, median salary of those positions.
The key insight: underemployment statistics may not reflect current hiring reality.
Chart: Horizontal bar showing underemployment rate alongside open job count.
Link to: /college-major-outcomes`,
  };

  return templates[storyType] || `Story type: ${storyType}\nData: ${JSON.stringify(data)}\n\nWrite a 200-300 word data-driven article about this finding.`;
}

// ═══════════════════════════════════════════════════════════════
// VALIDATION GATE — implements CONTENT_ENGINE_MULTI_MODEL_VALIDATION.md
// 6 layers: structure, data fidelity, voice, volumetrics, entity, dedup
// ═══════════════════════════════════════════════════════════════

interface ValidationResult {
  passed: boolean;
  score: number;
  checks: ValidationCheck[];
  hard_fails: string[];
  soft_fails: string[];
  warnings: string[];
}

interface ValidationCheck {
  layer: string;
  check: string;
  severity: "hard_fail" | "soft_fail" | "warning";
  passed: boolean;
  message: string;
}

function validateContent(
  generated: Record<string, unknown>,
  storyType: string,
  storyData: Record<string, unknown>
): ValidationResult {
  const checks: ValidationCheck[] = [];

  // ─── Layer 1: Structure Validation ───
  const headline = generated.headline as string || "";
  const lede = generated.lede as string || "";
  const bodyHtml = generated.body_html as string || "";
  const chartConfig = generated.chart_config;

  // Headline present
  checks.push({
    layer: "structure",
    check: "headline_present",
    severity: "hard_fail",
    passed: headline.length > 0 && headline.length <= 80,
    message: headline.length === 0 ? "Missing headline" : headline.length > 80 ? `Headline too long (${headline.length} chars)` : "OK",
  });

  // Lede present and adequate length
  const ledeWords = lede.trim().split(/\s+/).length;
  checks.push({
    layer: "structure",
    check: "lede_present",
    severity: "hard_fail",
    passed: ledeWords >= 10,
    message: ledeWords < 10 ? `Lede too short (${ledeWords} words, need 10+)` : "OK",
  });

  // Body present with paragraphs
  const bodyParas = (bodyHtml.match(/<p[\s>]/gi) || []).length;
  // Also count paragraph-like blocks if not wrapped in <p> tags
  const textParas = bodyParas > 0 ? bodyParas : bodyHtml.split(/\n\n+/).filter(s => s.trim().length > 20).length;
  checks.push({
    layer: "structure",
    check: "body_paragraphs",
    severity: "soft_fail",
    passed: textParas >= 2,
    message: textParas < 2 ? `Only ${textParas} body paragraphs (need 2+)` : "OK",
  });

  // Chart config present (skip for new_entrant which uses stat card)
  if (storyType !== "new_entrant") {
    checks.push({
      layer: "structure",
      check: "chart_config_present",
      severity: "soft_fail",
      passed: chartConfig != null && typeof chartConfig === "object",
      message: !chartConfig ? "Missing chart_config" : "OK",
    });
  }

  // ─── Layer 2: Data Fidelity ───
  // Extract all numbers from generated text
  const allText = `${headline} ${lede} ${bodyHtml}`;
  const numbersInText = allText.match(/[\d,]+\.?\d*/g) || [];
  const storyDataStr = JSON.stringify(storyData);

  // DF-1: Number cross-reference (check that key numbers trace to source data)
  // We check significant numbers (> 10) against source data with tolerance
  const significantNumbers = numbersInText
    .map(n => parseFloat(n.replace(/,/g, "")))
    .filter(n => !isNaN(n) && n > 10);

  let unmatchedCount = 0;
  for (const num of significantNumbers) {
    // Check if this number (or something within 2% tolerance) exists in source data
    const tolerance = num * 0.02;
    const found = storyDataStr.match(new RegExp(`[\\d,]+\\.?\\d*`, "g"))?.some(sourceNum => {
      const parsed = parseFloat(sourceNum.replace(/,/g, ""));
      return !isNaN(parsed) && Math.abs(parsed - num) <= Math.max(tolerance, 1);
    });
    if (!found) unmatchedCount++;
  }

  checks.push({
    layer: "data_fidelity",
    check: "df1_number_crossref",
    severity: "hard_fail",
    passed: significantNumbers.length === 0 || unmatchedCount <= 1,
    message: unmatchedCount > 1
      ? `${unmatchedCount} numbers not found in source data (potential hallucination)`
      : "OK",
  });

  // DF-5: Comparison direction check
  const comparisonPatterns = [
    /(\w+)\s+(?:is|are)\s+(?:higher|greater|more|larger)\s+than\s+(\w+)/gi,
    /(\w+)\s+surpass(?:es|ed)\s+(\w+)/gi,
  ];
  // Lightweight check — flag if comparison language exists but we can't verify from data
  let hasUnverifiableComparisons = false;
  for (const pattern of comparisonPatterns) {
    if (pattern.test(allText)) {
      // We flag this as a warning — full verification requires understanding the data schema
      hasUnverifiableComparisons = true;
    }
  }
  if (hasUnverifiableComparisons) {
    checks.push({
      layer: "data_fidelity",
      check: "df5_comparison_direction",
      severity: "warning",
      passed: true, // Warning only — editorial review should verify
      message: "Contains comparison claims — editorial reviewer should verify direction",
    });
  }

  // DF-6: Superlative claims
  const superlatives = allText.match(/\b(highest|lowest|most|least|fastest|slowest|largest|smallest|biggest|best|worst)\b/gi) || [];
  if (superlatives.length > 0) {
    checks.push({
      layer: "data_fidelity",
      check: "df6_superlative_claims",
      severity: "warning",
      passed: true, // Warning — reviewer should verify
      message: `Contains ${superlatives.length} superlative(s): ${superlatives.slice(0, 3).join(", ")} — reviewer should verify`,
    });
  }

  // ─── Layer 3: Voice Validation ───
  // V-1: No meta-commentary
  const metaCommentary = /^(In this (article|analysis|report|piece)|This (article|story|report) (examines|explores|looks at))/im;
  checks.push({
    layer: "voice",
    check: "v1_no_meta_commentary",
    severity: "soft_fail",
    passed: !metaCommentary.test(allText),
    message: metaCommentary.test(allText) ? "Contains meta-commentary (e.g. 'In this article...')" : "OK",
  });

  // V-2: No excessive hedging
  const hedgeWords = allText.match(/\b(might|could|perhaps|possibly|potentially|it seems|appears to|may suggest)\b/gi) || [];
  checks.push({
    layer: "voice",
    check: "v2_no_excessive_hedging",
    severity: "soft_fail",
    passed: hedgeWords.length <= 2,
    message: hedgeWords.length > 2 ? `${hedgeWords.length} hedge words found (max 2)` : "OK",
  });

  // V-3: Number-first lede check
  const ledeStartsWithNumber = /^\d/.test(lede.trim()) || /^\$\d/.test(lede.trim()) || /^[A-Z][\w\s]+ (?:hiring|jobs|positions|openings|roles|postings)/i.test(lede.trim());
  checks.push({
    layer: "voice",
    check: "v3_number_first_lede",
    severity: "warning",
    passed: ledeStartsWithNumber,
    message: !ledeStartsWithNumber ? "Lede does not lead with a number or key data point" : "OK",
  });

  // V-4: No banned vocabulary
  const bannedWords = /\b(breaking|exclusive|stunning|shocking|unbelievable|incredible|amazing)\b/gi;
  checks.push({
    layer: "voice",
    check: "v4_banned_vocabulary",
    severity: "soft_fail",
    passed: !bannedWords.test(allText),
    message: bannedWords.test(allText) ? "Contains banned vocabulary (sensationalist terms)" : "OK",
  });

  // V-5: No exclamation points
  checks.push({
    layer: "voice",
    check: "v5_no_exclamation",
    severity: "soft_fail",
    passed: !allText.includes("!"),
    message: allText.includes("!") ? "Contains exclamation point(s)" : "OK",
  });

  // ─── Layer 4: Volumetric Validation ───
  const totalWords = allText.replace(/<[^>]*>/g, "").trim().split(/\s+/).length;
  const isWeeklyType = storyType.startsWith("nyfed_") && storyType !== "nyfed_quarterly";
  const minWords = isWeeklyType ? 150 : 100;
  const maxWords = storyType === "nyfed_quarterly" ? 400 : 350;

  checks.push({
    layer: "volumetrics",
    check: "word_count",
    severity: "soft_fail",
    passed: totalWords >= minWords && totalWords <= maxWords,
    message: totalWords < minWords
      ? `Too short (${totalWords} words, min ${minWords})`
      : totalWords > maxWords
        ? `Too long (${totalWords} words, max ${maxWords})`
        : "OK",
  });

  // ─── Layer 5: Entity Validation ───
  // Minimum entity density — at least 2 named entities (companies, cities, roles)
  const entityPatterns = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g;
  const entities = allText.match(entityPatterns) || [];
  const uniqueEntities = new Set(entities.filter(e => e.length > 2));
  checks.push({
    layer: "entity",
    check: "entity_density",
    severity: "warning",
    passed: uniqueEntities.size >= 2,
    message: uniqueEntities.size < 2 ? `Only ${uniqueEntities.size} named entities (need 2+)` : "OK",
  });

  // ─── Layer 6: Dedup Validation ───
  // Lightweight headline dedup check — will be enhanced when checking against DB
  // For now, just ensure headline isn't generic
  const genericHeadlines = /^(Job Market Update|Weekly Hiring Report|New Jobs This Week)$/i;
  checks.push({
    layer: "dedup",
    check: "headline_specificity",
    severity: "soft_fail",
    passed: !genericHeadlines.test(headline.trim()),
    message: genericHeadlines.test(headline.trim()) ? "Headline is too generic" : "OK",
  });

  // ─── Compute Score & Classify ───
  const hardFails = checks.filter(c => c.severity === "hard_fail" && !c.passed);
  const softFails = checks.filter(c => c.severity === "soft_fail" && !c.passed);
  const warnings = checks.filter(c => c.severity === "warning" && !c.passed);
  const totalChecks = checks.length;
  const passedChecks = checks.filter(c => c.passed).length;
  const score = Math.round((passedChecks / totalChecks) * 100);

  return {
    passed: hardFails.length === 0,
    score,
    checks,
    hard_fails: hardFails.map(c => c.message),
    soft_fails: softFails.map(c => c.message),
    warnings: warnings.map(c => c.message),
  };
}

// ═══════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // G11: Auth via shared admin-auth middleware (supports service_role for cron)
    let isServiceRole = false;
    try {
      const authResult = await requireAdmin(req);
      isServiceRole = authResult.isServiceRole;
    } catch (err) {
      return authErrorResponse(err, corsHeaders);
    }

    // CS-006: AD-FIX-03 — Rate limit: 10 calls/hr for non-service-role callers
    if (!isServiceRole) {
      const authHeader = req.headers.get("Authorization") || "";
      const callerToken = authHeader.replace("Bearer ", "");
      const { data: allowed } = await supabase.rpc('check_ef_rate_limit', {
        p_function_name: 'generate-editorial-content',
        p_caller_id: callerToken.split('.')[1]?.substring(0, 20) || 'unknown',
        p_max_calls: 10,
        p_window_minutes: 60
      });
      if (allowed === false) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Max 10 calls per hour.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '3600' },
        });
      }
    }

    // Also pick up validation_failed stories that still have retries left (max 2)
    const { data: pendingStories, error: fetchErr } = await supabase
      .from("content_stories")
      .select("*")
      .or("status.eq.pending,and(status.eq.validation_failed,retry_count.lt.2)")
      .is("body_html", null)
      .order("score", { ascending: false })
      .limit(5);

    if (fetchErr) throw fetchErr;
    if (!pendingStories || pendingStories.length === 0) {
      return new Response(
        JSON.stringify({ message: "No pending stories to generate", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: Array<{
      id: number;
      story_type: string;
      status: string;
      validation_score?: number;
      hard_fails?: string[];
      error?: string;
    }> = [];

    for (const story of pendingStories) {
      const startTime = Date.now();
      try {
        // Build prompt — if retrying, append rejection feedback
        let templatePrompt = getTemplatePrompt(
          story.story_type,
          story.data_points as Record<string, unknown>
        );

        if (story.retry_count > 0 && story.validation_result?.hard_fails) {
          templatePrompt += `\n\n--- PREVIOUS ATTEMPT REJECTED ---\nFix these issues:\n${(story.validation_result.hard_fails as string[]).join("\n")}\n${(story.validation_result.soft_fails as string[] || []).join("\n")}`;
        }

        // Call Claude API
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": anthropicKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 2000,
            system: SYSTEM_PROMPT,
            messages: [
              {
                role: "user",
                content: templatePrompt,
              },
            ],
          }),
        });

        const latencyMs = Date.now() - startTime;

        if (!response.ok) {
          const errBody = await response.text();
          console.error(`Claude API error for story ${story.id}: ${response.status} ${errBody}`);
          results.push({ id: story.id, story_type: story.story_type, status: "api_error" });
          continue;
        }

        const claudeResponse = await response.json();
        const rawText = claudeResponse.content?.[0]?.text || "";

        // Parse JSON from Claude's response
        let generated: Record<string, unknown>;
        try {
          const cleaned = rawText
            .replace(/```json\s*/g, "")
            .replace(/```\s*/g, "")
            .trim();
          generated = JSON.parse(cleaned);
        } catch (parseErr) {
          console.error(`JSON parse error for story ${story.id}:`, parseErr, rawText.slice(0, 200));
          results.push({ id: story.id, story_type: story.story_type, status: "parse_error" });
          continue;
        }

        // ─── VALIDATION GATE ───
        const validation = validateContent(
          generated,
          story.story_type,
          (story.data_points as Record<string, unknown>) || {}
        );

        const headline = (generated.headline as string) || story.headline;
        const slug = headline
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, "")
          .replace(/\s+/g, "-")
          .replace(/-+/g, "-")
          .slice(0, 80);

        const currentRetry = (story.retry_count || 0) + (story.status === "validation_failed" ? 1 : 0);

        if (validation.passed) {
          // ✅ Validation passed → route to pending_review (NOT published)
          const { error: updateErr } = await supabase
            .from("content_stories")
            .update({
              headline: headline.slice(0, 80),
              lede: (generated.lede as string) || null,
              body_html: (generated.body_html as string) || null,
              chart_config: (generated.chart_config as object) || null,
              meta_description: (generated.meta_description as string) || null,
              social_snippet: (generated.social_snippet as string) || null,
              tags: (generated.tags as string[]) || [],
              evergreen_link: (generated.evergreen_link as string) || null,
              published_slug: slug,
              status: "pending_review",
              validation_score: validation.score,
              validation_result: validation,
              retry_count: currentRetry,
              model_used: "claude-haiku-4-5-20251001",
              generation_latency_ms: latencyMs,
              updated_at: new Date().toISOString(),
            })
            .eq("id", story.id);

          if (updateErr) {
            console.error(`Update error for story ${story.id}:`, updateErr);
            results.push({ id: story.id, story_type: story.story_type, status: "update_error" });
          } else {
            results.push({
              id: story.id,
              story_type: story.story_type,
              status: "pending_review",
              validation_score: validation.score,
            });
          }
        } else {
          // ❌ Validation failed — check retry budget
          const { error: updateErr } = await supabase
            .from("content_stories")
            .update({
              headline: headline.slice(0, 80),
              lede: (generated.lede as string) || null,
              body_html: currentRetry < 2 ? null : (generated.body_html as string) || null,
              chart_config: (generated.chart_config as object) || null,
              status: currentRetry >= 2 ? "validation_failed_final" : "validation_failed",
              validation_score: validation.score,
              validation_result: validation,
              retry_count: currentRetry,
              model_used: "claude-haiku-4-5-20251001",
              generation_latency_ms: latencyMs,
              updated_at: new Date().toISOString(),
            })
            .eq("id", story.id);

          if (updateErr) {
            console.error(`Update error for story ${story.id}:`, updateErr);
          }

          results.push({
            id: story.id,
            story_type: story.story_type,
            status: currentRetry >= 2 ? "validation_failed_final" : "validation_failed",
            validation_score: validation.score,
            hard_fails: validation.hard_fails,
          });
        }
      } catch (storyErr) {
        const errMsg = storyErr instanceof Error ? storyErr.message : String(storyErr);
        console.error(`Error processing story ${story.id}:`, errMsg, storyErr);
        results.push({
          id: story.id,
          story_type: story.story_type,
          status: "error",
          error: errMsg,
        });
      }
    }

    return new Response(
      JSON.stringify({
        processed: results.length,
        pending_review: results.filter((r) => r.status === "pending_review").length,
        validation_failed: results.filter((r) => r.status.startsWith("validation_failed")).length,
        errors: results.filter((r) => ["error", "api_error", "parse_error", "update_error"].includes(r.status)).length,
        results,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Generation error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
