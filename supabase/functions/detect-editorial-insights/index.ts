// detect-editorial-insights Edge Function
// Content Engine Phase 2B + Wave 4 (B1 Metro Comparison, B5 NY Fed Crossover)
// Runs daily via pg_cron. Detects anomalies in ats_jobs data, scores them, writes candidates to content_stories.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface DetectedAnomaly {
  story_type: string;
  category: string;
  data_points: Record<string, unknown>;
  score: number;
  headline: string;
}

// ─── Scoring Formula ───
// score = (magnitude × 0.30) + (breadth × 0.25) + (novelty × 0.20) + (recency × 0.15) + (shareability × 0.10)
function computeScore(factors: {
  magnitude: number;
  breadth: number;
  novelty: number;
  recency: number;
  shareability: number;
}): number {
  return Math.round(
    (factors.magnitude * 0.30 +
      factors.breadth * 0.25 +
      factors.novelty * 0.20 +
      factors.recency * 0.15 +
      factors.shareability * 0.10) * 100
  ) / 100;
}

function magnitudeScore(pctChange: number, threshold: number): number {
  const ratio = Math.abs(pctChange) / threshold;
  if (ratio >= 3) return 90;
  if (ratio >= 2) return 70;
  if (ratio >= 1.5) return 50;
  if (ratio >= 1) return 30;
  return 10;
}

