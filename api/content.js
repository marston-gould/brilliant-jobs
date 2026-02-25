// api/content.js — Serverless content distribution endpoints
// Routes handled via query params:
//   ?mode=blog           → Blog index HTML (published stories list)
//   ?mode=story&slug=X   → Individual story HTML page
//   ?mode=feed           → JSON feed of published stories (for widgets/embeds)
//   ?mode=pulse          → Market Pulse HTML widget (latest 5 stories)
//   ?mode=embed&id=X     → Embeddable story card (iframe-ready)
//   ?mode=rss            → RSS 2.0 feed

const SUPABASE_URL = 'https://qojhagupdnbtomfoxnsf.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvamhhZ3VwZG5idG9tZm94bnNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NjkwNjYsImV4cCI6MjA4NjE0NTA2Nn0.1C6MsHc2ECgbMiUMwmCfcXpioo62P3jcqdbifWqGYTk';

async function fetchStories(opts = {}) {
  const { status = 'published', limit = 20, category, id, slug } = opts;
  let url = `${SUPABASE_URL}/rest/v1/content_stories?select=id,story_type,category,headline,lede,body_html,meta_description,social_snippet,chart_config,evergreen_link,score,status,tags,published_at,published_slug,created_at&order=published_at.desc.nullslast,score.desc&limit=${limit}`;

  if (id) url += `&id=eq.${id}`;
  else if (slug) url += `&published_slug=eq.${slug}`;
  else url += `&status=eq.${status}`;
  if (category) url += `&category=eq.${category}`;

  const resp = await fetch(url, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
  });
  return resp.json();
}

// ─── Shared HTML shell ─────────────────────────────────────────────────────
function htmlShell(title, meta, body, opts = {}) {
  const { canonical, noIndex, minimal } = opts;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} | Brilliant Jobs Blog</title>
