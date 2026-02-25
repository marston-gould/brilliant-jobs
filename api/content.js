/**
 * /api/content.js — Vercel serverless: content distribution
 * Routes via vercel.json rewrites:
 *   /blog              → mode=blog
 *   /blog/:slug        → mode=story&slug=:slug
 *   /blog/feed         → mode=rss
 *   /api/content/feed  → mode=feed (JSON)
 *   /api/content/pulse → mode=pulse
 *   /api/content/embed/:id → mode=embed&id=:id
 */
const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://qojhagupdnbtomfoxnsf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvamhhZ3VwZG5idG9tZm94bnNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NjkwNjYsImV4cCI6MjA4NjE0NTA2Nn0.0AFgnrN7omBC4Jg8G0kxZACn5mXLWPazIodI6JOx1rg';
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

var COLS = 'id,story_type,category,headline,lede,body_html,meta_description,social_snippet,chart_config,evergreen_link,score,status,tags,published_at,published_slug,created_at';

async function fetchPublished(opts) {
  opts = opts || {};
  var q = sb.from('content_stories').select(COLS)
    .eq('status', 'published')
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(opts.limit || 20);
  if (opts.id) q = q.eq('id', opts.id);
  if (opts.slug) q = q.eq('published_slug', opts.slug);
  if (opts.category) q = q.eq('category', opts.category);
  var r = await q;
  return (r.data || []);
}

function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'}) : ''; }
function sl(s) { return s.published_slug || ('story-' + s.id); }

function shell(title, meta, body, o) {
  o = o || {};
  var can = o.canonical ? '<link rel="canonical" href="https://www.brilliantjobs.com'+o.canonical+'">' : '';
  var noIdx = o.noIndex ? '<meta name="robots" content="noindex">' : '';
  var hdr = o.minimal ? '' : '<header style="border-bottom:1px solid #27272a;padding:16px 0;margin-bottom:32px"><div style="max-width:800px;margin:0 auto;padding:0 16px;display:flex;justify-content:space-between;align-items:center"><a href="/" style="font-size:18px;font-weight:700;color:#e4e4e7;text-decoration:none">Brilliant<span style="color:#6366f1">Jobs</span> Blog</a><nav><a href="/blog" style="color:#71717a;font-size:14px;margin-left:20px;text-decoration:none">All Stories</a><a href="/job-market-data" style="color:#71717a;font-size:14px;margin-left:20px;text-decoration:none">Market Data</a><a href="/dashboard" style="color:#71717a;font-size:14px;margin-left:20px;text-decoration:none">Dashboard</a></nav></div></header>';
  var ftr = o.minimal ? '' : '<footer style="border-top:1px solid #27272a;padding:24px 0;margin-top:48px;text-align:center;font-size:13px;color:#71717a"><div style="max-width:800px;margin:0 auto;padding:0 16px">&copy; 2026 Brilliant Jobs | <a href="/" style="color:#818cf8">Home</a> | <a href="/blog/feed" style="color:#818cf8">RSS</a><!-- v4.66 --></div></footer>';
  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(title)+' | Brilliant Jobs Blog</title><meta name="description" content="'+esc(meta)+'">'+can+noIdx+'<link rel="icon" href="/resources/favicon.png"><link rel="alternate" type="application/rss+xml" title="Brilliant Jobs Blog" href="/blog/feed"><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#0f1117;color:#e4e4e7;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;line-height:1.6}a{color:#818cf8;text-decoration:none}a:hover{text-decoration:underline}.ctn{max-width:800px;margin:0 auto;padding:24px 16px}.card{background:#1a1d27;border:1px solid #27272a;border-radius:12px;padding:24px;margin-bottom:20px;transition:border-color .2s}.card:hover{border-color:#6366f1}.card h2{font-size:20px;margin-bottom:8px}.card h2 a{color:#e4e4e7}.meta{font-size:13px;color:#71717a;margin-bottom:8px;display:flex;gap:12px;flex-wrap:wrap}.cat{background:#6366f1;color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;text-transform:uppercase;font-weight:600}.lede{color:#71717a;font-size:15px;margin-bottom:12px}.bd p{margin-bottom:16px}.bd h3{font-size:18px;margin:24px 0 12px;color:#818cf8}.bd strong{color:#e4e4e7}.mbox{background:#1a1d27;border:1px solid #27272a;border-radius:8px;padding:16px;margin-top:32px;font-size:13px;color:#71717a}.cta-btn{display:inline-block;background:#6366f1;color:#fff;padding:10px 20px;border-radius:8px;font-weight:600;margin-top:16px}.cta-btn:hover{background:#818cf8;text-decoration:none}</style></head><body>'+hdr+body+ftr+'</body></html>';
}

