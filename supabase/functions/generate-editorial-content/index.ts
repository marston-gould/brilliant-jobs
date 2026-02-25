import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

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

// ──────────────────────────────────────────────
// TEMPLATE PROMPTS by story_type
// ──────────────────────────────────────────────
function getTemplatePrompt(storyType: string, data: Record<string, unknown>): string {
  const d = data;
  switch (storyType) {
    case "volume_spike":
      return `Write a 200-300 word article about a hiring volume change.
Data: Role "${d.role}" — current week: ${d.current_week} jobs, prior week: ${d.prior_week} jobs, change: ${d.pct_change}%.
Timeline data for chart: ${JSON.stringify(d.timeline)}
Headline formula: "{Role} Hiring {Up/Down} {X}% This Week"
Include: absolute numbers, salary context if available, remote availability.
Chart: Weekly volume bar chart (last 8 weeks) with the current week highlighted.
Link to: /trends/${d.role}`;

    case "metro_volume_spike":
      return `Write a 200-300 word article about a geographic hiring shift.
Data: City "${d.city}" — current week: ${d.current_week} jobs, prior week: ${d.prior_week} jobs, change: ${d.pct_change}%. Median salary: $${d.median_salary}.
Timeline: ${JSON.stringify(d.timeline)}
Headline formula: "{City} Job Market {Surging/Cooling} — {X}% Change This Week"
Include: absolute numbers, what the salary context is, comparison perspective.
Chart: Weekly volume for this city (last 8 weeks).
Link to: /jobs-by-location`;

    case "company_surge":
      return `Write a 200-300 word article about this company's hiring activity.
Data: Company "${d.company}" — current week: ${d.current_week} jobs, 30-day weekly average: ${d.avg_weekly} jobs, multiplier: ${d.multiplier}x.
Headline formula: "{Company} {Doubles/Triples} Hiring — {X} New Roles This Week"
Include: the multiplier, absolute counts. Do NOT speculate about why they're hiring.
Chart: Company weekly posting volume (last 8 weeks).
Link to: /company/${d.company}`;

    case "new_entrant":
      return `Write a 150-250 word article about this company entering the hiring market.
Data: Company "${d.company}" — ${d.count} open positions. Roles: ${JSON.stringify(d.roles)}. Locations: ${JSON.stringify(d.locations)}.
Headline formula: "{Company} Enters the Hiring Market with {X} Openings"
Keep it factual — no speculation about growth or funding.
Chart: None. Use a stat card instead showing the count.
Link to: signup CTA`;

    case "metro_crossover":
      return `Write a 200-300 word article about a geographic ranking change in job postings.
Data: ${d.city_a} (rank #${d.city_a_rank}, ${d.city_a_count} jobs, median $${d.city_a_salary}) overtook ${d.city_b} (now rank #${d.city_b_rank}, ${d.city_b_count} jobs, median $${d.city_b_salary}).
Prior ranks: ${d.city_a} was #${d.city_a_prior_rank}, ${d.city_b} was #${d.city_b_prior_rank}.
Headline formula: "{City A} Surpasses {City B} in Job Postings"
Include: both cities' numbers, salary comparison.
Chart: Dual-bar chart showing both cities' current job counts and median salaries.
Link to: /jobs-by-location`;

    case "nyfed_salary_divergence":
      return `Write a 200-300 word article about the gap between posted job salaries and NY Fed survey data.
Data: Major "${d.major}" — BJ posted median salary: $${d.bj_median_salary}, NY Fed early career median: $${d.nyfed_early_salary}, NY Fed mid-career: $${d.nyfed_mid_salary}. Delta: ${d.salary_delta_pct}%. BJ open jobs: ${d.bj_open_jobs}. Remote: ${d.bj_remote_pct}%.
NY Fed unemployment for this field: ${d.nyfed_unemployment}%, underemployment: ${d.nyfed_underemployment}%.
Headline formula: "{Major} Posted Salaries {X}% {Above/Below} NY Fed Median"
Note: salary data is from posted ranges on ATS career pages, not actual compensation.
Reference: Federal Reserve Bank of New York College Labor Market series.
Chart: Bar chart comparing BJ median vs NY Fed early vs NY Fed mid salary.
Link to: /college-major-outcomes`;

    case "nyfed_underemploy_hiring":
      return `Write a 200-300 word article about the contrast between underemployment rates and active hiring.
Data: Major "${d.major}" — NY Fed underemployment rate: ${d.underemployment_rate}%. But BJ is tracking ${d.bj_open_jobs} open positions with median salary $${d.bj_median_salary}. Remote: ${d.bj_remote_pct}%.
The insight: despite high underemployment (many grads in jobs not requiring a degree), employers are actively posting roles requiring this background.
Headline formula: "{Major} Grads Face ${d.underemployment_rate}% Underemployment — Yet ${d.bj_open_jobs} Roles Are Open"
Do NOT editorialize. Present the data contrast and what it means for job seekers.
Chart: Side-by-side: underemployment rate bar vs open jobs bar.
Link to: /college-major-outcomes`;

    case "econ_divergence":
      return `Write a 200-300 word article about a divergence between macro economic data and real-time hiring.
Data: ${d.indicator} changed ${d.indicator_change_pct}% (latest: ${d.indicator_latest}, period: ${d.indicator_period}). Meanwhile, BJ total open positions: ${d.bj_total_jobs}, change: ${d.bj_change_pct}%. Divergence: ${d.divergence} percentage points.
Headline formula: "{Indicator} {Direction} While Job Postings {Opposite Direction}"
Do NOT predict what this means for the economy. Just present the data contrast.
Note: BJ data is from real-time ATS career page monitoring. Macro data from BLS/FRED.
Chart: Dual-axis line: one line for the indicator trend, one for BJ job volume.
Link to: /data-lab`;

    case "econ_inflection":
      return `Write a 200-300 word article about a significant change in a macro economic indicator.
Data: ${d.indicator} — current: ${d.current_value}, prior: ${d.prior_value ?? d.avg_4w}, change: ${d.change_pp ?? d.pct_change}${d.change_pp !== undefined ? ' pp' : '%'}. Period: ${d.period}.
${d.bj_total_jobs ? `BJ is currently tracking ${d.bj_total_jobs} open positions for context.` : ''}
Headline formula: "{Indicator} {Rises/Falls} to {Value} — What BJ Data Shows"
Present the macro data point, then contextualize with BJ hiring data if available.
Do NOT speculate about future trends.
Chart: Line chart of this indicator over time (if data available).
Link to: /data-lab`;

    case "milestone":
      return `Write a 150-200 word article about a Brilliant Jobs platform achievement.
Data: Milestone: ${d.milestone_value} open positions. Current total: ${d.current_total}. Companies tracked: ${d.total_companies}.
Headline formula: "Brilliant Jobs Now Tracking {X} Open Positions Across {Y} Companies"
Include: growth perspective, data source breadth (5 ATS platforms).
Chart: Single stat card with the milestone number.
Link to: /data-lab`;

    default:
      return `Write a 200-300 word data-driven article about the following job market data: ${JSON.stringify(d)}`;
  }
}