<meta name="description" content="${esc(meta)}">
${canonical ? `<link rel="canonical" href="https://www.brilliantjobs.com${canonical}">` : ''}
${noIndex ? '<meta name="robots" content="noindex">' : ''}
<link rel="icon" href="/resources/favicon.png">
<style>
:root{--bg:#0f1117;--bg2:#1a1d27;--text:#e4e4e7;--dim:#71717a;--accent:#6366f1;--accent2:#818cf8;--border:#27272a;--green:#22c55e;--blue:#3b82f6}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6}
a{color:var(--accent2);text-decoration:none}a:hover{text-decoration:underline}
.container{max-width:800px;margin:0 auto;padding:24px 16px}
${minimal ? '' : `
.site-header{border-bottom:1px solid var(--border);padding:16px 0;margin-bottom:32px}
.site-header .container{display:flex;justify-content:space-between;align-items:center}
.site-logo{font-size:18px;font-weight:700;color:var(--text)}
.site-logo span{color:var(--accent)}
.site-nav a{color:var(--dim);font-size:14px;margin-left:20px}
.site-nav a:hover{color:var(--text);text-decoration:none}
`}
.story-card{background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:24px;margin-bottom:20px;transition:border-color .2s}
.story-card:hover{border-color:var(--accent)}
.story-card h2{font-size:20px;margin-bottom:8px}
.story-card h2 a{color:var(--text)}
.story-meta{font-size:13px;color:var(--dim);margin-bottom:8px;display:flex;gap:12px;flex-wrap:wrap}
.story-meta .cat{background:var(--accent);color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;text-transform:uppercase;font-weight:600}
.story-lede{color:var(--dim);font-size:15px;margin-bottom:12px}
.story-link{font-size:14px;font-weight:600}
.article h1{font-size:28px;margin-bottom:12px}
.article .lede{font-size:18px;color:var(--dim);margin-bottom:24px;line-height:1.5}
.article .body{font-size:16px;line-height:1.8}
.article .body p{margin-bottom:16px}
.article .body h3{font-size:18px;margin:24px 0 12px;color:var(--accent2)}
.article .body strong{color:var(--text)}
.article .meta-box{background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:16px;margin-top:32px;font-size:13px;color:var(--dim)}
.article .cta{display:inline-block;background:var(--accent);color:#fff;padding:10px 20px;border-radius:8px;font-weight:600;margin-top:16px}
.article .cta:hover{background:var(--accent2);text-decoration:none}
.footer{border-top:1px solid var(--border);padding:24px 0;margin-top:48px;text-align:center;font-size:13px;color:var(--dim)}
</style>
</head>
<body>
${minimal ? '' : `
<header class="site-header">
<div class="container">
<a href="/" class="site-logo">Brilliant<span>Jobs</span> Blog</a>
<nav class="site-nav">
<a href="/blog">All Stories</a>
<a href="/job-market-data">Market Data</a>
<a href="/dashboard">Dashboard</a>
</nav>
</div>
</header>
`}
${body}
${minimal ? '' : `
<footer class="footer">
<div class="container">
<p>&copy; 2026 Brilliant Jobs &mdash; Data-driven job market insights | <a href="/">Home</a> | <a href="/blog/feed">RSS</a></p>
<!-- v4.65 -->
</div>
</footer>
`}
</body>
</html>`;
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function storySlug(story) {
  return story.published_slug || `story-${story.id}`;
}

// ─── Blog Index ─────────────────────────────────────────────────────────────
function renderBlogIndex(stories, category) {
  const catLabel = category ? category.charAt(0).toUpperCase() + category.slice(1) : 'All';
  const cards = stories.map(s => `
<article class="story-card">
  <h2><a href="/blog/${esc(storySlug(s))}">${esc(s.headline)}</a></h2>
  <div class="story-meta">
    <span class="cat">${esc(s.category)}</span>
    <span>${fmtDate(s.published_at)}</span>
    <span>${esc(s.story_type.replace(/_/g, ' '))}</span>
  </div>
  <p class="story-lede">${esc(s.lede)}</p>
  <a class="story-link" href="/blog/${esc(storySlug(s))}">Read more &rarr;</a>
</article>`).join('\n');

  const catLinks = ['', 'trend', 'location', 'salary', 'remote', 'company'].map(c => {
    const label = c || 'All';
    const active = (c === (category || '')) ? 'font-weight:700;color:var(--text)' : '';
    return `<a href="/blog${c ? '?category=' + c : ''}" style="margin-right:12px;font-size:14px;${active}">${label.charAt(0).toUpperCase() + label.slice(1)}</a>`;
  }).join('');

  return htmlShell(
    `${catLabel} Stories`,
    'Data-driven job market insights from Brilliant Jobs. Hiring trends, salary analysis, and location-based employment data.',
    `<div class="container">
      <h1 style="font-size:32px;margin-bottom:8px">Job Market Insights</h1>
      <p style="color:var(--dim);margin-bottom:24px">Data-driven stories from 300,000+ tracked job postings</p>
      <div style="margin-bottom:24px;border-bottom:1px solid var(--border);padding-bottom:12px">${catLinks}</div>
      ${cards || '<p style="color:var(--dim);text-align:center;padding:40px 0">No published stories yet. Check back soon!</p>'}
    </div>`,
    { canonical: '/blog' }
  );
}

// ─── Individual Story ───────────────────────────────────────────────────────
function renderStoryPage(story) {
  const evergreenCTA = story.evergreen_link
    ? `<a class="cta" href="${esc(story.evergreen_link)}">View Live Data &rarr;</a>`
    : `<a class="cta" href="/job-market-data">Explore Market Data &rarr;</a>`;

  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": story.headline,
    "description": story.meta_description || story.lede,
    "datePublished": story.published_at,
    "publisher": { "@type": "Organization", "name": "Brilliant Jobs", "url": "https://www.brilliantjobs.com" },
    "mainEntityOfPage": `https://www.brilliantjobs.com/blog/${storySlug(story)}`
  });

  return htmlShell(
    story.headline,
    story.meta_description || story.lede || '',
    `<div class="container article">
      <div class="story-meta" style="margin-bottom:12px">
        <span class="cat">${esc(story.category)}</span>
        <span>${fmtDate(story.published_at)}</span>
      </div>
      <h1>${esc(story.headline)}</h1>
      <p class="lede">${esc(story.lede)}</p>
      <div class="body">${story.body_html || '<p>Content coming soon.</p>'}</div>
      <div class="meta-box">
        <p>Source: Brilliant Jobs platform data &mdash; ${story.tags?.length ? 'Tags: ' + story.tags.map(t => esc(t)).join(', ') : ''}</p>
        ${evergreenCTA}
      </div>
    </div>
    <script type="application/ld+json">${jsonLd}</script>`,
    { canonical: `/blog/${storySlug(story)}` }
  );
}

// ─── Market Pulse Widget ────────────────────────────────────────────────────
function renderPulseWidget(stories) {
  const items = stories.slice(0, 5).map(s => `
<div style="padding:12px 0;border-bottom:1px solid var(--border)">
  <a href="/blog/${esc(storySlug(s))}" style="font-size:14px;font-weight:600;color:var(--text);display:block;margin-bottom:4px">${esc(s.headline)}</a>
  <div style="font-size:12px;color:var(--dim);display:flex;gap:8px">
    <span style="background:var(--accent);color:#fff;padding:1px 6px;border-radius:3px;font-size:10px">${esc(s.category)}</span>
    <span>${fmtDate(s.published_at)}</span>
  </div>
</div>`).join('');

  return `<div style="background:var(--bg2,#1a1d27);border:1px solid var(--border,#27272a);border-radius:10px;padding:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="font-size:13px;font-weight:600;color:var(--dim,#71717a);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Market Pulse</div>
  ${items || '<div style="color:var(--dim);font-size:14px;padding:12px 0">No stories yet</div>'}
  <div style="text-align:right;margin-top:8px"><a href="/blog" style="font-size:13px;color:var(--accent,#6366f1)">All stories &rarr;</a></div>
</div>`;
}

