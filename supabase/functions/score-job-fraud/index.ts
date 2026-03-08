// score-job-fraud Edge Function
// Version: v6.30 — Phase 1 Fake Job Posting Detection
// Trigger: Called by refresh-jobs after batch upsert, or manually for backfill
// Batch size: up to 100 jobs per invocation
// Fallback: On failure, sets fraud_label = 'unknown', never blocks job insertion

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// --- Suspicious keyword lists (derived from EMSCAD research) ---
const HIGH_FRAUD_KEYWORDS = [
  "wire transfer", "processing fee", "unlimited income", "be your own boss",
  "guaranteed income", "no experience needed", "work from home earn",
  "cash advance", "money order", "western union", "moneygram",
  "personal bank account", "upfront fee", "registration fee",
  "advance fee", "secret shopper", "mystery shopper",
  "package forwarding", "reshipping", "money mule",
];

const MEDIUM_FRAUD_KEYWORDS = [
  "earn cash", "immediate start", "apply now link",
  "click here apply", "urgent hiring", "easy money",
  "make money fast", "weekly pay guaranteed", "no interview",
  "start immediately", "no resume needed", "just send email",
];

// ATS trust levels — enterprise ATS platforms have higher trust
const ATS_TRUST: Record<string, number> = {
  greenhouse: 0.95,
  lever: 0.90,
  ashby: 0.90,
  workable: 0.80,
  recruitee: 0.75,
  usajobs: 0.99, // Government jobs
  smartrecruiters: 0.80,
  jobvite: 0.80,
  icims: 0.85,
  bamboohr: 0.80,
};

interface JobRow {
  greenhouse_id: string;
  ats_source: string;
  title: string | null;
  content: string | null;
  employment_type: string | null;
  salary_min: number | null;
  salary_max: number | null;
  loc_city: string | null;
  loc_state: string | null;
  loc_country: string | null;
  company_slug: string | null;
  company_name: string | null;
  jd_skills: string[] | null;
  jd_education: string | null;
  jd_requirements: string | null;
  jd_seniority: string | null;
  first_seen_at: string | null;
  is_remote: boolean | null;
}

interface CompanyRow {
  slug: string;
  source: string;
  name: string | null;
  website: string | null;
  industry: string | null;
  ref_company_id: string | null;
  job_count: number | null;
}

interface Signal {
  feature: string;
  weight: number;
  human: string;
  positive: boolean;
}

interface ScoreResult {
  score: number;
  signals: Signal[];
}

// --- HTML stripping ---
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// --- Feature extraction ---
function extractFeatures(job: JobRow, company: CompanyRow | null) {
  const rawContent = job.content || "";
  const plainText = stripHtml(rawContent).toLowerCase();
  const titleLower = (job.title || "").toLowerCase();

  // Count suspicious keywords
  let highFraudCount = 0;
  const highFraudMatches: string[] = [];
  for (const kw of HIGH_FRAUD_KEYWORDS) {
    if (plainText.includes(kw) || titleLower.includes(kw)) {
      highFraudCount++;
      highFraudMatches.push(kw);
    }
  }

  let medFraudCount = 0;
  const medFraudMatches: string[] = [];
  for (const kw of MEDIUM_FRAUD_KEYWORDS) {
    if (plainText.includes(kw) || titleLower.includes(kw)) {
      medFraudCount++;
      medFraudMatches.push(kw);
    }
  }

  return {
    // Content signals
    descriptionLength: plainText.length,
    hasDescription: plainText.length > 50,
    hasRequirements:
      plainText.includes("requirements") ||
      plainText.includes("qualifications") ||
      plainText.includes("must have") ||
      plainText.includes("you will") ||
      !!(job.jd_requirements && job.jd_requirements.length > 10),
    hasSkills: !!(job.jd_skills && job.jd_skills.length > 0),
    hasEducation: !!(job.jd_education && job.jd_education.length > 0),

    // Salary signals
    hasSalary: !!(job.salary_min || job.salary_max),
    salaryMin: job.salary_min || 0,
    salaryMax: job.salary_max || 0,

    // Location signals
    hasLocation: !!(job.loc_city || job.loc_state || job.is_remote),

    // Employment type
    hasEmploymentType: !!job.employment_type,
    employmentType: job.employment_type || "unknown",

    // Company signals
    hasCompanyName: !!(job.company_name && job.company_name.length > 1),
    hasCompanyWebsite: !!company?.website,
    hasCompanyIndustry: !!company?.industry,
    hasPdlMatch: !!company?.ref_company_id,
    companyJobCount: company?.job_count || 0,

    // ATS trust
    atsSource: job.ats_source,
    atsTrustLevel: ATS_TRUST[job.ats_source] || 0.50,

    // Fraud keyword signals
    highFraudKeywordCount: highFraudCount,
    medFraudKeywordCount: medFraudCount,
    highFraudMatches,
    medFraudMatches,

    // Text quality signals
    hasExcessiveCaps:
      rawContent.length > 100
        ? (rawContent.match(/[A-Z]/g) || []).length / rawContent.length > 0.4
        : false,
    hasExcessiveExclamation: (plainText.match(/!/g) || []).length > 5,
    hasSeniority: !!(job.jd_seniority || job.title?.match(/senior|junior|lead|principal|staff|intern|entry/i)),
  };
}

