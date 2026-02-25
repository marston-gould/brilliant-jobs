import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface DetectedInsight {
  story_type: string;
  category: string;
  data_points: Record<string, unknown>;
  score: number;
  dedup_key: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const insights: DetectedInsight[] = [];
  const now = new Date();
  const today = now.toISOString().split("T")[0];

  // ──────────────────────────────────────────────
  // HELPER: Score calculation per editorial rules
  // ──────────────────────────────────────────────
  function calcScore(opts: {
    magnitude: number;     // 0-100
    breadth: number;       // 0-100
    novelty: number;       // 0-100
    recency: number;       // 0-100
    shareability: number;  // 0-100
  }): number {
    return (
      opts.magnitude * 0.30 +
      opts.breadth * 0.25 +
      opts.novelty * 0.20 +
      opts.recency * 0.15 +
      opts.shareability * 0.10
    );
  }

  // ──────────────────────────────────────────────
  // HELPER: Check dedup — has this been reported recently?
  // ──────────────────────────────────────────────
  async function isDuplicate(dedupKey: string, windowDays: number): Promise<boolean> {
    const cutoff = new Date(now.getTime() - windowDays * 86400000).toISOString();
    const { data } = await supabase
      .from("content_stories")
      .select("id")
      .eq("story_type", dedupKey.split(":")[0])
      .gte("created_at", cutoff)
      .like("data_points", `%${dedupKey.split(":").slice(1).join(":")}%`)
      .limit(1);
    return (data?.length ?? 0) > 0;
  }

  // ──────────────────────────────────────────────
  // HELPER: Novelty score based on recent stories
  // ──────────────────────────────────────────────
  async function noveltyScore(storyType: string, entitySlug: string): Promise<number> {
    const { data: recent30 } = await supabase
      .from("content_stories")
      .select("id")
      .eq("story_type", storyType)
      .gte("created_at", new Date(now.getTime() - 30 * 86400000).toISOString())
      .like("data_points", `%${entitySlug}%`)
      .limit(1);
    if (recent30?.length) return 10;
    
    const { data: recent90 } = await supabase
      .from("content_stories")
      .select("id")
      .eq("story_type", storyType)
      .gte("created_at", new Date(now.getTime() - 90 * 86400000).toISOString())
      .like("data_points", `%${entitySlug}%`)
      .limit(1);
    if (recent90?.length) return 40;

    const { data: recent180 } = await supabase
      .from("content_stories")
      .select("id")
      .eq("story_type", storyType)
      .gte("created_at", new Date(now.getTime() - 180 * 86400000).toISOString())
      .like("data_points", `%${entitySlug}%`)
      .limit(1);
    if (recent180?.length) return 70;

    return 100; // never reported
  }

  // ──────────────────────────────────────────────
  // RULE 1: Volume Spike (Role/Keyword) — ±10%, abs ≥ 20, min 50 baseline
  // ──────────────────────────────────────────────
  try {
    const { data: roleSnapshots } = await supabase
      .from("content_snapshots")
      .select("entity_slug, metrics, snapshot_date")
      .eq("entity_type", "role")
      .gte("snapshot_date", new Date(now.getTime() - 14 * 86400000).toISOString().split("T")[0])
      .order("snapshot_date", { ascending: false });

    if (roleSnapshots?.length) {
      // Group by slug, compare latest vs prior week
      const bySlug = new Map<string, Array<{ date: string; count: number }>>();
      for (const s of roleSnapshots) {
        const slug = s.entity_slug;
        if (!bySlug.has(slug)) bySlug.set(slug, []);
        bySlug.get(slug)!.push({
          date: s.snapshot_date,
          count: (s.metrics as any)?.job_count ?? 0,
        });
      }

      for (const [slug, snapshots] of bySlug) {
        if (snapshots.length < 2) continue;
        const current = snapshots[0].count;
        const prior = snapshots[1].count;
        if (prior < 50) continue; // min sample
        const pctChange = ((current - prior) / prior) * 100;
        const absChange = Math.abs(current - prior);
        if (Math.abs(pctChange) >= 10 && absChange >= 20) {
          const dedupKey = `volume_spike:${slug}`;
          if (await isDuplicate(dedupKey, 7)) continue;
          const nov = await noveltyScore("volume_spike", slug);
          const magScore = Math.min(100, 30 + (Math.abs(pctChange) / 10) * 20);
          insights.push({
            story_type: "volume_spike",
            category: "trend",
            data_points: {
              role: slug,
              current_week: current,
              prior_week: prior,
              pct_change: Math.round(pctChange * 10) / 10,
              abs_change: absChange,
              timeline: snapshots.slice(0, 8).reverse(),
            },
            score: calcScore({ magnitude: magScore, breadth: 40, novelty: nov, recency: 100, shareability: 40 }),
            dedup_key: dedupKey,
          });
        }
      }
    }
  } catch (e) { console.error("Rule 1 error:", e); }

  // ──────────────────────────────────────────────
  // RULE 2: Volume Spike (Location) — ±15%, abs ≥ 15, min 30 baseline
  // ──────────────────────────────────────────────
  try {
    const { data: metroSnapshots } = await supabase
      .from("content_snapshots")
      .select("entity_slug, metrics, snapshot_date")
      .eq("entity_type", "metro")
      .gte("snapshot_date", new Date(now.getTime() - 14 * 86400000).toISOString().split("T")[0])
      .order("snapshot_date", { ascending: false });

    if (metroSnapshots?.length) {
      const bySlug = new Map<string, Array<{ date: string; count: number; salary: number }>>();
      for (const s of metroSnapshots) {
        const slug = s.entity_slug;
        if (!bySlug.has(slug)) bySlug.set(slug, []);
        bySlug.get(slug)!.push({
          date: s.snapshot_date,
          count: (s.metrics as any)?.job_count ?? 0,
          salary: (s.metrics as any)?.median_salary ?? 0,
        });
      }

      for (const [slug, snapshots] of bySlug) {
        if (snapshots.length < 2) continue;
        const current = snapshots[0].count;
        const prior = snapshots[1].count;
        if (prior < 30) continue;
        const pctChange = ((current - prior) / prior) * 100;
        const absChange = Math.abs(current - prior);
        if (Math.abs(pctChange) >= 15 && absChange >= 15) {
          const dedupKey = `metro_volume_spike:${slug}`;
          if (await isDuplicate(dedupKey, 7)) continue;
          const nov = await noveltyScore("metro_volume_spike", slug);
          const magScore = Math.min(100, 30 + (Math.abs(pctChange) / 15) * 20);
          insights.push({
            story_type: "metro_volume_spike",
            category: "location",
            data_points: {
              city: slug,
              current_week: current,
              prior_week: prior,
              pct_change: Math.round(pctChange * 10) / 10,
              median_salary: snapshots[0].salary,
              timeline: snapshots.slice(0, 8).reverse(),
            },
            score: calcScore({ magnitude: magScore, breadth: 40, novelty: nov, recency: 100, shareability: 50 }),
            dedup_key: dedupKey,
          });
        }
      }
    }
  } catch (e) { console.error("Rule 2 error:", e); }

  // ──────────────────────────────────────────────
  // RULE 5: Company Surge — 2x avg weekly, abs ≥ 10
  // ──────────────────────────────────────────────
  try {
    const { data: companySnapshots } = await supabase
      .from("content_snapshots")
      .select("entity_slug, metrics, snapshot_date")
      .eq("entity_type", "company")
      .gte("snapshot_date", new Date(now.getTime() - 30 * 86400000).toISOString().split("T")[0])
      .order("snapshot_date", { ascending: false });

    if (companySnapshots?.length) {
      const bySlug = new Map<string, Array<{ date: string; count: number }>>();
      for (const s of companySnapshots) {
        const slug = s.entity_slug;
        if (!bySlug.has(slug)) bySlug.set(slug, []);
        bySlug.get(slug)!.push({
          date: s.snapshot_date,
          count: (s.metrics as any)?.job_count ?? 0,
        });
      }

      for (const [slug, snapshots] of bySlug) {
        if (snapshots.length < 2) continue;
        const current = snapshots[0].count;
        const priorCounts = snapshots.slice(1).map(s => s.count);
        const avg = priorCounts.reduce((a, b) => a + b, 0) / priorCounts.length;
        if (avg < 5) continue; // min baseline
        const multiplier = current / avg;
        if (multiplier >= 2 && current >= 10) {
          const dedupKey = `company_surge:${slug}`;
          if (await isDuplicate(dedupKey, 14)) continue;
          const nov = await noveltyScore("company_surge", slug);
          const magScore = Math.min(100, 50 + (multiplier - 2) * 20);
          insights.push({
            story_type: "company_surge",
            category: "company",
            data_points: {
              company: slug,
              current_week: current,
              avg_weekly: Math.round(avg),
              multiplier: Math.round(multiplier * 10) / 10,
            },
            score: calcScore({ magnitude: magScore, breadth: 20, novelty: nov, recency: 100, shareability: 70 }),
            dedup_key: dedupKey,
          });
        }
      }
    }
  } catch (e) { console.error("Rule 5 error:", e); }

  // ──────────────────────────────────────────────
  // RULE 7: New Entrant — 0 jobs in prior 30d, now ≥ 5
  // ──────────────────────────────────────────────
  try {
    const { data: newEntrants } = await supabase.rpc("detect_new_entrants").select("*");
    // Fallback: query directly if RPC doesn't exist
    if (!newEntrants) {
      // Direct query: companies with current jobs but no history
      const { data: recentCompanies } = await supabase
        .from("content_snapshots")
        .select("entity_slug, metrics")
        .eq("entity_type", "company")
        .eq("snapshot_date", today);

      if (recentCompanies) {
        for (const co of recentCompanies) {
          const count = (co.metrics as any)?.job_count ?? 0;
          if (count < 5) continue;
          // Check if they had jobs before
          const { data: prior } = await supabase
            .from("content_snapshots")
            .select("id")
            .eq("entity_type", "company")
            .eq("entity_slug", co.entity_slug)
            .lt("snapshot_date", today)
            .limit(1);
          if (prior?.length) continue; // had prior data — not new
          const dedupKey = `new_entrant:${co.entity_slug}`;
          if (await isDuplicate(dedupKey, 30)) continue;
          insights.push({
            story_type: "new_entrant",
            category: "company",
            data_points: {
              company: co.entity_slug,
              count,
              roles: (co.metrics as any)?.top_roles ?? [],
              locations: (co.metrics as any)?.locations ?? [],
            },
            score: calcScore({ magnitude: 60, breadth: 20, novelty: 100, recency: 100, shareability: 70 }),
            dedup_key: dedupKey,
          });
        }
      }
    }
  } catch (e) { console.error("Rule 7 error:", e); }

  // ──────────────────────────────────────────────
  // RULE 6 (B1): Metro Crossover — rank change in top 20
  // ──────────────────────────────────────────────
  try {
    const { data: metroData } = await supabase
      .from("content_snapshots")
      .select("entity_slug, metrics, snapshot_date")
      .eq("entity_type", "metro")
      .gte("snapshot_date", new Date(now.getTime() - 21 * 86400000).toISOString().split("T")[0])
      .order("snapshot_date", { ascending: false });

    if (metroData?.length) {
      // Get unique dates
      const dates = [...new Set(metroData.map(m => m.snapshot_date))].sort().reverse();
      if (dates.length >= 2) {
        const currentDate = dates[0];
        const priorDate = dates[1];
        const currentRanking = metroData
          .filter(m => m.snapshot_date === currentDate)
          .sort((a, b) => ((b.metrics as any)?.job_count ?? 0) - ((a.metrics as any)?.job_count ?? 0));
        const priorRanking = metroData
          .filter(m => m.snapshot_date === priorDate)
          .sort((a, b) => ((b.metrics as any)?.job_count ?? 0) - ((a.metrics as any)?.job_count ?? 0));

        // Check for rank swaps in top 20
        const currentRanks = new Map<string, number>();
        const priorRanks = new Map<string, number>();
        currentRanking.forEach((m, i) => currentRanks.set(m.entity_slug, i + 1));
        priorRanking.forEach((m, i) => priorRanks.set(m.entity_slug, i + 1));

        for (const [slug, currentRank] of currentRanks) {
          if (currentRank > 20) continue;
          const priorRank = priorRanks.get(slug);
          if (!priorRank || priorRank <= currentRank) continue;
          // This city moved up — find who it passed
          for (const [otherSlug, otherCurrent] of currentRanks) {
            if (otherSlug === slug) continue;
            const otherPrior = priorRanks.get(otherSlug);
            if (!otherPrior) continue;
            if (otherPrior < priorRank && otherCurrent > currentRank) {
              // slug overtook otherSlug
              const bothHaveMinJobs = ((currentRanking.find(m => m.entity_slug === slug)?.metrics as any)?.job_count ?? 0) >= 50 &&
                ((currentRanking.find(m => m.entity_slug === otherSlug)?.metrics as any)?.job_count ?? 0) >= 50;
              if (!bothHaveMinJobs) continue;

              const dedupKey = `metro_crossover:${slug}:${otherSlug}`;
              if (await isDuplicate(dedupKey, 30)) continue;
              const nov = await noveltyScore("metro_crossover", `${slug}:${otherSlug}`);

              const cityAData = currentRanking.find(m => m.entity_slug === slug);
              const cityBData = currentRanking.find(m => m.entity_slug === otherSlug);

              insights.push({
                story_type: "metro_crossover",
                category: "location",
                data_points: {
                  city_a: slug,
                  city_b: otherSlug,
                  city_a_count: (cityAData?.metrics as any)?.job_count ?? 0,
                  city_b_count: (cityBData?.metrics as any)?.job_count ?? 0,
                  city_a_rank: currentRank,
                  city_b_rank: otherCurrent,
                  city_a_prior_rank: priorRank,
                  city_b_prior_rank: otherPrior,
                  city_a_salary: (cityAData?.metrics as any)?.median_salary ?? 0,
                  city_b_salary: (cityBData?.metrics as any)?.median_salary ?? 0,
                },
                score: calcScore({ magnitude: 60, breadth: 80, novelty: nov, recency: 100, shareability: 50 }),
                dedup_key: dedupKey,
              });
            }
          }
        }
      }
    }
  } catch (e) { console.error("Rule 6 (metro crossover) error:", e); }

  // ──────────────────────────────────────────────
  // B5: NY Fed Crossover Stories
  // ──────────────────────────────────────────────

  // B5a: Major Spotlight — when BJ data diverges from NY Fed expectations
  try {
    const { data: majorCache } = await supabase
      .from("major_job_cache")
      .select("*");

    if (majorCache?.length) {
      // Reference NY Fed data (hardcoded from spec — same as A2 college page)
      const nyfedData: Record<string, { unemployment: number; underemployment: number; early_salary: number; mid_salary: number }> = {
        "Computer Science": { unemployment: 3.5, underemployment: 22, early_salary: 78000, mid_salary: 120000 },
        "Nursing": { unemployment: 1.3, underemployment: 10, early_salary: 62000, mid_salary: 82000 },
        "Finance": { unemployment: 3.8, underemployment: 25, early_salary: 60000, mid_salary: 105000 },
        "Marketing": { unemployment: 4.2, underemployment: 42, early_salary: 45000, mid_salary: 72000 },
        "Accounting": { unemployment: 3.0, underemployment: 28, early_salary: 55000, mid_salary: 85000 },
        "Mechanical Engineering": { unemployment: 3.2, underemployment: 18, early_salary: 72000, mid_salary: 105000 },
        "Electrical Engineering": { unemployment: 3.8, underemployment: 20, early_salary: 75000, mid_salary: 112000 },
        "Biology": { unemployment: 4.5, underemployment: 40, early_salary: 38000, mid_salary: 65000 },
        "Psychology": { unemployment: 4.0, underemployment: 48, early_salary: 35000, mid_salary: 60000 },
        "Business Management": { unemployment: 4.0, underemployment: 38, early_salary: 50000, mid_salary: 80000 },
        "Communications": { unemployment: 4.5, underemployment: 52, early_salary: 40000, mid_salary: 65000 },
        "Economics": { unemployment: 3.5, underemployment: 30, early_salary: 58000, mid_salary: 95000 },
        "Civil Engineering": { unemployment: 2.8, underemployment: 15, early_salary: 68000, mid_salary: 98000 },
        "Computer Engineering": { unemployment: 2.5, underemployment: 16, early_salary: 80000, mid_salary: 125000 },
        "Education": { unemployment: 2.0, underemployment: 15, early_salary: 38000, mid_salary: 55000 },
      };

      for (const major of majorCache) {
        const nyfed = nyfedData[major.major_category];
        if (!nyfed || !major.median_salary) continue;

        // Check salary divergence: BJ median vs NY Fed early career
        const salaryDelta = ((major.median_salary - nyfed.early_salary) / nyfed.early_salary) * 100;

        // Fire if posted salaries diverge > 15% from NY Fed median
        if (Math.abs(salaryDelta) >= 15 && major.open_jobs >= 10) {
          const dedupKey = `nyfed_salary_divergence:${major.major_category}`;
          if (await isDuplicate(dedupKey, 30)) continue;

          insights.push({
            story_type: "nyfed_salary_divergence",
            category: "salary",
            data_points: {
              major: major.major_category,
              bj_median_salary: major.median_salary,
              nyfed_early_salary: nyfed.early_salary,
              nyfed_mid_salary: nyfed.mid_salary,
              salary_delta_pct: Math.round(salaryDelta * 10) / 10,
              bj_open_jobs: major.open_jobs,
              bj_remote_pct: major.remote_pct,
              nyfed_unemployment: nyfed.unemployment,
              nyfed_underemployment: nyfed.underemployment,
            },
            score: calcScore({ magnitude: Math.min(100, 50 + Math.abs(salaryDelta)), breadth: 60, novelty: 100, recency: 80, shareability: 80 }),
            dedup_key: dedupKey,
          });
        }

        // Underemployment vs Hiring: high underemployment + high BJ job count = story
        if (nyfed.underemployment >= 35 && major.open_jobs >= 50) {
          const dedupKey = `nyfed_underemploy_hiring:${major.major_category}`;
          if (await isDuplicate(dedupKey, 30)) continue;

          insights.push({
            story_type: "nyfed_underemploy_hiring",
            category: "trend",
            data_points: {
              major: major.major_category,
              underemployment_rate: nyfed.underemployment,
              bj_open_jobs: major.open_jobs,
              bj_median_salary: major.median_salary,
              bj_remote_pct: major.remote_pct,
              nyfed_early_salary: nyfed.early_salary,
            },
            score: calcScore({ magnitude: 60, breadth: 60, novelty: 100, recency: 80, shareability: 70 }),
            dedup_key: dedupKey,
          });
        }
      }
    }
  } catch (e) { console.error("B5 NY Fed error:", e); }

  // ──────────────────────────────────────────────
  // B3: Economic Overlay Stories
  // ──────────────────────────────────────────────

  // B3a: Economic Divergence — when BJ hiring trends diverge from macro indicators
  try {
    // Get latest economic indicators
    const { data: econRecent } = await supabase
      .from("economic_indicators")
      .select("indicator_name, value, period_start, source")
      .order("period_start", { ascending: false })
      .limit(100);

    // Get platform-level job count trend
    const { data: platformSnapshot } = await supabase
      .from("content_snapshots")
      .select("metrics, snapshot_date")
      .eq("entity_type", "platform")
      .order("snapshot_date", { ascending: false })
      .limit(4);

    if (econRecent?.length && platformSnapshot?.length) {
      // Group econ by indicator
      const byIndicator = new Map<string, Array<{ value: number; period: string }>>();
      for (const e of econRecent) {
        const key = e.indicator_name;
        if (!byIndicator.has(key)) byIndicator.set(key, []);
        byIndicator.get(key)!.push({ value: Number(e.value), period: e.period_start });
      }

      // Check JOLTS vs BJ platform trend
      const jolts = byIndicator.get("JOLTS Job Openings") ?? byIndicator.get("JOLTS Job Openings (FRED)");
      if (jolts && jolts.length >= 2) {
        const joltsChange = ((jolts[0].value - jolts[1].value) / jolts[1].value) * 100;
        const bjJobs = (platformSnapshot[0]?.metrics as any)?.total_jobs ?? 0;
        const bjPrior = platformSnapshot.length > 1 ? (platformSnapshot[1]?.metrics as any)?.total_jobs ?? bjJobs : bjJobs;
        const bjChange = bjPrior > 0 ? ((bjJobs - bjPrior) / bjPrior) * 100 : 0;

        // Divergence: JOLTS going one way, BJ going the other by significant margin
        if (Math.sign(joltsChange) !== Math.sign(bjChange) && Math.abs(joltsChange - bjChange) >= 5) {
          const dedupKey = `econ_divergence:jolts`;
          if (!(await isDuplicate(dedupKey, 30))) {
            insights.push({
              story_type: "econ_divergence",
              category: "trend",
              data_points: {
                indicator: "JOLTS Job Openings",
                indicator_change_pct: Math.round(joltsChange * 10) / 10,
                indicator_latest: jolts[0].value,
                indicator_period: jolts[0].period,
                bj_total_jobs: bjJobs,
                bj_change_pct: Math.round(bjChange * 10) / 10,
                divergence: Math.round(Math.abs(joltsChange - bjChange) * 10) / 10,
              },
              score: calcScore({ magnitude: 70, breadth: 100, novelty: 100, recency: 80, shareability: 40 }),
              dedup_key: dedupKey,
            });
          }
        }
      }

      // Check unemployment rate milestones
      const unemployment = byIndicator.get("Unemployment Rate") ?? byIndicator.get("Unemployment Rate (FRED)");
      if (unemployment && unemployment.length >= 2) {
        const uChange = unemployment[0].value - unemployment[1].value;
        // Fire if unemployment changed by 0.3+ pp
        if (Math.abs(uChange) >= 0.3) {
          const dedupKey = `econ_inflection:unemployment`;
          if (!(await isDuplicate(dedupKey, 30))) {
            insights.push({
              story_type: "econ_inflection",
              category: "trend",
              data_points: {
                indicator: "Unemployment Rate",
                current_value: unemployment[0].value,
                prior_value: unemployment[1].value,
                change_pp: Math.round(uChange * 10) / 10,
                period: unemployment[0].period,
                bj_total_jobs: (platformSnapshot[0]?.metrics as any)?.total_jobs ?? 0,
              },
              score: calcScore({ magnitude: Math.min(100, 60 + Math.abs(uChange) * 40), breadth: 100, novelty: 100, recency: 80, shareability: 40 }),
              dedup_key: dedupKey,
            });
          }
        }
      }

      // Check Initial Jobless Claims for spikes
      const claims = byIndicator.get("Initial Jobless Claims");
      if (claims && claims.length >= 4) {
        const avg4w = claims.slice(1, 5).reduce((a, c) => a + c.value, 0) / Math.min(4, claims.length - 1);
        const latest = claims[0].value;
        const pctChange = ((latest - avg4w) / avg4w) * 100;
        if (Math.abs(pctChange) >= 10) {
          const dedupKey = `econ_inflection:claims`;
          if (!(await isDuplicate(dedupKey, 14))) {
            insights.push({
              story_type: "econ_inflection",
              category: "trend",
              data_points: {
                indicator: "Initial Jobless Claims",
                current_value: latest,
                avg_4w: Math.round(avg4w),
                pct_change: Math.round(pctChange * 10) / 10,
                period: claims[0].period,
              },
              score: calcScore({ magnitude: Math.min(100, 50 + Math.abs(pctChange)), breadth: 100, novelty: 70, recency: 100, shareability: 40 }),
              dedup_key: dedupKey,
            });
          }
        }
      }
    }
  } catch (e) { console.error("B3 economic overlay error:", e); }

  // ──────────────────────────────────────────────
  // RULE 8: Platform Milestone — every 50K jobs
  // ──────────────────────────────────────────────
  try {
    const { data: platform } = await supabase
      .from("content_snapshots")
      .select("metrics")
      .eq("entity_type", "platform")
      .order("snapshot_date", { ascending: false })
      .limit(1)
      .single();

    if (platform) {
      const totalJobs = (platform.metrics as any)?.total_jobs ?? 0;
      const milestone = Math.floor(totalJobs / 50000) * 50000;
      if (milestone >= 150000) {
        const dedupKey = `milestone:${milestone}`;
        const { data: existing } = await supabase
          .from("content_stories")
          .select("id")
          .eq("story_type", "milestone")
          .like("data_points", `%${milestone}%`)
          .limit(1);
        if (!existing?.length) {
          insights.push({
            story_type: "milestone",
            category: "milestone",
            data_points: {
              milestone_value: milestone,
              current_total: totalJobs,
              total_companies: (platform.metrics as any)?.total_companies ?? 0,
            },
            score: calcScore({ magnitude: 100, breadth: 100, novelty: 100, recency: 100, shareability: 90 }),
            dedup_key: dedupKey,
          });
        }
      }
    }
  } catch (e) { console.error("Rule 8 error:", e); }

  // ──────────────────────────────────────────────
  // INSERT all detected insights into content_stories (status = 'pending')
  // ──────────────────────────────────────────────
  const inserted: string[] = [];
  for (const insight of insights) {
    if (insight.score < 60) continue; // below publication threshold

    const { error } = await supabase.from("content_stories").insert({
      story_type: insight.story_type,
      category: insight.category,
      data_points: insight.data_points,
      score: insight.score,
      status: "pending",
    });

    if (!error) {
      inserted.push(`${insight.story_type} (score: ${insight.score.toFixed(1)})`);
    }
  }

  return new Response(
    JSON.stringify({
      detected: insights.length,
      above_threshold: insights.filter(i => i.score >= 60).length,
      inserted: inserted.length,
      details: inserted,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
