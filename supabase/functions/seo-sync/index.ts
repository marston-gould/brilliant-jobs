// supabase/functions/seo-sync/index.ts
// Daily SEO data sync — 9 tools
// Tasks: gsc_performance | gsc_inspect | psi | dataforseo | posthog | yellowlab | crux | knowledge_graph | cloudflare | all
// v3 — adds Yellow Labs, CrUX API, Knowledge Graph, Cloudflare bot analytics; PSI now collects all 4 categories

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const SB_URL  = Deno.env.get('SUPABASE_URL')!;
const SB_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GOOGLE_SA_KEY = Deno.env.get('GOOGLE_SA_KEY_JSON');
const GOOGLE_API_KEY = Deno.env.get('GOOGLE_API_KEY');
const DFS_LOGIN = Deno.env.get('DFS_LOGIN');
const DFS_API_KEY = Deno.env.get('DFS_API_KEY');
const POSTHOG_KEY = Deno.env.get('POSTHOG_PERSONAL_KEY');
const CF_TOKEN = Deno.env.get('CLOUDFLARE_API_TOKEN');
const CF_ZONE = Deno.env.get('CLOUDFLARE_ZONE_ID');

// Fail loud if any required secret is missing
const _missingSecrets = [
  !GOOGLE_API_KEY && 'GOOGLE_API_KEY',
  !DFS_LOGIN && 'DFS_LOGIN',
  !DFS_API_KEY && 'DFS_API_KEY',
  !POSTHOG_KEY && 'POSTHOG_PERSONAL_KEY',
  !CF_TOKEN && 'CLOUDFLARE_API_TOKEN',
  !CF_ZONE && 'CLOUDFLARE_ZONE_ID',
].filter(Boolean);
if (_missingSecrets.length) {
  console.error('seo-sync: missing required secrets:', _missingSecrets);
}

const GSC_SITE = 'sc-domain:brilliantjobs.app';
const SITE_URLS = [
  'https://brilliantjobs.app/',
  'https://brilliantjobs.app/data-lab',
  'https://brilliantjobs.app/salary-data',
  'https://brilliantjobs.app/hiring-trends',
  'https://brilliantjobs.app/jobs-by-industry',
  'https://brilliantjobs.app/career-level-data',
];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const sb = createClient(SB_URL, SB_KEY);

// ─── Google OAuth via Service Account JWT ───
async function getGoogleToken(): Promise<string> {
  if (!GOOGLE_SA_KEY) throw new Error('GOOGLE_SA_KEY_JSON secret not set');
  const sa = JSON.parse(GOOGLE_SA_KEY);
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const claims = btoa(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
  }));
  const signInput = `${header}.${claims}`;
  const keyPem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\\n/g, '');
  const binaryKey = Uint8Array.from(atob(keyPem), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', binaryKey, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(signInput));
  const sig64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const jwt = `${header}.${claims}.${sig64}`;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const d = await r.json();
  if (!d.access_token) throw new Error('OAuth failed: ' + JSON.stringify(d));
  return d.access_token;
}