function renderBlogIndex(stories, category) {
  var cards = stories.map(function(s) {
    return '<article class="card"><h2><a href="/blog/'+esc(sl(s))+'">'+esc(s.headline)+'</a></h2><div class="meta"><span class="cat">'+esc(s.category)+'</span><span>'+fmtDate(s.published_at)+'</span><span>'+esc((s.story_type||'').replace(/_/g,' '))+'</span></div><p class="lede">'+esc(s.lede)+'</p><a href="/blog/'+esc(sl(s))+'" style="font-size:14px;font-weight:600">Read more &rarr;</a></article>';
  }).join('\n');
  var cats = ['','trend','location','salary','remote','company'];
  var catLinks = cats.map(function(c) {
    var l = c || 'All'; var a = (c===(category||'')) ? 'font-weight:700;color:#e4e4e7' : '';
    return '<a href="/blog'+(c?'?category='+c:'')+'" style="margin-right:12px;font-size:14px;'+a+'">'+l.charAt(0).toUpperCase()+l.slice(1)+'</a>';
  }).join('');
  return shell((category?category.charAt(0).toUpperCase()+category.slice(1):'All')+' Stories','Data-driven job market insights from Brilliant Jobs.','<div class="ctn"><h1 style="font-size:32px;margin-bottom:8px">Job Market Insights</h1><p style="color:#71717a;margin-bottom:24px">Data-driven stories from 300,000+ tracked job postings</p><div style="margin-bottom:24px;border-bottom:1px solid #27272a;padding-bottom:12px">'+catLinks+'</div>'+(cards||'<p style="color:#71717a;text-align:center;padding:40px 0">No published stories yet.</p>')+'</div>',{canonical:'/blog'});
}

function renderStory(s) {
  var cta = s.evergreen_link ? '<a class="cta-btn" href="'+esc(s.evergreen_link)+'">View Live Data &rarr;</a>' : '<a class="cta-btn" href="/job-market-data">Explore Market Data &rarr;</a>';
  var ld = JSON.stringify({"@context":"https://schema.org","@type":"Article","headline":s.headline,"description":s.meta_description||s.lede,"datePublished":s.published_at,"publisher":{"@type":"Organization","name":"Brilliant Jobs","url":"https://www.brilliantjobs.com"},"mainEntityOfPage":"https://www.brilliantjobs.com/blog/"+sl(s)});
  return shell(s.headline,s.meta_description||s.lede||'','<div class="ctn"><div class="meta" style="margin-bottom:12px"><span class="cat">'+esc(s.category)+'</span><span>'+fmtDate(s.published_at)+'</span></div><h1 style="font-size:28px;margin-bottom:12px">'+esc(s.headline)+'</h1><p style="font-size:18px;color:#71717a;margin-bottom:24px;line-height:1.5">'+esc(s.lede)+'</p><div class="bd" style="font-size:16px;line-height:1.8">'+(s.body_html||'<p>Content coming soon.</p>')+'</div><div class="mbox"><p>Source: Brilliant Jobs platform data'+(s.tags&&s.tags.length?' &mdash; Tags: '+s.tags.map(esc).join(', '):'')+'</p>'+cta+'</div></div><script type="application/ld+json">'+ld+'</script>',{canonical:'/blog/'+sl(s)});
}