// ─── Embed Card ─────────────────────────────────────────────────────────────
function renderEmbedCard(story) {
  return htmlShell(
    story.headline,
    story.social_snippet || story.lede || '',
    `<div style="padding:20px">
      <div style="font-size:11px;color:var(--dim);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Brilliant Jobs Insight</div>
      <h2 style="font-size:18px;margin-bottom:8px;color:var(--text)">${esc(story.headline)}</h2>
      <p style="font-size:14px;color:var(--dim);margin-bottom:12px">${esc(story.lede)}</p>
      <a href="https://www.brilliantjobs.com/blog/${esc(storySlug(story))}" target="_blank" style="font-size:13px;color:var(--accent);font-weight:600">Read full story &rarr;</a>
    </div>`,
    { minimal: true, noIndex: true }
  );
}

// ─── RSS Feed ───────────────────────────────────────────────────────────────
function renderRSS(stories) {
  const items = stories.map(s => `
  <item>
    <title><![CDATA[${s.headline}]]></title>
    <link>https://www.brilliantjobs.com/blog/${storySlug(s)}</link>
    <description><![CDATA[${s.lede || ''}]]></description>
    <pubDate>${new Date(s.published_at || s.created_at).toUTCString()}</pubDate>
    <guid>https://www.brilliantjobs.com/blog/${storySlug(s)}</guid>
    <category>${s.category}</category>
  </item>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>Brilliant Jobs Market Insights</title>
  <link>https://www.brilliantjobs.com/blog</link>
  <description>Data-driven job market insights from 300,000+ tracked positions</description>
  <language>en-us</language>
  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
  <atom:link href="https://www.brilliantjobs.com/blog/feed" rel="self" type="application/rss+xml"/>
  ${items}
</channel>
</rss>`;
}

// ─── JSON Feed ──────────────────────────────────────────────────────────────
function renderJSONFeed(stories) {
  return stories.map(s => ({
    id: s.id,
    headline: s.headline,
    lede: s.lede,
    category: s.category,
    story_type: s.story_type,
    published_at: s.published_at,
    url: `/blog/${storySlug(s)}`,
    social_snippet: s.social_snippet,
    evergreen_link: s.evergreen_link,
    tags: s.tags,
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// HANDLER
// ═══════════════════════════════════════════════════════════════════════════
module.exports = async function handler(req, res) {
  try {
    const url = new URL(req.url, `https://${req.headers.host}`);
    const mode = url.searchParams.get('mode') || 'blog';
    const category = url.searchParams.get('category') || '';
    const slug = url.searchParams.get('slug') || '';
    const id = url.searchParams.get('id') || '';

    switch (mode) {
      case 'blog': {
        const stories = await fetchStories({ limit: 50, category: category || undefined });
        const html = renderBlogIndex(stories, category || undefined);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
        return res.status(200).send(html);
      }

      case 'story': {
        if (!slug) return res.status(400).send('Missing slug');
        const stories = await fetchStories({ slug });
        if (!stories.length) {
          // Fallback: try by ID if slug is numeric
          if (/^\d+$/.test(slug)) {
            const byId = await fetchStories({ id: slug });
            if (byId.length) {
              const html = renderStoryPage(byId[0]);
              res.setHeader('Content-Type', 'text/html; charset=utf-8');
              res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
              return res.status(200).send(html);
            }
          }
          return res.status(404).send(htmlShell('Not Found', '', '<div class="container"><h1>Story not found</h1><p><a href="/blog">Back to blog</a></p></div>'));
        }
        const html = renderStoryPage(stories[0]);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
        return res.status(200).send(html);
      }

      case 'feed': {
        const stories = await fetchStories({ limit: 20, category: category || undefined });
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=1800');
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.status(200).json(renderJSONFeed(stories));
      }

      case 'pulse': {
        const stories = await fetchStories({ limit: 5 });
        const html = renderPulseWidget(stories);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=1800');
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.status(200).send(html);
      }

      case 'embed': {
        if (!id) return res.status(400).send('Missing id');
        const stories = await fetchStories({ id });
        if (!stories.length) return res.status(404).send('Story not found');
        const html = renderEmbedCard(stories[0]);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
        res.setHeader('X-Frame-Options', 'ALLOWALL');
        return res.status(200).send(html);
      }

      case 'rss': {
        const stories = await fetchStories({ limit: 30 });
        const xml = renderRSS(stories);
        res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
        res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
        return res.status(200).send(xml);
      }

      default:
        return res.status(400).send('Unknown mode');
    }
  } catch (err) {
    console.error('content.js error:', err);
    return res.status(500).send('Internal error');
  }
};