function dateStr(daysAgo: number): string {
  const d = new Date(); d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

// ─── Task 1: GSC Performance ───
// Four API calls per date, per spec:
//   1. By date (no dimensions)       → seo_site_daily
//   2. By query (dimensions: query)  → seo_gsc_daily (url = '*')
//   3. By page (dimensions: page)    → seo_page_daily
//   4. By query × page               → seo_gsc_daily
async function syncGsc(daysBack = 7): Promise<{ byDate: number; byQuery: number; byPage: number; byQueryPage: number }> {
  const token = await getGoogleToken();
  const gscUrl = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(GSC_SITE)}/searchAnalytics/query`;
  const hdrs = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const result = { byDate: 0, byQuery: 0, byPage: 0, byQueryPage: 0 };

  for (let d = daysBack; d >= 1; d--) {
    const ds = dateStr(d);

    // 1. By date — no dimensions, aggregate totals
    const r1 = await fetch(gscUrl, { method: 'POST', headers: hdrs,
      body: JSON.stringify({ startDate: ds, endDate: ds, rowLimit: 1 }) });
    const d1 = await r1.json();
    const agg = (d1.rows || [])[0];
    if (agg) {
      await sb.from('seo_site_daily').upsert({
        date: ds, total_clicks: agg.clicks||0, total_impressions: agg.impressions||0,
        avg_ctr: agg.ctr ? Math.round(agg.ctr*10000)/10000 : 0,
        avg_position: agg.position ? Math.round(agg.position*10)/10 : 0,
      }, { onConflict: 'date' });
      result.byDate++;
      console.log(`[seo-sync] GSC ${ds} date: clicks=${agg.clicks} imp=${agg.impressions}`);
    }

    // 2. By query — dimensions: ['query']
    const r2 = await fetch(gscUrl, { method: 'POST', headers: hdrs,
      body: JSON.stringify({ startDate: ds, endDate: ds, dimensions: ['query'], rowLimit: 5000 }) });
    const d2 = await r2.json();
    const qRows = (d2.rows || []).map((r: any) => ({
      date: ds, url: '*', query: r.keys[0],
      clicks: r.clicks||0, impressions: r.impressions||0, ctr: r.ctr||0, position: r.position||0,
    }));
    if (qRows.length) {
      for (let i = 0; i < qRows.length; i += 500)
        await sb.from('seo_gsc_daily').upsert(qRows.slice(i,i+500), { onConflict: 'date,url,query' });
      result.byQuery += qRows.length;
    }

    // 3. By page — dimensions: ['page']
    const r3 = await fetch(gscUrl, { method: 'POST', headers: hdrs,
      body: JSON.stringify({ startDate: ds, endDate: ds, dimensions: ['page'], rowLimit: 5000 }) });
    const d3 = await r3.json();
    const pRows = (d3.rows || []).map((r: any) => ({
      date: ds, url: r.keys[0], clicks: r.clicks||0, impressions: r.impressions||0,
      avg_position: r.position ? Math.round(r.position*10)/10 : 0,
      top_queries: [],
    }));
    if (pRows.length) {
      await sb.from('seo_page_daily').upsert(pRows, { onConflict: 'date,url' });
      result.byPage += pRows.length;
    }

    // 4. By query × page — dimensions: ['page','query']
    const r4 = await fetch(gscUrl, { method: 'POST', headers: hdrs,
      body: JSON.stringify({ startDate: ds, endDate: ds, dimensions: ['page','query'], rowLimit: 5000 }) });
    const d4 = await r4.json();
    const qpRows = (d4.rows || []).map((r: any) => ({
      date: ds, url: r.keys[0], query: r.keys[1] || null,
      clicks: r.clicks||0, impressions: r.impressions||0, ctr: r.ctr||0, position: r.position||0,
    }));
    if (qpRows.length) {
      for (let i = 0; i < qpRows.length; i += 500)
        await sb.from('seo_gsc_daily').upsert(qpRows.slice(i,i+500), { onConflict: 'date,url,query' });
      result.byQueryPage += qpRows.length;
    }
  }
  return result;
}

// ─── Task 2: URL Inspection ───
async function syncInspect(): Promise<{ checked: number }> {
  const token = await getGoogleToken();
  let n = 0;
  for (const url of SITE_URLS) {
    try {
      const r = await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ inspectionUrl: url, siteUrl: GSC_SITE }),
      });
      const d = await r.json();
      console.log(`[seo-sync] inspect ${url}: status=${r.status}`, JSON.stringify(d).slice(0, 500));
      const idx = d.inspectionResult?.indexStatusResult || {};
      const mob = d.inspectionResult?.mobileUsabilityResult || {};
      await sb.from('seo_index_status').insert({
        url, verdict: idx.verdict, coverage_state: idx.coverageState,
        indexing_state: idx.indexingState, robots_txt_state: idx.robotsTxtState,
        last_crawl_time: idx.lastCrawlTime, crawled_as: idx.crawledAs,
        mobile_usability: mob.verdict, rich_results: d.inspectionResult?.richResultsResult,
      });
      n++;
    } catch(e) { console.error(`[seo-sync] inspect ${url}:`, e); }
  }
  return { checked: n };
}

// ─── Task 3: PageSpeed Insights (all 4 categories) ───
async function syncPsi(targetUrl?: string): Promise<{ pages: number }> {
  const today = dateStr(0);
  const urls = targetUrl ? [targetUrl] : SITE_URLS;
  let n = 0;
  for (const url of urls) {
    try {
      for (const strat of ['mobile','desktop'] as const) {
        const r = await fetch(
          `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&key=${GOOGLE_API_KEY}&strategy=${strat}&category=performance&category=seo&category=accessibility&category=best-practices`
        );
        const d = await r.json();
        const lh = d.lighthouseResult;
        if (!lh) continue;
        const cats = lh.categories || {};
        const perf = Math.round((cats.performance?.score||0)*100);
        const seo = Math.round((cats.seo?.score||0)*100);
        const a11y = Math.round((cats.accessibility?.score||0)*100);
        const bp = Math.round((cats['best-practices']?.score||0)*100);
        const a = lh.audits||{};
        const metrics = {
          performance: perf, seo, accessibility: a11y, best_practices: bp,
          fcp: a['first-contentful-paint']?.numericValue,
          lcp: a['largest-contentful-paint']?.numericValue,
          cls: a['cumulative-layout-shift']?.numericValue,
          tbt: a['total-blocking-time']?.numericValue,
          si: a['speed-index']?.numericValue,
          tti: a['interactive']?.numericValue,
        };
        const issues = Object.values(a)
          .filter((x:any)=>x.score!==null&&x.score<0.5&&x.scoreDisplayMode!=='informative')
          .map((x:any)=>({ id:x.id, title:x.title, score:x.score })).slice(0,15);
        await sb.from('seo_tech_audits').upsert({
          date: today, url, source: `psi_${strat}`, score: perf, metrics, issues,
        }, { onConflict: 'date,url,source' });
        // Update site daily for homepage
        if (url.endsWith('/') && url.includes('brilliantjobs.app')) {
          const col = strat==='mobile' ? 'psi_mobile_score' : 'psi_desktop_score';
          await sb.from('seo_site_daily').upsert({ date: today, [col]: perf }, { onConflict: 'date' });
        }
      }
      n++;
    } catch(e) { console.error(`[seo-sync] psi ${url}:`, e); }
  }
  return { pages: n };
}

// ─── Task 4: DataForSEO On-Page ───
// Uses instant_pages for per-URL on-page analysis (no crawl task needed)
async function syncDfs(): Promise<{ tasks: number }> {
  const today = dateStr(0);
  const auth = btoa(`${DFS_LOGIN}:${DFS_API_KEY}`);
  let n = 0;
  for (const url of SITE_URLS.slice(0, 6)) {
    try {
      // instant_pages: single-page analysis, returns immediately
      const cr = await fetch('https://api.dataforseo.com/v3/on_page/instant_pages', {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
        body: JSON.stringify([{
          url,
          enable_javascript: true,
          load_resources: true,
          enable_browser_rendering: true,
        }]),
      });
      const cd = await cr.json();
      const task = cd.tasks?.[0];
      if (task?.status_code !== 20000) {
        console.error(`[seo-sync] dfs ${url}: task error`, task?.status_message);
        continue;
      }
      const items = task.result?.[0]?.items;
      if (!items?.length) {
        console.log(`[seo-sync] dfs ${url}: no items returned`);
        continue;
      }
      const p = items[0];

      // Extract on-page score and detailed metrics
      const meta = p.meta || {};
      const checks = p.checks || {};
      const resources = p.page_resource_data || {};

      // Build issues list from checks that indicate actual SEO problems
      // Only include checks that should be true but are false (negative checks)
      const NEGATIVE_CHECKS = new Set([
        'no_content_encoding', 'high_loading_time', 'high_waiting_time',
        'is_broken', 'is_4xx_code', 'is_5xx_code',
        'no_title', 'title_too_long', 'title_too_short',
        'no_description', 'description_too_long', 'description_too_short',
        'no_h1_tag', 'duplicate_title', 'duplicate_description',
        'duplicate_content', 'no_image_alt', 'no_image_title',
        'no_favicon', 'seo_friendly_url_characters_check',
        'no_content_encoding', 'is_http', 'low_content_rate',
        'high_content_rate', 'no_doctype', 'canonical',
        'has_meta_refresh_redirect', 'size_greater_than_3mb',
      ]);
      const issues: { check: string; message: string }[] = [];
      for (const [checkName, checkVal] of Object.entries(checks)) {
        // For negative checks (problems): report when true
        // For positive checks (good things): report when false only if it's a known problem indicator
        if (checkVal === true && NEGATIVE_CHECKS.has(checkName)) {
          issues.push({ check: checkName, message: checkName.replace(/_/g, ' ') });
        }
      }

      await sb.from('seo_tech_audits').upsert({
        date: today, url, source: 'dataforseo',
        score: p.onpage_score != null ? Math.round(p.onpage_score) : null,
        metrics: {
          onpage_score: p.onpage_score,
          title: meta.title,
          title_length: meta.title?.length || 0,
          description: meta.description,
          description_length: meta.description?.length || 0,
          h1: meta.htags?.h1 || [],
          h1_count: meta.htags?.h1?.length || 0,
          h2_count: meta.htags?.h2?.length || 0,
          h3_count: meta.htags?.h3?.length || 0,
          canonical: meta.canonical,
          internal_links: p.internal_links_count || 0,
          external_links: p.external_links_count || 0,
          images_count: meta.images_count || 0,
          images_without_alt: meta.images_without_alt_count || 0,
          page_size: p.size || 0,
          encoded_size: p.encoded_size || 0,
          load_time: p.fetch_timing?.duration_time || 0,
          status_code: p.status_code,
          content_encoding: p.content_encoding,
          is_https: p.is_https,
          is_www: p.is_www,
          total_dom_size: resources.total_size || 0,
          scripts_count: resources.scripts_count || 0,
          stylesheets_count: resources.stylesheets_count || 0,
          // Checks summary
          checks_passed: Object.values(checks).filter((v: any) => v === true).length,
          checks_failed: Object.values(checks).filter((v: any) => v === false).length,
          checks_total: Object.keys(checks).length,
        },
        issues: issues.slice(0, 20),
      }, { onConflict: 'date,url,source' });
      n++;
      console.log(`[seo-sync] dfs ${url}: score=${p.onpage_score}, checks=${Object.keys(checks).length}`);
    } catch(e) { console.error(`[seo-sync] dfs ${url}:`, e); }
  }
  return { tasks: n };
}

// ─── Task 5: PostHog Conversions ───
async function syncPosthog(daysBack = 7): Promise<{ events: number }> {
  let total = 0;
  for (let d = daysBack; d >= 1; d--) {
    const ds = dateStr(d);
    for (const ev of ['signup', '$pageview']) {
      try {
        const r = await fetch('https://us.posthog.com/api/projects/@current/events?' + new URLSearchParams({
          event: ev, after: ds+'T00:00:00Z', before: ds+'T23:59:59Z', limit: '1000',
        }), { headers: { Authorization: `Bearer ${POSTHOG_KEY}` } });
        const data = await r.json();
        const evts = data.results || [];
        if (!evts.length) continue;
        const grp: Record<string, number> = {};
        for (const e of evts) {
          const u = e.properties?.$current_url || e.properties?.$pathname || 'unknown';
          grp[u] = (grp[u]||0)+1;
        }
        for (const [url, count] of Object.entries(grp)) {
          await sb.from('seo_conversions').upsert({
            date: ds, event_type: ev==='$pageview'?'pageview':ev, landing_url: (url as string).slice(0,500), count,
          }, { onConflict: 'date,event_type,landing_url' }).then(()=>{}).catch(()=>{
            // Fallback to insert if no unique constraint
            sb.from('seo_conversions').insert({
              date: ds, event_type: ev==='$pageview'?'pageview':ev, landing_url: (url as string).slice(0,500), count,
            });
          });
        }
        total += evts.length;
      } catch(e) { console.error(`[seo-sync] ph ${ev} ${ds}:`, e); }
    }
    const { count } = await sb.from('seo_conversions')
      .select('*', { count:'exact', head:true }).eq('date', ds).eq('event_type','signup');
    if (count !== null) {
      await sb.from('seo_site_daily').upsert({ date: ds, signup_count: count }, { onConflict: 'date' });
    }
  }
  return { events: total };
}

// ─── Task 6: Yellow Lab Tools ───
async function syncYellowLab(): Promise<{ pages: number }> {
  const today = dateStr(0);
  let n = 0;
  for (const url of SITE_URLS) {
    try {
      // Launch run with waitForResponse
      const r = await fetch('https://yellowlab.tools/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, waitForResponse: false }),
      });
      const launch = await r.json();
      const runId = launch.runId;
      if (!runId) { console.error(`[seo-sync] ylt no runId for ${url}:`, launch); continue; }

      // Poll for result (max 90s)
      let result = null;
      for (let i = 0; i < 18; i++) {
        await new Promise(r => setTimeout(r, 5000));
        const sr = await fetch(`https://yellowlab.tools/api/runs/${runId}`);
        if (sr.status === 404) continue; // not ready yet
        const sd = await sr.json();
        if (sd.status?.statusCode === 'complete') {
          // Fetch scores
          const scr = await fetch(`https://yellowlab.tools/api/results/${runId}/generalScores`);
          if (scr.ok) { result = await scr.json(); }
          break;
        }
        if (sd.status?.statusCode === 'failed') { console.error(`[seo-sync] ylt failed ${url}`); break; }
      }

      if (result) {
        const globalScore = result.globalScore || 0;
        const categories: Record<string, any> = {};
        if (result.categories) {
          for (const [k, v] of Object.entries(result.categories as Record<string, any>)) {
            categories[k] = { score: v.categoryScore, label: v.label };
          }
        }
        await sb.from('seo_tech_audits').upsert({
          date: today, url, source: 'yellowlab',
          score: Math.round(globalScore),
          metrics: { global_score: globalScore, categories },
          issues: [], // Could fetch /rules for details but keeping lightweight
        }, { onConflict: 'date,url,source' });

        // Update site daily for homepages
        if (url.endsWith('/') && url.includes('brilliantjobs.app')) {
          await sb.from('seo_site_daily').upsert({ date: today, ylt_score: Math.round(globalScore) }, { onConflict: 'date' });
        }
        n++;
      }
    } catch(e) { console.error(`[seo-sync] ylt ${url}:`, e); }
  }
  return { pages: n };
}