// ──────────────────────────────────────────────
// Generate slug from headline
// ──────────────────────────────────────────────
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .substring(0, 80);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Get pending stories ordered by score
  const { data: pending, error: fetchErr } = await supabase
    .from("content_stories")
    .select("*")
    .eq("status", "pending")
    .order("score", { ascending: false })
    .limit(5);

  if (fetchErr || !pending?.length) {
    return new Response(
      JSON.stringify({ generated: 0, message: "No pending stories" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // ──────────────────────────────────────────────
  // Category balance check
  // ──────────────────────────────────────────────
  const weekStart = new Date(now());
  function now() { return new Date(); }
  const dayOfWeek = new Date().getDay();
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date();
  monday.setDate(monday.getDate() - mondayOffset);
  monday.setHours(0, 0, 0, 0);

  const { data: thisWeekStories } = await supabase
    .from("content_stories")
    .select("category, published_at")
    .in("status", ["published", "approved"])
    .gte("published_at", monday.toISOString());

  const weeklyCounts: Record<string, number> = {};
  let lastCategory = "";
  if (thisWeekStories?.length) {
    for (const s of thisWeekStories) {
      weeklyCounts[s.category] = (weeklyCounts[s.category] ?? 0) + 1;
      lastCategory = s.category; // latest published
    }
  }

  // Get today's published count
  const todayStr = new Date().toISOString().split("T")[0];
  const { data: todayStories } = await supabase
    .from("content_stories")
    .select("id")
    .in("status", ["published", "approved"])
    .gte("published_at", todayStr);
  const todayCount = todayStories?.length ?? 0;

  if (todayCount >= 2) {
    return new Response(
      JSON.stringify({ generated: 0, message: "Daily limit reached (2 stories/day)" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const generated: string[] = [];

  for (const story of pending) {
    if (generated.length >= (2 - todayCount)) break;

    // Category balance: max 3 per category per week
    if ((weeklyCounts[story.category] ?? 0) >= 3 && story.category !== "milestone") {
      await supabase.from("content_stories").update({ status: "held_balance" }).eq("id", story.id);
      continue;
    }

    // No same-category back-to-back (first story of day only)
    if (generated.length === 0 && story.category === lastCategory && lastCategory !== "") {
      continue; // try next story
    }

    // Generate content via Claude
    const templatePrompt = getTemplatePrompt(story.story_type, story.data_points);

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY!,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20241022",
          max_tokens: 2000,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: templatePrompt }],
        }),
      });

      const result = await response.json();
      const text = result.content?.[0]?.text ?? "";

      // Parse JSON response
      let parsed;
      try {
        const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        parsed = JSON.parse(cleaned);
      } catch {
        console.error(`Failed to parse Claude response for story ${story.id}:`, text.substring(0, 200));
        await supabase.from("content_stories").update({ status: "generation_failed" }).eq("id", story.id);
        continue;
      }

      // Generate slug
      const slug = slugify(parsed.headline) + "-" + new Date().toISOString().split("T")[0];

      // Update story with generated content
      const { error: updateErr } = await supabase
        .from("content_stories")
        .update({
          headline: parsed.headline,
          lede: parsed.lede,
          body_html: parsed.body_html,
          chart_config: parsed.chart_config,
          meta_description: parsed.meta_description,
          social_snippet: parsed.social_snippet,
          tags: parsed.tags,
          evergreen_link: parsed.evergreen_link,
          published_slug: slug,
          status: "awaiting_review", // Marston reviews before publishing
          updated_at: new Date().toISOString(),
        })
        .eq("id", story.id);

      if (!updateErr) {
        generated.push(`${story.story_type}: "${parsed.headline}" (score: ${story.score})`);
        weeklyCounts[story.category] = (weeklyCounts[story.category] ?? 0) + 1;
        lastCategory = story.category;
      }
    } catch (e) {
      console.error(`Generation error for story ${story.id}:`, e);
      await supabase.from("content_stories").update({ status: "generation_failed" }).eq("id", story.id);
    }
  }

  return new Response(
    JSON.stringify({
      generated: generated.length,
      today_total: todayCount + generated.length,
      details: generated,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