// --- Heuristic scoring engine ---
// Produces a fraud probability between 0 (safe) and 1 (suspicious)
// Based on weighted signals derived from EMSCAD feature importance analysis
function scoreJob(features: ReturnType<typeof extractFeatures>): ScoreResult {
  const signals: Signal[] = [];
  let riskScore = 0;
  let maxPossibleRisk = 0;

  // === POSITIVE SIGNALS (reduce fraud risk) ===

  // ATS trust (weight: 0.20)
  const atsTrust = features.atsTrustLevel;
  const atsRisk = (1 - atsTrust) * 0.20;
  maxPossibleRisk += 0.20;
  riskScore += atsRisk;
  if (atsTrust >= 0.85) {
    signals.push({ feature: "trusted_ats", weight: 0.20, human: `Posted via ${features.atsSource} (trusted ATS)`, positive: true });
  } else if (atsTrust < 0.60) {
    signals.push({ feature: "unknown_ats", weight: 0.20, human: "Unknown or low-trust posting source", positive: false });
  }

  // Company verification (weight: 0.15)
  maxPossibleRisk += 0.15;
  if (features.hasPdlMatch) {
    signals.push({ feature: "pdl_verified", weight: 0.15, human: "Company verified in database", positive: true });
  } else {
    riskScore += 0.08;
    if (!features.hasCompanyWebsite) {
      riskScore += 0.07;
      signals.push({ feature: "no_company_verification", weight: 0.15, human: "Company not verified", positive: false });
    }
  }

  // Salary information (weight: 0.10)
  maxPossibleRisk += 0.10;
  if (features.hasSalary) {
    signals.push({ feature: "salary_provided", weight: 0.10, human: "Salary range provided", positive: true });
    // Check for unrealistic salary
    if (features.salaryMax > 500000 || (features.salaryMax > 0 && features.salaryMin > 0 && features.salaryMax / features.salaryMin > 5)) {
      riskScore += 0.08;
      signals.push({ feature: "unrealistic_salary", weight: 0.08, human: "Unrealistic salary claims", positive: false });
    }
  } else {
    riskScore += 0.06;
    signals.push({ feature: "no_salary", weight: 0.10, human: "No salary information", positive: false });
  }

  // Description quality (weight: 0.15)
  maxPossibleRisk += 0.15;
  if (features.descriptionLength < 100) {
    riskScore += 0.12;
    signals.push({ feature: "very_short_description", weight: 0.12, human: "Very short job description", positive: false });
  } else if (features.descriptionLength < 300) {
    riskScore += 0.06;
    signals.push({ feature: "short_description", weight: 0.06, human: "Description shorter than average", positive: false });
  } else {
    signals.push({ feature: "detailed_description", weight: 0.15, human: "Detailed job description", positive: true });
  }

  // Requirements listed (weight: 0.08)
  maxPossibleRisk += 0.08;
  if (features.hasRequirements) {
    signals.push({ feature: "has_requirements", weight: 0.08, human: "Specific requirements listed", positive: true });
  } else {
    riskScore += 0.06;
    signals.push({ feature: "missing_requirements", weight: 0.06, human: "No specific requirements listed", positive: false });
  }

  // Location (weight: 0.05)
  maxPossibleRisk += 0.05;
  if (!features.hasLocation) {
    riskScore += 0.04;
    signals.push({ feature: "no_location", weight: 0.04, human: "No location specified", positive: false });
  }

  // === NEGATIVE SIGNALS (increase fraud risk) ===

  // High-fraud keywords (weight: 0.25 — highest signal)
  maxPossibleRisk += 0.25;
  if (features.highFraudKeywordCount > 0) {
    const kwRisk = Math.min(0.25, features.highFraudKeywordCount * 0.10);
    riskScore += kwRisk;
    signals.push({
      feature: "high_fraud_keywords",
      weight: kwRisk,
      human: `Contains suspicious keywords: ${features.highFraudMatches.slice(0, 3).join(", ")}`,
      positive: false,
    });
  }

  // Medium-fraud keywords (weight: 0.10)
  maxPossibleRisk += 0.10;
  if (features.medFraudKeywordCount > 0) {
    const kwRisk = Math.min(0.10, features.medFraudKeywordCount * 0.04);
    riskScore += kwRisk;
    signals.push({
      feature: "med_fraud_keywords",
      weight: kwRisk,
      human: `Contains cautionary keywords: ${features.medFraudMatches.slice(0, 3).join(", ")}`,
      positive: false,
    });
  }

  // Excessive caps (weight: 0.05)
  if (features.hasExcessiveCaps) {
    riskScore += 0.05;
    maxPossibleRisk += 0.05;
    signals.push({ feature: "excessive_caps", weight: 0.05, human: "Excessive use of capital letters", positive: false });
  }

  // Excessive exclamation (weight: 0.03)
  if (features.hasExcessiveExclamation) {
    riskScore += 0.03;
    maxPossibleRisk += 0.03;
    signals.push({ feature: "excessive_exclamation", weight: 0.03, human: "Excessive exclamation marks", positive: false });
  }

  // Company with many jobs = more trustworthy (weight: 0.05)
  maxPossibleRisk += 0.05;
  if (features.companyJobCount >= 10) {
    signals.push({ feature: "active_employer", weight: 0.05, human: `Company has ${features.companyJobCount}+ open positions`, positive: true });
  } else if (features.companyJobCount <= 1) {
    riskScore += 0.03;
  }

  // Normalize score to 0-1 range
  const normalizedScore = Math.min(1, Math.max(0, riskScore / Math.max(maxPossibleRisk, 0.01)));

  // Sort signals by weight descending, negatives first
  signals.sort((a, b) => {
    if (a.positive !== b.positive) return a.positive ? 1 : -1;
    return b.weight - a.weight;
  });

  return {
    score: Math.round(normalizedScore * 1000) / 1000, // 3 decimal places
    signals: signals.slice(0, 8), // Top 8 signals
  };
}