// ─── Task 7: Chrome UX Report (CrUX) ───
async function syncCrux(): Promise<{ origins: number }> {
  const today = dateStr(0);
  let n = 0;
  for (const origin of origins) {
    try {
      // Origin-level query
      const r = await fetch(
        `https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=${GOOGLE_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ origin }),
        }
      );
      const d = await r.json();
      if (d.error) { console.error(`[seo-sync] crux ${origin}:`, d.error.message); continue; }

      const rec = d.record;
      if (!rec?.metrics) continue;

      const metrics: Record<string, any> = {};
      // Extract each metric with its histogram (good/needs-improvement/poor distributions)
      for (const [key, val] of Object.entries(rec.metrics as Record<string, any>)) {
        metrics[key] = {
          p75: val.percentiles?.p75,
          histogram: val.histogram?.map((h: any) => ({
            start: h.start, end: h.end, density: h.density,
          })),
        };
      }

      await sb.from('seo_tech_audits').upsert({
        date: today, url: origin, source: 'crux',
        score: null, // CrUX doesn't have a single score
        metrics,
        issues: [],
      }, { onConflict: 'date,url,source' });
      n++;

      // Also try per-URL for key pages
      for (const pageUrl of SITE_URLS.filter(u => u.startsWith(origin))) {
        try {
          const pr = await fetch(
            `https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=${GOOGLE_API_KEY}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: pageUrl }),
            }
          );
          const pd = await pr.json();
          if (pd.error || !pd.record?.metrics) continue;

          const pageMetrics: Record<string, any> = {};
          for (const [key, val] of Object.entries(pd.record.metrics as Record<string, any>)) {
            pageMetrics[key] = {
              p75: val.percentiles?.p75,
              histogram: val.histogram?.map((h: any) => ({
                start: h.start, end: h.end, density: h.density,
              })),
            };
          }
          await sb.from('seo_tech_audits').upsert({
            date: today, url: pageUrl, source: 'crux',
            score: null, metrics: pageMetrics, issues: [],
          }, { onConflict: 'date,url,source' });
        } catch(e) { /* Per-URL CrUX may not have enough data — that's fine */ }
      }
    } catch(e) { console.error(`[seo-sync] crux ${origin}:`, e); }
  }
  return { origins: n };
}