const SHAREABILITY: Record<string, number> = {
  salary: 80,
  company: 70,
  remote: 70,
  location: 50,
  trend: 40,
  milestone: 90,
  nyfed: 85, // College major data is highly shareable
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const detected: DetectedAnomaly[] = [];
    const now = new Date();
    const today = now.toISOString().split("T")[0];

    // ─── Helper: Check dedup window ───
    async function isDuplicate(
      storyType: string,
      entityKey: string,
      windowDays: number
    ): Promise<boolean> {
      const since = new Date(now.getTime() - windowDays * 86400000).toISOString();
      const { data } = await supabase
        .from("content_stories")
        .select("id")
        .eq("story_type", storyType)
        .gte("created_at", since)
        .limit(1);

      if (!data || data.length === 0) return false;

      // Check if same entity in data_points
      const { data: stories } = await supabase
        .from("content_stories")
        .select("data_points")
        .eq("story_type", storyType)
        .gte("created_at", since);

      return (stories || []).some((s) => {
        const dp = s.data_points as Record<string, unknown>;
        return JSON.stringify(dp).includes(entityKey);
      });
    }

    // ─── Helper: Get novelty score ───
    async function noveltyScore(storyType: string): Promise<number> {
      const windows = [
        { days: 30, score: 10 },
        { days: 90, score: 40 },
        { days: 180, score: 70 },
      ];
      for (const w of windows) {
        const since = new Date(now.getTime() - w.days * 86400000).toISOString();
        const { count } = await supabase
          .from("content_stories")
          .select("*", { count: "exact", head: true })
          .eq("story_type", storyType)
          .gte("created_at", since);
        if ((count || 0) > 0) return w.score;
      }
      return 100; // Never reported before
    }

    // ═══════════════════════════════════════════════════════
    // RULE 1: Volume Spike (by role keyword)
    // Threshold: ±10% WoW AND absolute change ≥ 20 jobs
    // Min sample: 50 jobs in baseline week
    // Dedup: 7 days same keyword
    // ═══════════════════════════════════════════════════════
    {
      const { data: roleSnapshots } = await supabase
        .from("content_snapshots")
        .select("entity_slug, metrics")
        .eq("entity_type", "role")
        .eq("snapshot_date", today);

      for (const snap of roleSnapshots || []) {
        const m = snap.metrics as Record<string, number>;
        const current = m?.job_count || 0;
        const prior = m?.prior_week_count || m?.avg_prior || 0;
        if (prior < 50 || current < 50) continue;

        const pctChange = ((current - prior) / prior) * 100;
        const absChange = Math.abs(current - prior);

        if (Math.abs(pctChange) >= 10 && absChange >= 20) {
          if (await isDuplicate("volume_spike", snap.entity_slug, 7)) continue;

          const score = computeScore({
            magnitude: magnitudeScore(pctChange, 10),
            breadth: 40, // single role
            novelty: await noveltyScore("volume_spike"),
            recency: 100,
            shareability: SHAREABILITY.trend,
          });

          detected.push({
            story_type: "volume_spike",
            category: "trend",
            data_points: {
              role: snap.entity_slug,
              recent: current,
              avg_prior: prior,
              pct_change: Math.round(pctChange * 10) / 10,
              timeline: m?.timeline || [],
            },
            score,
            headline: `${snap.entity_slug.replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())} Hiring ${pctChange > 0 ? "Up" : "Down"} ${Math.abs(Math.round(pctChange))}% This Week`,
          });
        }
      }
    }

    // ═══════════════════════════════════════════════════════
    // RULE 2: Volume Spike (by location/metro)
    // Threshold: ±15% WoW AND absolute change ≥ 15 jobs
    // Min sample: 30 jobs in baseline week
    // Dedup: 7 days same location
    // ═══════════════════════════════════════════════════════
    {
      const { data: metroSnapshots } = await supabase
        .from("content_snapshots")
        .select("entity_slug, metrics")
        .eq("entity_type", "metro")
        .eq("snapshot_date", today);

      for (const snap of metroSnapshots || []) {
        const m = snap.metrics as Record<string, number>;
        const current = m?.job_count || 0;
        const prior = m?.prior_week_count || m?.avg_prior || 0;
        if (prior < 30 || current < 30) continue;

        const pctChange = ((current - prior) / prior) * 100;
        const absChange = Math.abs(current - prior);

        if (Math.abs(pctChange) >= 15 && absChange >= 15) {
          if (await isDuplicate("metro_volume_spike", snap.entity_slug, 7)) continue;

          const score = computeScore({
            magnitude: magnitudeScore(pctChange, 15),
            breadth: 40,
            novelty: await noveltyScore("metro_volume_spike"),
            recency: 100,
            shareability: SHAREABILITY.location,
          });

          detected.push({
            story_type: "metro_volume_spike",
            category: "location",
            data_points: {
              metro: snap.entity_slug,
              recent: current,
              avg_prior: prior,
              pct_change: Math.round(pctChange * 10) / 10,
            },
            score,
            headline: `${snap.entity_slug.replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())} Job Market ${pctChange > 0 ? "Surging" : "Cooling"} — ${Math.abs(Math.round(pctChange))}% Change This Week`,
          });
        }
      }
    }

    // ═══════════════════════════════════════════════════════
    // RULE 5: Company Surge
    // Threshold: 2x or more vs 30-day weekly average AND absolute ≥ 10 new jobs
    // Min sample: 5 jobs in 30-day baseline
    // Dedup: 14 days same company
    // ═══════════════════════════════════════════════════════
    {
      const { data: companySnapshots } = await supabase
        .from("content_snapshots")
        .select("entity_slug, metrics")
        .eq("entity_type", "company")
        .eq("snapshot_date", today);

      for (const snap of companySnapshots || []) {
        const m = snap.metrics as Record<string, number>;
        const current = m?.job_count || m?.current_week_count || 0;
        const avg = m?.avg_weekly_count || m?.avg_prior || 0;
        if (avg < 5 || current < 10) continue;

        const multiplier = current / avg;
        if (multiplier >= 2) {
          if (await isDuplicate("company_surge", snap.entity_slug, 14)) continue;

          const score = computeScore({
            magnitude: multiplier >= 3 ? 90 : 70,
            breadth: 20, // single company
            novelty: await noveltyScore("company_surge"),
            recency: 100,
            shareability: SHAREABILITY.company,
          });

          detected.push({
            story_type: "company_surge",
            category: "company",
            data_points: {
              company: snap.entity_slug,
              count: current,
              avg_weekly: avg,
              multiplier: Math.round(multiplier * 10) / 10,
            },
            score,
            headline: `${snap.entity_slug.replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())} ${multiplier >= 3 ? "Triples" : "Doubles"} Hiring — ${current} New Roles This Week`,
          });
        }
      }
    }

    // ═══════════════════════════════════════════════════════
    // RULE 7: New Entrant
    // Threshold: Company with 0 jobs in prior 30 days, now has ≥ 5
    // Dedup: 30 days same company
    // ═══════════════════════════════════════════════════════
    {
      const { data: newEntrants } = await supabase.rpc("detect_new_entrants").select("*");

      for (const entry of newEntrants || []) {
        if ((entry.current_count || 0) < 5) continue;
        if (await isDuplicate("new_entrant", entry.company_slug || entry.company, 30)) continue;

        const score = computeScore({
          magnitude: 50,
          breadth: 20,
          novelty: 100, // first time by definition
          recency: 100,
          shareability: SHAREABILITY.company,
        });

        detected.push({
          story_type: "new_entrant",
          category: "company",
          data_points: {
            company: entry.company_slug || entry.company,
            current_count: entry.current_count,
          },
          score,
          headline: `${(entry.company_slug || entry.company).replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())} Enters the Hiring Market with ${entry.current_count} Openings`,
        });
      }
    }

    // ═══════════════════════════════════════════════════════
    // RULE 6: Metro Crossover (B1 — NEW in Wave 4)
    // Threshold: City A overtakes City B in weekly job volume (top 20 rank change)
    // Also fires when salary differential changes 10%+ or volume ratio shifts 20%+
    // Min sample: Both cities ≥ 50 jobs
    // Dedup: 30 days same pair
    // ═══════════════════════════════════════════════════════
    {
      // Get all metro snapshots sorted by job count
      const { data: metros } = await supabase
        .from("content_snapshots")
        .select("entity_slug, metrics")
        .eq("entity_type", "metro")
        .eq("snapshot_date", today)
        .order("entity_slug");

      if (metros && metros.length >= 2) {
        // Build ranked list by current job count
        const ranked = metros
          .map((m) => ({
            slug: m.entity_slug,
            count: (m.metrics as Record<string, number>)?.job_count || 0,
            salary_median: (m.metrics as Record<string, number>)?.salary_median || 0,
            prior_count: (m.metrics as Record<string, number>)?.prior_week_count || (m.metrics as Record<string, number>)?.avg_prior || 0,
            prior_rank: (m.metrics as Record<string, number>)?.prior_rank || 0,
          }))
          .filter((m) => m.count >= 50)
          .sort((a, b) => b.count - a.count);

        // Check for rank changes in top 20
        for (let i = 0; i < Math.min(ranked.length, 20); i++) {
          const city = ranked[i];
          if (city.prior_rank && city.prior_rank > i + 1) {
            // This city moved up — find who it overtook
            const overtaken = ranked.find(
              (r) => r.prior_rank && r.prior_rank === i + 1 && r.slug !== city.slug
            );
            if (!overtaken) continue;

            const pairKey = [city.slug, overtaken.slug].sort().join("_vs_");
            if (await isDuplicate("metro_crossover", pairKey, 30)) continue;

            const salaryDiff = city.salary_median && overtaken.salary_median
              ? ((city.salary_median - overtaken.salary_median) / overtaken.salary_median) * 100
              : 0;

            const score = computeScore({
              magnitude: 70,
              breadth: 80, // multi-city
              novelty: await noveltyScore("metro_crossover"),
              recency: 100,
              shareability: SHAREABILITY.location,
            });

            detected.push({
              story_type: "metro_crossover",
              category: "location",
              data_points: {
                city_a: city.slug,
                city_b: overtaken.slug,
                city_a_count: city.count,
                city_b_count: overtaken.count,
                city_a_salary: city.salary_median,
                city_b_salary: overtaken.salary_median,
                salary_diff_pct: Math.round(salaryDiff * 10) / 10,
                role_or_all: "all",
              },
              score,
              headline: `${city.slug.replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())} Surpasses ${overtaken.slug.replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())} in Job Postings`,
            });
          }
        }

        // Also check for salary differential shifts (10%+) between adjacent metros
        for (let i = 0; i < ranked.length - 1; i++) {
          const a = ranked[i];
          const b = ranked[i + 1];
          if (!a.salary_median || !b.salary_median) continue;
          if (a.count < 50 || b.count < 50) continue;

          const pairKey = [a.slug, b.slug].sort().join("_salary_");
          if (await isDuplicate("metro_comparison", pairKey, 30)) continue;

          // We would need historical salary diff to detect 10%+ change
          // For now, detect when salary gap > 15% between adjacent-ranked metros
          const salaryGap = Math.abs(
            ((a.salary_median - b.salary_median) / b.salary_median) * 100
          );
          if (salaryGap >= 15) {
            const score = computeScore({
              magnitude: magnitudeScore(salaryGap, 10),
              breadth: 80,
              novelty: await noveltyScore("metro_comparison"),
              recency: 100,
              shareability: SHAREABILITY.salary,
            });

            detected.push({
              story_type: "metro_comparison",
              category: "salary",
              data_points: {
                city_a: a.slug,
                city_b: b.slug,
                city_a_count: a.count,
                city_b_count: b.count,
                city_a_salary: a.salary_median,
                city_b_salary: b.salary_median,
                salary_gap_pct: Math.round(salaryGap * 10) / 10,
              },
              score,
              headline: `${a.slug.replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())} Jobs Pay ${Math.round(salaryGap)}% More Than ${b.slug.replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}`,
            });
          }
        }
      }
    }

    // ═══════════════════════════════════════════════════════
    // RULE 11: NY Fed Quarterly Update (B5 — NEW in Wave 4)
    // Trigger: New NY Fed data detected (updated date changed)
    // Dedup: 90 days
    // ═══════════════════════════════════════════════════════
    {
      const { data: nyfedIndicators } = await supabase
        .from("economic_indicators")
        .select("series_id, indicator_name, value, unit, period_start, ingested_at")
        .eq("source", "nyfed");

      if (nyfedIndicators && nyfedIndicators.length > 0) {
        // Template 11: Quarterly Update — fires when data exists and hasn't been reported
        if (!(await isDuplicate("nyfed_quarterly", "nyfed_update", 90))) {
          const unemploymentRate = nyfedIndicators.find(
            (i) => i.series_id === "NYFED_UNDEREMPLOY_RECENT"
          );
          const medianWage = nyfedIndicators.find(
            (i) => i.series_id === "NYFED_MEDIAN_WAGE_RECENT"
          );

          if (unemploymentRate && medianWage) {
            // Get total open jobs from platform
            const { count: totalJobs } = await supabase
              .from("ats_jobs")
              .select("*", { count: "exact", head: true })
              .eq("status", "open");

            const score = computeScore({
              magnitude: 70,
              breadth: 100, // platform-wide
              novelty: await noveltyScore("nyfed_quarterly"),
              recency: 80,
              shareability: SHAREABILITY.nyfed,
            });

            // Scoring adjustments per spec: +20 novelty, +15 shareability
            const adjustedScore = Math.min(100, score + 5); // net effect of bonuses

            detected.push({
              story_type: "nyfed_quarterly",
              category: "trend",
              data_points: {
                underemployment_rate: unemploymentRate.value,
                median_wage: medianWage.value,
                total_open_jobs: totalJobs || 0,
                data_period: unemploymentRate.period_start,
                nyfed_indicators: nyfedIndicators.map((i) => ({
                  series: i.series_id,
                  value: i.value,
                  unit: i.unit,
                })),
              },
              score: adjustedScore,
              headline: `Recent Graduate Underemployment at ${unemploymentRate.value}% — Meanwhile, ${((totalJobs || 0) / 1000).toFixed(0)}K+ Positions Open`,
            });
          }
        }

        // Template 12: Major Spotlight (Monthly rotation)
        // Rotate through top majors monthly
        if (!(await isDuplicate("nyfed_major_spotlight", "major_spotlight", 30))) {
          const { data: majorCache } = await supabase
            .from("major_job_cache")
            .select("major_category, open_jobs, median_salary, remote_pct")
            .order("open_jobs", { ascending: false })
            .limit(10);

          if (majorCache && majorCache.length > 0) {
            // Pick major based on month rotation
            const monthIndex = now.getMonth() % (majorCache.length || 1);
            const spotlight = majorCache[monthIndex];

            const unemploymentRate = nyfedIndicators.find(
              (i) => i.series_id === "NYFED_UNDEREMPLOY_RECENT"
            );

            const score = computeScore({
              magnitude: 60,
              breadth: 60, // single industry/major
              novelty: await noveltyScore("nyfed_major_spotlight"),
              recency: 80,
              shareability: SHAREABILITY.nyfed,
            });

            detected.push({
              story_type: "nyfed_major_spotlight",
              category: "trend",
              data_points: {
                major: spotlight.major_category,
                open_jobs: spotlight.open_jobs,
                median_salary: spotlight.median_salary,
                remote_pct: spotlight.remote_pct,
                underemployment_rate: unemploymentRate?.value || null,
                nyfed_wage: nyfedIndicators.find(
                  (i) => i.series_id === "NYFED_MEDIAN_WAGE_RECENT"
                )?.value,
              },
              score: Math.min(100, score + 5),
              headline: `${spotlight.major_category} Grads: ${spotlight.open_jobs} Open Positions Paying $${((spotlight.median_salary || 0) / 1000).toFixed(0)}K`,
            });
          }
        }

        // Template 13: Salary Divergence
        // Trigger: BJ median diverges from NY Fed median by >15% for any major
        if (!(await isDuplicate("nyfed_salary_divergence", "salary_diverge", 30))) {
          const nyfedMedianWage = nyfedIndicators.find(
            (i) => i.series_id === "NYFED_MEDIAN_WAGE_RECENT"
          );

          if (nyfedMedianWage) {
            const { data: majorCache } = await supabase
              .from("major_job_cache")
              .select("major_category, median_salary, open_jobs")
              .not("median_salary", "is", null)
              .order("open_jobs", { ascending: false })
              .limit(15);

            for (const major of majorCache || []) {
              if (!major.median_salary || major.open_jobs < 20) continue;
              const nyfedVal = Number(nyfedMedianWage.value) || 60000;
              const divergence =
                ((major.median_salary - nyfedVal) / nyfedVal) * 100;

              if (Math.abs(divergence) >= 15) {
                const score = computeScore({
                  magnitude: magnitudeScore(divergence, 15),
                  breadth: 60,
                  novelty: await noveltyScore("nyfed_salary_divergence"),
                  recency: 80,
                  shareability: SHAREABILITY.nyfed,
                });

                detected.push({
                  story_type: "nyfed_salary_divergence",
                  category: "salary",
                  data_points: {
                    major: major.major_category,
                    bj_median: major.median_salary,
                    nyfed_median: nyfedVal,
                    divergence_pct: Math.round(divergence * 10) / 10,
                    open_jobs: major.open_jobs,
                  },
                  score: Math.min(100, score + 5),
                  headline: `Posted ${major.major_category} Salaries ${Math.round(Math.abs(divergence))}% ${divergence > 0 ? "Above" : "Below"} the NY Fed Reported Median`,
                });
                break; // Only report the most significant divergence
              }
            }
          }
        }

        // Template 14: College Premium (Annual — February only)
        if (now.getMonth() === 1 && !(await isDuplicate("nyfed_college_premium", "college_premium", 365))) {
          const medianWage = nyfedIndicators.find(
            (i) => i.series_id === "NYFED_MEDIAN_WAGE_RECENT"
          );

          if (medianWage) {
            const score = computeScore({
              magnitude: 60,
              breadth: 100,
              novelty: 100, // annual = always novel
              recency: 80,
              shareability: SHAREABILITY.nyfed,
            });

            detected.push({
              story_type: "nyfed_college_premium",
              category: "salary",
              data_points: {
                ba_median: Number(medianWage.value),
                // HS median from NY Fed is ~$40K
                hs_median: 40000,
                premium_pct: Math.round(
                  ((Number(medianWage.value) - 40000) / 40000) * 100
                ),
                year: now.getFullYear(),
              },
              score: Math.min(100, score + 5),
              headline: `College Premium Holds: BA Median $${(Number(medianWage.value) / 1000).toFixed(0)}K vs HS $40K — ${Math.round(((Number(medianWage.value) - 40000) / 40000) * 100)}% Gap`,
            });
          }
        }

        // Template 15: Underemployment × Hiring Reality
        // Trigger: Quarterly, paired with NY Fed update
        if (!(await isDuplicate("nyfed_underemploy_hiring", "underemploy_hiring", 90))) {
          const underemployRate = nyfedIndicators.find(
            (i) => i.series_id === "NYFED_UNDEREMPLOY_RECENT"
          );

          if (underemployRate) {
            // Find major with highest underemployment but also decent BJ job count
            const { data: majorCache } = await supabase
              .from("major_job_cache")
              .select("major_category, open_jobs, median_salary")
              .order("open_jobs", { ascending: false })
              .limit(15);

            // Pick Communications (52% underemployment) or the top major by job count
            const spotlightMajor =
              majorCache?.find((m) => m.major_category === "Communications") ||
              majorCache?.[0];

            if (spotlightMajor) {
              const score = computeScore({
                magnitude: 70,
                breadth: 100,
                novelty: await noveltyScore("nyfed_underemploy_hiring"),
                recency: 80,
                shareability: SHAREABILITY.nyfed,
              });

              detected.push({
                story_type: "nyfed_underemploy_hiring",
                category: "trend",
                data_points: {
                  major: spotlightMajor.major_category,
                  underemployment_rate: underemployRate.value,
                  open_jobs: spotlightMajor.open_jobs,
                  median_salary: spotlightMajor.median_salary,
                },
                score: Math.min(100, score + 5),
                headline: `${underemployRate.value}% of ${spotlightMajor.major_category} Grads Are Underemployed — But We Found ${spotlightMajor.open_jobs} Matching Jobs`,
              });
            }
          }
        }
      }
    }

    // ═══════════════════════════════════════════════════════
    // APPLY CATEGORY BALANCE + DAILY CAP
    // Max 2 stories per day published
    // Max 3 per category per week
    // No same-category back-to-back
    // ═══════════════════════════════════════════════════════

    // Sort by score descending
    detected.sort((a, b) => b.score - a.score);

    // Check today's already-published count
    const { count: publishedToday } = await supabase
      .from("content_stories")
      .select("*", { count: "exact", head: true })
      .gte("created_at", `${today}T00:00:00Z`)
      .in("status", ["published", "pending"]);

    const remainingSlots = Math.max(0, 2 - (publishedToday || 0));

    // Check weekly category counts
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1); // Monday
    const weekStartStr = weekStart.toISOString();

    const { data: weeklyStories } = await supabase
      .from("content_stories")
      .select("category")
      .gte("created_at", weekStartStr)
      .in("status", ["published", "pending"]);

    const categoryCounts: Record<string, number> = {};
    for (const s of weeklyStories || []) {
      categoryCounts[s.category] = (categoryCounts[s.category] || 0) + 1;
    }

    // Get last published category for back-to-back check
    const { data: lastStory } = await supabase
      .from("content_stories")
      .select("category")
      .in("status", ["published", "pending"])
      .order("created_at", { ascending: false })
      .limit(1);

    const lastCategory = lastStory?.[0]?.category;

    // Write all detected anomalies to content_stories
    let inserted = 0;
    for (const anomaly of detected) {
      // Determine status
      let status = "rejected";
      if (anomaly.score >= 60) {
        if (inserted < remainingSlots) {
          // Check category balance
          const catCount = categoryCounts[anomaly.category] || 0;
          if (catCount >= 3 && anomaly.story_type !== "milestone") {
            status = "held_balance";
          } else if (inserted === 0 && anomaly.category === lastCategory) {
            // Back-to-back same category — hold unless it's the only one
            if (detected.filter((d) => d.category !== lastCategory && d.score >= 60).length > 0) {
              status = "held_balance";
            } else {
              status = "pending";
              inserted++;
              categoryCounts[anomaly.category] = catCount + 1;
            }
          } else {
            status = "pending";
            inserted++;
            categoryCounts[anomaly.category] = catCount + 1;
          }
        } else {
          status = "queued"; // above threshold but daily cap reached
        }
      }

      await supabase.from("content_stories").insert({
        story_type: anomaly.story_type,
        category: anomaly.category,
        headline: anomaly.headline,
        data_points: anomaly.data_points,
        score: anomaly.score,
        status,
      });
    }

    return new Response(
      JSON.stringify({
        detected: detected.length,
        inserted,
        remaining_slots: remainingSlots - inserted,
        types: detected.map((d) => d.story_type),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Detection error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