function getLabel(score: number): string {
  if (score < 0.300) return "safe";
  if (score < 0.650) return "caution";
  return "suspicious";
}

function getConfidence(score: number): number {
  // Confidence is higher when score is strongly safe or strongly suspicious
  // Lower confidence in the "caution" middle zone
  const distFromMiddle = Math.abs(score - 0.5);
  return Math.round(Math.min(1, 0.5 + distFromMiddle) * 1000) / 1000;
}

// --- Main handler ---
Deno.serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { job_ids, backfill_batch_size, backfill_offset } = await req.json();

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let jobsToScore: JobRow[] = [];

    if (backfill_batch_size && typeof backfill_offset === "number") {
      // Backfill mode: score jobs that don't have scores yet
      const { data, error } = await supabase
        .from("ats_jobs")
        .select(
          "greenhouse_id, ats_source, title, content, employment_type, salary_min, salary_max, loc_city, loc_state, loc_country, company_slug, company_name, jd_skills, jd_education, jd_requirements, jd_seniority, first_seen_at, is_remote"
        )
        .eq("status", "open")
        .range(backfill_offset, backfill_offset + backfill_batch_size - 1)
        .order("first_seen_at", { ascending: false });

      if (error) throw error;
      jobsToScore = (data || []) as JobRow[];
    } else if (job_ids && Array.isArray(job_ids)) {
      // Normal mode: score specific jobs by ID
      const ids = job_ids.map((j: Record<string, unknown>) => (typeof j === "string" ? j : j.job_id)).slice(0, 100);

      const { data, error } = await supabase
        .from("ats_jobs")
        .select(
          "greenhouse_id, ats_source, title, content, employment_type, salary_min, salary_max, loc_city, loc_state, loc_country, company_slug, company_name, jd_skills, jd_education, jd_requirements, jd_seniority, first_seen_at, is_remote"
        )
        .in("greenhouse_id", ids);

      if (error) throw error;
      jobsToScore = (data || []) as JobRow[];
    } else {
      return new Response(
        JSON.stringify({ error: "Provide job_ids array or backfill_batch_size + backfill_offset" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (jobsToScore.length === 0) {
      return new Response(
        JSON.stringify({ scored: 0, message: "No jobs to score" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch company data for all unique company slugs
    const companySlugs = [...new Set(jobsToScore.map((j) => j.company_slug).filter(Boolean))] as string[];
    let companyMap: Record<string, CompanyRow> = {};

    if (companySlugs.length > 0) {
      const { data: companies } = await supabase
        .from("ats_companies")
        .select("slug, source, name, website, industry, ref_company_id, job_count")
        .in("slug", companySlugs.slice(0, 200)); // Limit to avoid query size issues

      if (companies) {
        for (const c of companies as CompanyRow[]) {
          const key = `${c.slug}:${c.source}`;
          companyMap[key] = c;
        }
      }
    }

    // Score each job
    const scores = [];
    for (const job of jobsToScore) {
      try {
        const companyKey = `${job.company_slug}:${job.ats_source}`;
        const company = companyMap[companyKey] || null;
        const features = extractFeatures(job, company);
        const result = scoreJob(features);

        scores.push({
          job_id: job.greenhouse_id,
          ats_source: job.ats_source,
          fraud_score: result.score,
          fraud_label: getLabel(result.score),
          confidence: getConfidence(result.score),
          top_signals: { signals: result.signals.slice(0, 5) },
          model_version: "heuristic-v1.0",
          scored_at: new Date().toISOString(),
        });
      } catch (_e) {
        // On individual job failure, mark as unknown
        scores.push({
          job_id: job.greenhouse_id,
          ats_source: job.ats_source,
          fraud_score: 0.5,
          fraud_label: "unknown",
          confidence: 0.0,
          top_signals: { signals: [] },
          model_version: "heuristic-v1.0",
          scored_at: new Date().toISOString(),
        });
      }
    }

    // Upsert scores in batches of 50
    let upserted = 0;
    for (let i = 0; i < scores.length; i += 50) {
      const batch = scores.slice(i, i + 50);
      const { error } = await supabase
        .from("job_fraud_scores")
        .upsert(batch, { onConflict: "job_id,ats_source" });

      if (error) {
        console.error(`Upsert batch error at offset ${i}:`, error.message);
      } else {
        upserted += batch.length;
      }
    }

    // Summary stats
    const labelCounts = scores.reduce(
      (acc, s) => {
        acc[s.fraud_label] = (acc[s.fraud_label] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    return new Response(
      JSON.stringify({
        scored: scores.length,
        upserted,
        labels: labelCounts,
        model: "heuristic-v1.0",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("score-job-fraud error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