// ─── Task 8: Google Knowledge Graph ───
async function syncKnowledgeGraph(): Promise<{ pages: number }> {
  const today = dateStr(0);
  let n = 0;

  // Search for entities related to our brand and key topics
  const queries = ['Brilliant Jobs', 'brilliantjobs.app', 'job search platform'];
  const allEntities: any[] = [];

  for (const q of queries) {
    try {
      const r = await fetch(
        `https://kgsearch.googleapis.com/v1/entities:search?query=${encodeURIComponent(q)}&key=${GOOGLE_API_KEY}&limit=5&indent=true`
      );
      const d = await r.json();
      const items = d.itemListElement || [];
      for (const item of items) {
        const entity = item.result;
        if (!entity) continue;
        allEntities.push({
          entity_id: entity['@id'],
          name: entity.name,
          type: entity['@type']?.join(', '),
          description: entity.description,
          detailed_description: entity.detailedDescription?.articleBody?.slice(0, 500),
          url: entity.url,
          score: item.resultScore,
        });
      }
    } catch(e) { console.error(`[seo-sync] kg query "${q}":`, e); }
  }

  // Store as a single audit entry per day
  if (allEntities.length > 0) {
    await sb.from('seo_tech_audits').upsert({
      date: today, url: 'https://brilliantjobs.app/', source: 'knowledge_graph',
      score: null,
      metrics: { entities: allEntities, query_count: queries.length },
      issues: [],
    }, { onConflict: 'date,url,source' });
    n = 1;
  }
  return { pages: n };
}

