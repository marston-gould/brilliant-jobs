/**
 * refresh-city-stats — Edge Function
 * Refreshes city_pages table with aggregated job market stats every 6 hours.
 * 
 * Cron: every 6 hours
 * Triggered via pg_cron → net.http_post
 * 
 * What it does:
 * 1. Core stats: job count, median salary, remote_pct per city
 * 2. Hook pills: top_titles (normalized), top_skills, top_industries, top_companies
 * 3. Auto-generates meta_title/meta_description
 * 4. Upserts all data into city_pages
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createLogger } from '../_shared/logger.ts';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const sb = createClient(SB_URL, SB_KEY);

// ── Seniority prefixes to strip for title normalization ──
const SENIORITY_PREFIXES = [
  'senior ', 'sr ', 'sr. ', 'staff ', 'principal ', 'lead ', 'junior ',
  'jr ', 'jr. ', 'associate ', 'entry level ', 'intern ', 'head of ',
  'director of ', 'vp of ', 'vice president of '
];

function normalizeTitle(title: string): string {
  let t = title.trim().toLowerCase();
  for (const prefix of SENIORITY_PREFIXES) {
    if (t.startsWith(prefix)) {
      t = t.slice(prefix.length);
      break; // Only strip one prefix
    }
  }
  // Title case
  return t.replace(/\b\w/g, c => c.toUpperCase()).trim();
}

Deno.serve(async (req) => {
  const logger = createLogger('refresh-city-stats', crypto.randomUUID());
  const startTime = Date.now();

  try {
    logger.info('Starting city stats refresh');

    // ── Step 1: Core stats ──
    const { error: coreErr } = await sb.rpc('exec_sql', {
      query: `
        WITH city_stats AS (
          SELECT
            LOWER(REPLACE(REPLACE(TRIM(loc_city), ' ', '-'), '.', '')) AS slug,
            INITCAP(TRIM(loc_city)) AS city_name,
            loc_state AS state,
            COUNT(*) AS job_count,
            PERCENTILE_CONT(0.5) WITHIN GROUP
              (ORDER BY (COALESCE(salary_min,0)+COALESCE(salary_max,0))/2)
              FILTER (WHERE salary_min IS NOT NULL AND salary_min > 0) AS median_salary,
            ROUND(100.0 * COUNT(*) FILTER (WHERE loc_type = 'remote' OR is_remote = true) / NULLIF(COUNT(*), 0), 1) AS remote_pct
          FROM ats_jobs
          WHERE status = 'open' AND loc_city IS NOT NULL AND TRIM(loc_city) != ''
          GROUP BY TRIM(loc_city), loc_state
          HAVING COUNT(*) >= 10
        ),
        deduped AS (
          SELECT DISTINCT ON (slug)
            slug, city_name, state,
            SUM(job_count) OVER (PARTITION BY slug) AS job_count,
            median_salary, remote_pct
          FROM city_stats
          ORDER BY slug, job_count DESC
        )
        INSERT INTO city_pages (slug, city_name, state, job_count, median_salary, remote_pct, stats_updated_at)
        SELECT slug, city_name, state, job_count, median_salary::int, remote_pct, now()
        FROM deduped
        ON CONFLICT (slug) DO UPDATE SET
          job_count = EXCLUDED.job_count,
          median_salary = EXCLUDED.median_salary,
          remote_pct = EXCLUDED.remote_pct,
          stats_updated_at = now()
      `
    });
    if (coreErr) {
      logger.error('Core stats failed', { error: coreErr.message });
    } else {
      logger.info('Core stats upserted');
    }

    // ── Step 2: Top companies ──
    const { error: compErr } = await sb.rpc('exec_sql', {
      query: `
        WITH top_cities AS (
          SELECT slug FROM city_pages ORDER BY job_count DESC LIMIT 200
        ),
        company_counts AS (
          SELECT tc.slug, aj.company_name, aj.company_slug, COUNT(*) AS cnt
          FROM ats_jobs aj
          JOIN top_cities tc ON LOWER(REPLACE(REPLACE(TRIM(aj.loc_city), ' ', '-'), '.', '')) = tc.slug
          WHERE aj.status = 'open' AND aj.company_name IS NOT NULL
          GROUP BY tc.slug, aj.company_name, aj.company_slug
          HAVING COUNT(*) >= 2
        ),
        ranked AS (
          SELECT slug, company_name, company_slug, cnt,
            ROW_NUMBER() OVER (PARTITION BY slug ORDER BY cnt DESC) AS rn
          FROM company_counts
        )
        UPDATE city_pages cp SET top_companies = sub.companies
        FROM (
          SELECT slug, jsonb_agg(jsonb_build_object('name', company_name, 'slug', company_slug, 'count', cnt) ORDER BY cnt DESC) AS companies
          FROM ranked WHERE rn <= 15
          GROUP BY slug
        ) sub
        WHERE cp.slug = sub.slug
      `
    });
    if (compErr) logger.warn('Top companies failed', { error: compErr.message });
    else logger.info('Top companies updated');

    // ── Step 3: Top titles ──
    const { error: titleErr } = await sb.rpc('exec_sql', {
      query: `
        WITH top_cities AS (
          SELECT slug FROM city_pages ORDER BY job_count DESC LIMIT 200
        ),
        title_counts AS (
          SELECT tc.slug, INITCAP(TRIM(aj.title)) AS title, COUNT(*) AS cnt
          FROM ats_jobs aj
          JOIN top_cities tc ON LOWER(REPLACE(REPLACE(TRIM(aj.loc_city), ' ', '-'), '.', '')) = tc.slug
          WHERE aj.status = 'open' AND aj.title IS NOT NULL AND TRIM(aj.title) != ''
          GROUP BY tc.slug, TRIM(aj.title)
          HAVING COUNT(*) >= 3
        ),
        ranked AS (
          SELECT slug, title, cnt,
            ROW_NUMBER() OVER (PARTITION BY slug ORDER BY cnt DESC) AS rn
          FROM title_counts
        )
        UPDATE city_pages cp SET top_titles = sub.titles
        FROM (
          SELECT slug, jsonb_agg(jsonb_build_object('title', title, 'count', cnt) ORDER BY cnt DESC) AS titles
          FROM ranked WHERE rn <= 15
          GROUP BY slug
        ) sub
        WHERE cp.slug = sub.slug
      `
    });
    if (titleErr) logger.warn('Top titles failed', { error: titleErr.message });
    else logger.info('Top titles updated');

    // ── Step 4: Top skills ──
    const { error: skillErr } = await sb.rpc('exec_sql', {
      query: `
        WITH top_cities AS (
          SELECT slug, job_count FROM city_pages ORDER BY job_count DESC LIMIT 200
        ),
        all_skills AS (
          SELECT tc.slug, tc.job_count AS city_total, INITCAP(skill) AS skill
          FROM ats_jobs aj
          JOIN top_cities tc ON LOWER(REPLACE(REPLACE(TRIM(aj.loc_city), ' ', '-'), '.', '')) = tc.slug
          CROSS JOIN LATERAL unnest(COALESCE(aj.jd_skills, aj.extracted_skills)) AS skill
          WHERE aj.status = 'open'
        ),
        skill_counts AS (
          SELECT slug, city_total, skill, COUNT(*) AS cnt
          FROM all_skills WHERE skill IS NOT NULL AND LENGTH(skill) >= 2
          GROUP BY slug, city_total, skill
          HAVING COUNT(*) >= 5
        ),
        ranked AS (
          SELECT slug, skill, cnt,
            ROUND(100.0 * cnt / NULLIF(city_total, 0), 1) AS pct,
            ROW_NUMBER() OVER (PARTITION BY slug ORDER BY cnt DESC) AS rn
          FROM skill_counts
        )
        UPDATE city_pages cp SET top_skills = sub.skills
        FROM (
          SELECT slug, jsonb_agg(jsonb_build_object('skill', skill, 'count', cnt, 'pct', pct) ORDER BY cnt DESC) AS skills
          FROM ranked WHERE rn <= 15
          GROUP BY slug
        ) sub
        WHERE cp.slug = sub.slug
      `
    });
    if (skillErr) logger.warn('Top skills failed', { error: skillErr.message });
    else logger.info('Top skills updated');

    // ── Step 5: Top industries ──
    const { error: indErr } = await sb.rpc('exec_sql', {
      query: `
        WITH top_cities AS (
          SELECT slug FROM city_pages ORDER BY job_count DESC LIMIT 200
        ),
        industry_counts AS (
          SELECT tc.slug, aj.industry, COUNT(*) AS cnt
          FROM ats_jobs aj
          JOIN top_cities tc ON LOWER(REPLACE(REPLACE(TRIM(aj.loc_city), ' ', '-'), '.', '')) = tc.slug
          WHERE aj.status = 'open' AND aj.industry IS NOT NULL AND TRIM(aj.industry) != ''
          GROUP BY tc.slug, aj.industry
          HAVING COUNT(*) >= 3
        ),
        ranked AS (
          SELECT slug, industry, cnt,
            ROW_NUMBER() OVER (PARTITION BY slug ORDER BY cnt DESC) AS rn
          FROM industry_counts
        )
        UPDATE city_pages cp SET top_industries = sub.industries
        FROM (
          SELECT slug, jsonb_agg(jsonb_build_object('industry', industry, 'count', cnt) ORDER BY cnt DESC) AS industries
          FROM ranked WHERE rn <= 10
          GROUP BY slug
        ) sub
        WHERE cp.slug = sub.slug
      `
    });
    if (indErr) logger.warn('Top industries failed', { error: indErr.message });
    else logger.info('Top industries updated');

    // ── Step 6: Auto-generate meta fields for new cities ──
    const { error: metaErr } = await sb.rpc('exec_sql', {
      query: `
        UPDATE city_pages SET
          meta_title = 'Jobs in ' || city_name || COALESCE(', ' || state, '') || ': ' || job_count || '+ Open Positions | Brilliant Jobs',
          meta_description = 'Browse ' || job_count || '+ open jobs in ' || city_name || '. See salary data, top hiring companies, and trending skills. Updated daily from direct career page data.'
        WHERE meta_title IS NULL OR stats_updated_at > now() - interval '1 minute'
      `
    });
    if (metaErr) logger.warn('Meta generation failed', { error: metaErr.message });

    const elapsed = Date.now() - startTime;
    logger.info('City stats refresh complete', { elapsed_ms: elapsed });

    return new Response(JSON.stringify({ status: 'ok', elapsed_ms: elapsed }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    logger.error('Refresh failed', { error: (err as Error).message });
    return new Response(JSON.stringify({ status: 'error', message: (err as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});
