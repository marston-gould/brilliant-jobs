// generate-editorial-content Edge Function
// Content Engine Phase 2B + Wave 4 (B1 Metro Comparison, B5 NY Fed Crossover)
// Takes pending content_stories and generates full article content via Claude API.
// Can be triggered manually or via pg_cron after detect-editorial-insights.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    // Template 1: Volume Spike (Keyword/Role)
    volume_spike: `Story type: volume_spike
Data provided: ${JSON.stringify(data)}

Write a 200-300 word article about this hiring volume change.
Headline formula: "{Role} Hiring {Up/Down} {X}% This Week"
Include: absolute numbers (not just %), top companies if available, salary context, remote availability.
Chart: Weekly volume bar chart (last 8 weeks) with the current week highlighted.
Link to: /trends/${(data.role as string || "").replace(/\s+/g, "-").toLowerCase()}`,

    // Template 2: Volume Spike (Location)
    metro_volume_spike: `Story type: volume_spike_location
Data provided: ${JSON.stringify(data)}

Write a 200-300 word article about this geographic hiring shift.
Headline formula: "{City} Job Market {Surging/Cooling} — {X}% Change This Week"
Include: absolute numbers, what roles are driving it, salary context, comparison to national average.
Chart: Weekly volume for this city (last 8 weeks).
Link to: /jobs-by-location`,

    // Template 5: Company Surge
    company_surge: `Story type: company_surge
Data provided: ${JSON.stringify(data)}

Write a 200-300 word article about this company's hiring activity.
Headline formula: "{Company} {Doubles/Triples} Hiring — {X} New Roles This Week"
Include: what roles they're hiring for, where, whether remote is available.
Do NOT speculate about why they're hiring.
Chart: Company weekly posting volume (last 8 weeks).
Link to: /company/${(data.company as string || "").replace(/\s+/g, "-").toLowerCase()}`,

    // Template 6: Metro Crossover (B1)
    metro_crossover: `Story type: metro_crossover
Data provided: ${JSON.stringify(data)}

Write a 200-300 word article about this geographic ranking change.
Headline formula: "{City A} Surpasses {City B} in Job Postings"
Include: both cities' numbers, salary comparison between the two.
Chart: Dual-line chart showing both cities' weekly volume (last 12 weeks).
Link to: /jobs-by-location`,

    // Template: Metro Comparison (B1 salary variant)
    metro_comparison: `Story type: metro_comparison
Data provided: ${JSON.stringify(data)}

Write a 200-300 word article about this salary differential between two metro areas.
Headline formula: "{City A} Jobs Pay {X}% More Than {City B}"
Include: both cities' job counts, salary medians, what roles drive the gap.
Chart: Side-by-side bar chart comparing job volume and median salary.
Link to: /jobs-by-location`,

    // Template 7: New Entrant
    new_entrant: `Story type: new_entrant
Data provided: ${JSON.stringify(data)}

Write a 150-250 word article about this company entering the hiring market.
Headline formula: "{Company} Enters the Hiring Market with {X} Openings"
Include: what they're hiring for, where, salary range if available.
Keep it factual — no speculation about growth or funding.
Chart: None (not enough historical data). Use a stat card instead — generate chart_config as a simple gauge or number display.
Link to: signup CTA`,

    // Template 11: NY Fed Quarterly Update (B5)
    nyfed_quarterly: `Story type: nyfed_quarterly
Data provided: ${JSON.stringify(data)}

Write a 250-350 word article about the latest NY Fed College Labor Market data cross-referenced with Brilliant Jobs hiring data.
Headline formula: "Recent Graduate Underemployment at {X}% — Meanwhile, {Y}K+ Positions Open"
Include: NY Fed underemployment rate, median wage data, total open positions on Brilliant Jobs, the contrast between backward-looking survey data and real-time hiring demand.
Note: This data comes from the Federal Reserve Bank of New York College Labor Market series.
Chart: Dual-axis chart — NY Fed unemployment/underemployment line + BJ job volume bars.
Link to: /college-major-outcomes`,

    // Template 12: Major Spotlight (B5)
    nyfed_major_spotlight: `Story type: nyfed_major_spotlight
Data provided: ${JSON.stringify(data)}

Write a 200-300 word article spotlighting this college major's employment outcomes.
Headline formula: "{Major} Grads: {X} Open Positions Paying ${Y}K"
Include: NY Fed metrics (underemployment, median wage) alongside BJ live data (open positions, median posted salary, remote %).
Chart: Split view — NY Fed metrics left, BJ live metrics right.
Link to: /college-major-outcomes`,

    // Template 13: Salary Divergence (B5)
    nyfed_salary_divergence: `Story type: nyfed_salary_divergence
Data provided: ${JSON.stringify(data)}

Write a 200-300 word article about the gap between posted salaries on Brilliant Jobs and the NY Fed's reported median for this field.
Headline formula: "Posted {Major} Salaries {X}% {Above/Below} the NY Fed Reported Median"
Include: both numbers (BJ median vs NY Fed median), sample size, note that BJ data reflects current postings while NY Fed reflects historical survey data.
Chart: Comparison bar chart showing NY Fed median vs BJ posted median.
Link to: /college-major-outcomes`,

    // Template 14: College Premium (B5)
    nyfed_college_premium: `Story type: nyfed_college_premium
Data provided: ${JSON.stringify(data)}

Write a 200-300 word article about the wage premium of a bachelor's degree vs high school diploma.
Headline formula: "College Premium Holds: BA Median ${X}K vs HS $40K — {Y}% Gap"
Include: the dollar amounts, the percentage gap, how this has trended over time.
Note this data is from the Federal Reserve Bank of New York.
Chart: 35-year line chart of BA median vs HS median.
Link to: /college-major-outcomes`,

    // Template 15: Underemployment × Hiring (B5)
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get pending stories that need content generation
    const { data: pendingStories, error: fetchErr } = await supabase
      .from("content_stories")
      .select("*")
      .eq("status", "pending")
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

    const results: Array<{ id: number; story_type: string; status: string }> = [];

    for (const story of pendingStories) {
      try {
        const templatePrompt = getTemplatePrompt(
          story.story_type,
          story.data_points as Record<string, unknown>
        );

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
          // Strip markdown fences if present
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

        // Generate slug from headline
        const headline = (generated.headline as string) || story.headline;
        const slug = headline
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, "")
          .replace(/\s+/g, "-")
          .replace(/-+/g, "-")
          .slice(0, 80);

        // Update the story with generated content
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
            status: "published",
            published_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", story.id);

        if (updateErr) {
          console.error(`Update error for story ${story.id}:`, updateErr);
          results.push({ id: story.id, story_type: story.story_type, status: "update_error" });
        } else {
          results.push({ id: story.id, story_type: story.story_type, status: "published" });
        }
      } catch (storyErr) {
        console.error(`Error processing story ${story.id}:`, storyErr);
        results.push({
          id: story.id,
          story_type: story.story_type,
          status: "error",
        });
      }
    }

    return new Response(
      JSON.stringify({
        processed: results.length,
        published: results.filter((r) => r.status === "published").length,
        errors: results.filter((r) => r.status !== "published").length,
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