// ─── Task 9: Cloudflare Traffic Analytics ───
// Uses httpRequests1dGroups (available on free plan)
// Provides: requests, pageViews, uniques, country breakdown, status codes, threats
// Note: per-user-agent bot detection requires Business plan (httpRequestsAdaptiveGroups)
async function syncCloudflare(daysBack = 7): Promise<{ days: number }> {
  const startDate = dateStr(daysBack);
  const today = dateStr(0);
  let n = 0;

  try {
    const query = `{
      viewer {
        zones(filter: {zoneTag: "${CF_ZONE}"}) {
          httpRequests1dGroups(
            limit: 30
            filter: { date_geq: "${startDate}", date_leq: "${today}" }
            orderBy: [date_DESC]
          ) {
            dimensions { date }
            sum {
              requests
              pageViews
              threats
              countryMap { clientCountryName requests }
              responseStatusMap { edgeResponseStatus requests }
              threatPathingMap { threatPathingName requests }
            }
            uniq { uniques }
          }
        }
      }
    }`;

    const r = await fetch('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${CF_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });
    const d = await r.json();

    if (d.errors) {
      console.error('[seo-sync] cf errors:', JSON.stringify(d.errors));
      return { days: 0 };
    }

    const groups = d.data?.viewer?.zones?.[0]?.httpRequests1dGroups || [];
    if (!groups.length) { console.log('[seo-sync] cf: no data'); return { days: 0 }; }

    for (const g of groups) {
      const date = g.dimensions.date;
      const s = g.sum;
      const statusCodes: Record<string, number> = {};
      for (const sm of (s.responseStatusMap || [])) {
        statusCodes[String(sm.edgeResponseStatus)] = sm.requests;
      }
      const countries: Record<string, number> = {};
      for (const cm of (s.countryMap || [])) {
        countries[cm.clientCountryName] = cm.requests;
      }

      await sb.from('seo_tech_audits').upsert({
        date,
        url: 'https://brilliantjobs.app/',
        source: 'cloudflare',
        score: null,
        metrics: {
          total_requests: s.requests,
          page_views: s.pageViews,
          unique_visitors: g.uniq?.uniques || 0,
          threats: s.threats,
          status_codes: statusCodes,
          countries,
        },
        issues: [],
      }, { onConflict: 'date,url,source' });
      n++;
    }
  } catch(e) { console.error('[seo-sync] cf:', e); }
  return { days: n };
}

// ─── Main ───
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  try {
    // CS-001: Auth fix — reject if no Authorization header (was: no header = bypass all checks)
    const auth = req.headers.get('Authorization');
    if (!auth) {
      return new Response(JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
    const bearerToken = auth.replace('Bearer ', '');
    const isServiceRole = bearerToken === SB_KEY;
    if (!isServiceRole) {
      const { data: { user } } = await sb.auth.getUser(bearerToken);
      if (!user) {
        return new Response(JSON.stringify({ error: 'Invalid token' }),
          { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });
      }
      const { data: p } = await sb.from('profiles').select('role').eq('id', user.id).single();
      if (p?.role !== 'admin') {
        return new Response(JSON.stringify({ error: 'Admin only' }),
          { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } });
      }
    }
    let tasks = ['all'];
    let targetUrl: string | undefined;
    if (req.method === 'POST') {
      const body = await req.json().catch(()=>({}));
      if (body.tasks) tasks = Array.isArray(body.tasks) ? body.tasks : [body.tasks];
      if (body.target_url) targetUrl = body.target_url;
    }
    const res: Record<string, any> = {};
    const all = tasks.includes('all');

    // No-auth tools first (API key only)
    if (all || tasks.includes('psi'))
      try { res.psi = await syncPsi(targetUrl); } catch(e) { res.psi = { error: String(e) }; }
    if (all || tasks.includes('posthog'))
      try { res.posthog = await syncPosthog(); } catch(e) { res.posthog = { error: String(e) }; }
    if (all || tasks.includes('yellowlab'))
      try { res.yellowlab = await syncYellowLab(); } catch(e) { res.yellowlab = { error: String(e) }; }
    if (all || tasks.includes('crux'))
      try { res.crux = await syncCrux(); } catch(e) { res.crux = { error: String(e) }; }
    if (all || tasks.includes('knowledge_graph'))
      try { res.knowledge_graph = await syncKnowledgeGraph(); } catch(e) { res.knowledge_graph = { error: String(e) }; }
    if (all || tasks.includes('cloudflare'))
      try { res.cloudflare = await syncCloudflare(); } catch(e) { res.cloudflare = { error: String(e) }; }

    // GSC tasks require service account
    if (all || tasks.includes('gsc_performance'))
      try { res.gsc = await syncGsc(); } catch(e) { res.gsc = { error: String(e) }; }
    if (all || tasks.includes('gsc_inspect'))
      try { res.inspect = await syncInspect(); } catch(e) { res.inspect = { error: String(e) }; }
    if (all || tasks.includes('dataforseo'))
      try { res.dfs = await syncDfs(); } catch(e) { res.dfs = { error: String(e) }; }

    console.log('[seo-sync]', JSON.stringify(res));
    return new Response(JSON.stringify({ ok: true, results: res }), {
      headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[seo-sync] Fatal:', err);
    return new Response(JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
