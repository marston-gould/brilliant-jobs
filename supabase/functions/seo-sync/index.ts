// supabase/functions/seo-sync/index.ts
// Daily SEO data sync: GSC performance, URL inspection, PSI, DataForSEO, PostHog
// Tasks: gsc_performance | gsc_inspect | psi | dataforseo | posthog | all
// v2 — supports target_url for per-page PSI, collects all 10 URLs

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const SB_URL  = Deno.env.get('SUPABASE_URL')!;
const SB_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GOOGLE_SA_KEY = Deno.env.get('GOOGLE_SA_KEY_JSON');
const GOOGLE_API_KEY = Deno.env.get('GOOGLE_API_KEY') || '***REDACTED_GOOGLE_API_KEY***';
const DFS_LOGIN = Deno.env.get('DFS_LOGIN') || 'gould.marston@gmail.com';
const DFS_API_KEY = Deno.env.get('DFS_API_KEY') || '***REDACTED_DFS_KEY***';
const POSTHOG_KEY = Deno.env.get('POSTHOG_PERSONAL_KEY') || '***REDACTED_POSTHOG_KEY***';

const GSC_SITE = 'https://brilliantjobs.io/';
const SITE_URLS = [
  'https://brilliantjobs.io/',
  'https://brilliantjobs.io/help',
  'https://brilliantjobs.io/privacy',
  'https://brilliantjobs.io/terms',
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

// ─── Task 1: GSC Performance (date × url × query) ───
async function syncGsc(daysBack = 3): Promise<{ rows: number }> {
  const token = await getGoogleToken();
  let total = 0;
  for (let d = daysBack; d >= 1; d--) {
    const ds = dateStr(d);
    const res = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(GSC_SITE)}/searchAnalytics/query`,
      { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: ds, endDate: ds, dimensions: ['page','query'], rowLimit: 5000 }) }
    );
    const data = await res.json();
    const rows = data.rows || [];
    if (!rows.length) continue;

    const recs = rows.map((r: any) => ({
      date: ds, url: r.keys[0], query: r.keys[1] || null,
      clicks: r.clicks||0, impressions: r.impressions||0, ctr: r.ctr||0, position: r.position||0,
    }));
    for (let i = 0; i < recs.length; i += 500) {
      await sb.from('seo_gsc_daily').upsert(recs.slice(i,i+500), { onConflict: 'date,url,query' });
    }
    total += recs.length;

    // Page-level rollup
    const pm: Record<string, any> = {};
    for (const r of recs) {
      if (!pm[r.url]) pm[r.url] = { cl:0, im:0, pos:[], qs:[] };
      pm[r.url].cl += r.clicks; pm[r.url].im += r.impressions;
      pm[r.url].pos.push(r.position);
      if (r.query && r.clicks > 0) pm[r.url].qs.push({ q: r.query, c: r.clicks });
    }
    const pageRecs = Object.entries(pm).map(([url, v]: [string, any]) => ({
      date: ds, url, clicks: v.cl, impressions: v.im,
      avg_position: Math.round(v.pos.reduce((a:number,b:number)=>a+b,0)/v.pos.length*10)/10,
      top_queries: v.qs.sort((a:any,b:any)=>b.c-a.c).slice(0,10),
    }));
    await sb.from('seo_page_daily').upsert(pageRecs, { onConflict: 'date,url' });

    // Site-level rollup
    const sc = pageRecs.reduce((s,r)=>s+r.clicks,0);
    const si = pageRecs.reduce((s,r)=>s+r.impressions,0);
    const sp = pageRecs.reduce((s,r)=>s+r.avg_position,0)/(pageRecs.length||1);
    await sb.from('seo_site_daily').upsert({
      date: ds, total_clicks: sc, total_impressions: si,
      avg_ctr: si>0 ? Math.round(sc/si*10000)/10000 : 0,
      avg_position: Math.round(sp*10)/10,
    }, { onConflict: 'date' });
  }
  return { rows: total };
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

// ─── Task 3: PageSpeed Insights ───
async function syncPsi(targetUrl?: string): Promise<{ pages: number }> {
  const today = dateStr(0);
  const urls = targetUrl ? [targetUrl] : SITE_URLS; // All 10 URLs by default
  let n = 0;
  for (const url of urls) {
    try {
      for (const strat of ['mobile','desktop'] as const) {
        const r = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&key=${GOOGLE_API_KEY}&strategy=${strat}&category=performance&category=seo`);
        const d = await r.json();
        const lh = d.lighthouseResult;
        if (!lh) continue;
        const perf = Math.round((lh.categories?.performance?.score||0)*100);
        const seo = Math.round((lh.categories?.seo?.score||0)*100);
        const a = lh.audits||{};
        const metrics = {
          performance: perf, seo,
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
        if (url.endsWith('/') && (url.includes('brilliantjobs.app') || url.includes('brilliantjobs.io/'))) {
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
async function syncDfs(): Promise<{ tasks: number }> {
  const today = dateStr(0);
  const auth = btoa(`${DFS_LOGIN}:${DFS_API_KEY}`);
  let n = 0;
  for (const url of SITE_URLS.slice(0, 5)) {
    try {
      const cr = await fetch('https://api.dataforseo.com/v3/on_page/task_post', {
        method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
        body: JSON.stringify([{ target: url, max_crawl_pages: 1, store_raw_html: false }]),
      });
      const cd = await cr.json();
      const tid = cd.tasks?.[0]?.id;
      if (!tid) continue;
      let result = null;
      for (let i = 0; i < 6; i++) {
        await new Promise(r=>setTimeout(r,5000));
        const sr = await fetch(`https://api.dataforseo.com/v3/on_page/summary/${tid}`, {
          headers: { Authorization: `Basic ${auth}` },
        });
        const sd = await sr.json();
        const t = sd.tasks?.[0];
        if (t?.status_code===20000 && t?.result) { result=t.result[0]; break; }
      }
      if (result) {
        const p = result.crawl_status_code===200 ? result : {};
        await sb.from('seo_tech_audits').upsert({
          date: today, url, source: 'dataforseo',
          score: p.onpage_score ? Math.round(p.onpage_score*100) : null,
          metrics: {
            title_length: p.meta?.title?.length, description_length: p.meta?.description?.length,
            h1_count: p.meta?.htags?.h1?.length||0, internal_links: p.internal_links_count,
            external_links: p.external_links_count, page_size: p.page_size,
            load_time: p.time_to_interactive, status_code: p.crawl_status_code,
          },
          issues: (p.checks||[]).filter((c:any)=>!c.is_passed)
            .map((c:any)=>({ check:c.name, message:c.message })).slice(0,15),
        }, { onConflict: 'date,url,source' });
        n++;
      }
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
          await sb.from('seo_conversions').insert({
            date: ds, event_type: ev==='$pageview'?'pageview':ev, landing_url: (url as string).slice(0,500), count,
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

// ─── Main ───
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  try {
    const auth = req.headers.get('Authorization');
    if (auth && !auth.includes('service_role')) {
      const { data: { user } } = await sb.auth.getUser(auth.replace('Bearer ', ''));
      if (user) {
        const { data: p } = await sb.from('profiles').select('role').eq('id', user.id).single();
        if (p?.role !== 'admin') return new Response(JSON.stringify({ error: 'Admin only' }),
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
    // Run PSI + PostHog first (no Google SA required)
    if (all || tasks.includes('psi'))
      try { res.psi = await syncPsi(targetUrl); } catch(e) { res.psi = { error: String(e) }; }
    if (all || tasks.includes('posthog'))
      try { res.posthog = await syncPosthog(); } catch(e) { res.posthog = { error: String(e) }; }
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