function renderPulse(stories) {
  var items = stories.slice(0,5).map(function(s) {
    return '<div style="padding:12px 0;border-bottom:1px solid #27272a"><a href="/blog/'+esc(sl(s))+'" style="font-size:14px;font-weight:600;color:#e4e4e7;display:block;margin-bottom:4px">'+esc(s.headline)+'</a><div style="font-size:12px;color:#71717a;display:flex;gap:8px"><span style="background:#6366f1;color:#fff;padding:1px 6px;border-radius:3px;font-size:10px">'+esc(s.category)+'</span><span>'+fmtDate(s.published_at)+'</span></div></div>';
  }).join('');
  return '<div style="background:#1a1d27;border:1px solid #27272a;border-radius:10px;padding:16px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#e4e4e7"><div style="font-size:13px;font-weight:600;color:#71717a;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Market Pulse</div>'+(items||'<div style="color:#71717a;font-size:14px;padding:12px 0">No stories yet</div>')+'<div style="text-align:right;margin-top:8px"><a href="/blog" style="font-size:13px;color:#6366f1">All stories &rarr;</a></div></div>';
}

function renderEmbed(s) {
  return shell(s.headline,s.social_snippet||s.lede||'','<div style="padding:20px"><div style="font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Brilliant Jobs Insight</div><h2 style="font-size:18px;margin-bottom:8px;color:#e4e4e7">'+esc(s.headline)+'</h2><p style="font-size:14px;color:#71717a;margin-bottom:12px">'+esc(s.lede)+'</p><a href="https://www.brilliantjobs.com/blog/'+esc(sl(s))+'" target="_blank" style="font-size:13px;color:#6366f1;font-weight:600">Read full story &rarr;</a></div>',{minimal:true,noIndex:true});
}

function renderRSS(stories) {
  var items = stories.map(function(s) {
    return '<item><title><![CDATA['+s.headline+']]></title><link>https://www.brilliantjobs.com/blog/'+sl(s)+'</link><description><![CDATA['+(s.lede||'')+']]></description><pubDate>'+new Date(s.published_at||s.created_at).toUTCString()+'</pubDate><guid>https://www.brilliantjobs.com/blog/'+sl(s)+'</guid><category>'+(s.category||'')+'</category></item>';
  }).join('\n');
  return '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>Brilliant Jobs Market Insights</title><link>https://www.brilliantjobs.com/blog</link><description>Data-driven job market insights</description><language>en-us</language><lastBuildDate>'+new Date().toUTCString()+'</lastBuildDate><atom:link href="https://www.brilliantjobs.com/blog/feed" rel="self" type="application/rss+xml"/>'+items+'</channel></rss>';
}

module.exports = async function handler(req, res) {
  try {
    var mode = req.query.mode || 'blog';
    var category = req.query.category || '';
    var qslug = req.query.slug || '';
    var qid = req.query.id || '';

    if (mode === 'blog') {
      var stories = await fetchPublished({ limit: 50, category: category || undefined });
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
      return res.status(200).send(renderBlogIndex(stories, category || undefined));
    }
    if (mode === 'story') {
      if (!qslug) return res.status(400).send('Missing slug');
      var stories = await fetchPublished({ slug: qslug });
      if (!stories.length && /^\d+$/.test(qslug)) stories = await fetchPublished({ id: parseInt(qslug) });
      if (!stories.length) return res.status(404).send(shell('Not Found','','<div class="ctn"><h1>Story not found</h1><p><a href="/blog">Back to blog</a></p></div>'));
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
      return res.status(200).send(renderStory(stories[0]));
    }
    if (mode === 'feed') {
      var stories = await fetchPublished({ limit: 20, category: category || undefined });
      var feed = stories.map(function(s) { return { id:s.id, headline:s.headline, lede:s.lede, category:s.category, story_type:s.story_type, published_at:s.published_at, url:'/blog/'+sl(s), social_snippet:s.social_snippet, evergreen_link:s.evergreen_link, tags:s.tags }; });
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=1800');
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(200).json(feed);
    }
    if (mode === 'pulse') {
      var stories = await fetchPublished({ limit: 5 });
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=1800');
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(200).send(renderPulse(stories));
    }
    if (mode === 'embed') {
      if (!qid) return res.status(400).send('Missing id');
      var stories = await fetchPublished({ id: parseInt(qid) });
      if (!stories.length) return res.status(404).send('Story not found');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
      return res.status(200).send(renderEmbed(stories[0]));
    }
    if (mode === 'rss') {
      var stories = await fetchPublished({ limit: 30 });
      res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
      res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
      return res.status(200).send(renderRSS(stories));
    }
    return res.status(400).send('Unknown mode');
  } catch (err) {
    console.error('content.js error:', err);
    return res.status(500).send('Error: ' + String(err.message || err));
  }
};
