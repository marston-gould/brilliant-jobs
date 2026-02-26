/**
 * /api/content.js v2 — Content distribution with Pod 1 spec compliance
 * Enhancements: OG tags, share bar, related stories, signup CTA,
 * load-more pagination, attribution embed bar, proper title suffix
 */
const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://qojhagupdnbtomfoxnsf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvamhhZ3VwZG5idG9tZm94bnNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NjkwNjYsImV4cCI6MjA4NjE0NTA2Nn0.0AFgnrN7omBC4Jg8G0kxZACn5mXLWPazIodI6JOx1rg';
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
var COLS = 'id,story_type,category,headline,lede,body_html,meta_description,social_snippet,chart_config,evergreen_link,score,status,tags,published_at,published_slug,data_points,created_at';

async function fetchPublished(opts) {
  opts = opts || {};
  var q = sb.from('content_stories').select(COLS).eq('status', 'published')
    .order('published_at', { ascending: false, nullsFirst: false }).limit(opts.limit || 20);
  if (opts.id) q = q.eq('id', opts.id);
  if (opts.slug) q = q.eq('published_slug', opts.slug);
  if (opts.category) q = q.eq('category', opts.category);
  if (opts.offset) q = q.range(opts.offset, opts.offset + (opts.limit || 20) - 1);
  if (opts.notCategory) q = q.neq('category', opts.notCategory);
  if (opts.notId) q = q.neq('id', opts.notId);
  var r = await q;
  return (r.data || []);
}

function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'}) : ''; }
function sl(s) { return s.published_slug || ('story-' + s.id); }

// Extract key stat from data_points per Pod 1 spec
function keyStat(dp) {
  if (!dp) return '';
  if (dp.pct_change != null) return (dp.pct_change > 0 ? '+' : '') + dp.pct_change + '%';
  if (dp.median_salary) return '$' + Math.round(dp.median_salary / 1000) + 'K';
  if (dp.current) return '$' + Math.round(dp.current / 1000) + 'K';
  if (dp.recent) return dp.recent.toLocaleString() + ' jobs';
  if (dp.count) return dp.count.toLocaleString() + ' jobs';
  if (dp.current_count) return dp.current_count.toLocaleString() + ' jobs';
  if (dp.remote_pct) return dp.remote_pct + '% remote';
  if (dp.total_jobs) return dp.total_jobs.toLocaleString() + ' jobs';
  return '';
}

var catColors = {salary:'#22c55e',location:'#3b82f6',remote:'#8b5cf6',company:'#f97316',trend:'#14b8a6',milestone:'#eab308'};

function shell(title, meta, body, o) {
  o = o || {};
  var can = o.canonical ? '<link rel="canonical" href="https://brilliantjobs.app'+o.canonical+'">' : '';
  var noIdx = o.noIndex ? '<meta name="robots" content="noindex">' : '';
  var ogTitle = o.ogTitle || title;
  var ogDesc = o.ogDesc || meta;
  var ogUrl = o.canonical ? 'https://brilliantjobs.app' + o.canonical : '';

  var hdr = o.minimal ? '' : '<header style="border-bottom:1px solid #27272a;padding:16px 0;margin-bottom:32px"><div style="max-width:800px;margin:0 auto;padding:0 16px;display:flex;justify-content:space-between;align-items:center"><a href="/" style="font-size:18px;font-weight:700;color:#e4e4e7;text-decoration:none">Brilliant<span style="color:#6366f1">Jobs</span></a><nav><a href="/data-lab" style="color:#71717a;font-size:14px;margin-left:20px;text-decoration:none">Data Lab</a><a href="/blog" style="color:#e4e4e7;font-size:14px;margin-left:20px;text-decoration:none;font-weight:600">Blog</a><a href="/dashboard" style="color:#71717a;font-size:14px;margin-left:20px;text-decoration:none">Dashboard</a></nav></div></header>';
  var ftr = o.minimal ? '' : '<footer style="border-top:1px solid #27272a;padding:24px 0;margin-top:48px;text-align:center;font-size:13px;color:#71717a"><div style="max-width:800px;margin:0 auto;padding:0 16px">&copy; 2026 Brilliant Jobs | <a href="/" style="color:#818cf8">Home</a> | <a href="/blog/feed" style="color:#818cf8">RSS</a><!-- v4.67 --></div></footer>';

  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>' + esc(title) + ' | Brilliant Jobs Market Intelligence</title>'
    + '<meta name="description" content="' + esc(meta) + '">'
    + can + noIdx
    + '<meta property="og:title" content="' + esc(ogTitle) + '">'
    + '<meta property="og:description" content="' + esc(ogDesc) + '">'
    + '<meta property="og:type" content="' + (o.ogType || 'website') + '">'
    + (ogUrl ? '<meta property="og:url" content="' + ogUrl + '">' : '')
    + '<meta property="og:image" content="https://brilliantjobs.app/resources/og-default.png">'
    + '<meta name="twitter:card" content="summary_large_image">'
    + '<link rel="icon" href="/resources/favicon.png">'
    + '<link rel="alternate" type="application/rss+xml" title="Brilliant Jobs Market Intelligence" href="/blog/feed">'
    + '<style>*{margin:0;padding:0;box-sizing:border-box}body{background:#0f1117;color:#e4e4e7;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;line-height:1.6}a{color:#818cf8;text-decoration:none}a:hover{text-decoration:underline}.ctn{max-width:800px;margin:0 auto;padding:24px 16px}'
    + '.card{background:#1a1d27;border:1px solid #27272a;border-radius:12px;padding:24px;margin-bottom:20px;transition:border-color .2s}.card:hover{border-color:#6366f1}'
    + '.card h2{font-size:20px;margin-bottom:8px}.card h2 a{color:#e4e4e7}'
    + '.meta{font-size:13px;color:#71717a;margin-bottom:8px;display:flex;gap:12px;flex-wrap:wrap;align-items:center}'
    + '.cat{padding:2px 8px;border-radius:4px;font-size:11px;text-transform:uppercase;font-weight:600;color:#fff}'
    + '.lede{color:#71717a;font-size:15px;margin-bottom:12px}'
    + '.bd p{margin-bottom:16px}.bd h3{font-size:18px;margin:24px 0 12px;color:#818cf8}.bd strong{color:#e4e4e7}'
    + '.mbox{background:#1a1d27;border:1px solid #27272a;border-radius:8px;padding:16px;margin-top:32px;font-size:13px;color:#71717a}'
    + '.cta-btn{display:inline-block;background:#6366f1;color:#fff;padding:10px 20px;border-radius:8px;font-weight:600;margin-top:12px;text-decoration:none}.cta-btn:hover{background:#818cf8;text-decoration:none}'
    + '.cta-banner{background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:12px;padding:32px;text-align:center;margin:40px 0}'
    + '.cta-banner h3{font-size:20px;color:#fff;margin-bottom:8px}.cta-banner p{color:#c7d2fe;margin-bottom:16px;font-size:15px}'
    + '.share-bar{display:flex;gap:12px;align-items:center;margin:24px 0;padding:16px 0;border-top:1px solid #27272a;border-bottom:1px solid #27272a}'
    + '.share-btn{display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:6px;font-size:13px;font-weight:500;border:1px solid #27272a;color:#a1a1aa;background:transparent;cursor:pointer;text-decoration:none}.share-btn:hover{border-color:#6366f1;color:#e4e4e7;text-decoration:none}'
    + '.key-stat{font-size:22px;font-weight:700;color:#6366f1}'
    + '</style></head><body>' + hdr + body + ftr + '</body></html>';
}

function renderCard(s, compact) {
  var color = catColors[s.category] || '#6366f1';
  var ks = keyStat(s.data_points);
  if (compact) {
    return '<div style="min-width:200px;flex:0 0 auto;background:#1a1d27;border:1px solid #27272a;border-radius:10px;padding:16px;cursor:pointer" onclick="location.href=\'/blog/'+esc(sl(s))+'\'">'
      + '<span class="cat" style="background:'+color+'">'+esc(s.category)+'</span>'
      + '<div style="font-size:14px;font-weight:600;margin:8px 0 4px;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">'+esc(s.headline)+'</div>'
      + (ks ? '<div class="key-stat">'+esc(ks)+'</div>' : '')
      + '<a href="/blog/'+esc(sl(s))+'" style="font-size:12px">Read &rarr;</a></div>';
  }
  return '<article class="card"><h2><a href="/blog/'+esc(sl(s))+'">'+esc(s.headline)+'</a></h2>'
    + '<div class="meta"><span class="cat" style="background:'+color+'">'+esc(s.category)+'</span><span>'+fmtDate(s.published_at)+'</span><span>'+esc((s.story_type||'').replace(/_/g,' '))+'</span>'
    + (ks ? '<span class="key-stat" style="font-size:14px">'+esc(ks)+'</span>' : '')
    + '</div><p class="lede" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">'+esc(s.lede)+'</p>'
    + '<a href="/blog/'+esc(sl(s))+'" style="font-size:14px;font-weight:600">Read more &rarr;</a></article>';
}

function renderBlogIndex(stories, category, offset) {
  var cards = stories.slice(0, 10).map(function(s) { return renderCard(s); }).join('\n');
  var cats = ['','trend','location','salary','remote','company'];
  var catLinks = cats.map(function(c) {
    var l = c || 'All'; var a = (c===(category||'')) ? 'font-weight:700;color:#e4e4e7' : '';
    return '<a href="/blog'+(c?'?category='+c:'')+'" style="margin-right:12px;font-size:14px;'+a+'">'+l.charAt(0).toUpperCase()+l.slice(1)+'</a>';
  }).join('');
  var loadMore = stories.length > 10 ? '<div style="text-align:center;margin:24px 0"><a href="/blog?offset='+((offset||0)+10)+(category?'&category='+category:'')+'" class="cta-btn" style="background:#27272a">Load more</a></div>' : '';
  var ctaBanner = '<div class="cta-banner"><h3>Get personalized market intelligence</h3><p>Sign up free to track salaries, hiring trends, and job market data.</p><a href="/dashboard" class="cta-btn" style="background:#fff;color:#6366f1">Sign up free &rarr;</a></div>';

  return shell('Market Intelligence','Data-driven job market insights from Brilliant Jobs.',
    '<div class="ctn"><h1 style="font-size:32px;margin-bottom:8px">Market Intelligence</h1>'
    + '<p style="color:#71717a;margin-bottom:24px">Data-driven insights from the job market, updated daily.</p>'
    + '<div style="margin-bottom:24px;border-bottom:1px solid #27272a;padding-bottom:12px">'+catLinks+'</div>'
    + (cards||'<p style="color:#71717a;text-align:center;padding:40px 0">No published stories yet.</p>')
    + loadMore + ctaBanner + '</div>',
    {canonical:'/blog'});
}

function renderStory(s, related) {
  var color = catColors[s.category] || '#6366f1';
  var ks = keyStat(s.data_points);
  var cta = s.evergreen_link ? '<a class="cta-btn" href="'+esc(s.evergreen_link)+'">Explore the full data &rarr;</a>' : '<a class="cta-btn" href="/job-market-data">Explore the full data &rarr;</a>';
  var storyUrl = 'https://brilliantjobs.app/blog/' + sl(s);
  var encodedUrl = encodeURIComponent(storyUrl);
  var encodedTitle = encodeURIComponent(s.headline);

  // Share bar
  var shareBar = '<div class="share-bar"><span style="font-size:13px;color:#71717a;font-weight:600">Share:</span>'
    + '<a class="share-btn" href="https://www.linkedin.com/sharing/share-offsite/?url='+encodedUrl+'" target="_blank" rel="noopener">LinkedIn</a>'
    + '<a class="share-btn" href="https://twitter.com/intent/tweet?url='+encodedUrl+'&text='+encodedTitle+'" target="_blank" rel="noopener">X / Twitter</a>'
    + '<button class="share-btn" onclick="navigator.clipboard.writeText(\''+storyUrl+'\');this.textContent=\'Copied!\'">Copy link</button>'
    + '</div>';

  // Related stories
  var relatedHtml = '';
  if (related && related.length) {
    relatedHtml = '<div style="margin-top:40px"><h3 style="font-size:16px;color:#71717a;margin-bottom:16px;text-transform:uppercase;letter-spacing:.5px">More from Market Intelligence</h3>'
      + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px">'
      + related.map(function(r) { return renderCard(r, true); }).join('')
      + '</div></div>';
  }

  // CTA banner
  var ctaBanner = '<div class="cta-banner"><h3>Get personalized market intelligence</h3><p>Sign up free to track salaries, hiring trends, and job market data.</p><a href="/dashboard" class="cta-btn" style="background:#fff;color:#6366f1">Sign up free &rarr;</a></div>';

  // JSON-LD
  var ld = JSON.stringify({"@context":"https://schema.org","@type":"Article","headline":s.headline,"description":s.meta_description||s.lede,"datePublished":s.published_at,"publisher":{"@type":"Organization","name":"Brilliant Jobs","url":"https://brilliantjobs.app"},"mainEntityOfPage":storyUrl});

  return shell(s.headline, s.meta_description||s.lede||'',
    '<div class="ctn">'
    + '<div class="meta" style="margin-bottom:12px"><span class="cat" style="background:'+color+'">'+esc(s.category)+'</span><span>'+fmtDate(s.published_at)+'</span></div>'
    + '<h1 style="font-size:28px;margin-bottom:12px">'+esc(s.headline)+'</h1>'
    + '<p style="font-size:18px;color:#71717a;margin-bottom:24px;line-height:1.5">'+esc(s.lede)+'</p>'
    + (ks ? '<div class="key-stat" style="margin-bottom:24px">'+esc(ks)+'</div>' : '')
    + '<div class="bd" style="font-size:16px;line-height:1.8;max-width:680px">'+(s.body_html||'<p>Content coming soon.</p>')+'</div>'
    + '<div class="mbox"><p>Source: Brilliant Jobs &mdash; real-time data from 300,000+ positions across 8,600+ companies.'+(s.tags&&s.tags.length?' Tags: '+s.tags.map(esc).join(', '):'')+'</p>'+cta+'<span style="margin-left:12px"><a href="/dashboard" class="cta-btn" style="background:#27272a;padding:8px 16px;font-size:13px">Sign up free &rarr;</a></span></div>'
    + shareBar + relatedHtml + ctaBanner
    + '</div><script type="application/ld+json">'+ld+'</script>',
    {canonical:'/blog/'+sl(s), ogType:'article', ogTitle:s.headline, ogDesc:s.social_snippet||s.lede||''});
}

function renderPulse(stories) {
  var items = stories.slice(0,5).map(function(s) {
    var color = catColors[s.category] || '#6366f1';
    var ks = keyStat(s.data_points);
    return '<div style="padding:12px 0;border-bottom:1px solid #27272a">'
      + '<a href="/blog/'+esc(sl(s))+'" style="font-size:14px;font-weight:600;color:#e4e4e7;display:block;margin-bottom:4px">'+esc(s.headline)+'</a>'
      + '<div style="font-size:12px;color:#71717a;display:flex;gap:8px;align-items:center">'
      + '<span style="background:'+color+';color:#fff;padding:1px 6px;border-radius:3px;font-size:10px">'+esc(s.category)+'</span>'
      + (ks ? '<span style="font-weight:700;color:#6366f1">'+esc(ks)+'</span>' : '')
      + '<span>'+fmtDate(s.published_at)+'</span></div></div>';
  }).join('');
  return '<div style="background:#1a1d27;border:1px solid #27272a;border-radius:10px;padding:16px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#e4e4e7">'
    + '<div style="font-size:13px;font-weight:600;color:#71717a;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Market Pulse</div>'
    + (items||'<div style="color:#71717a;font-size:14px;padding:12px 0">No stories yet</div>')
    + '<div style="text-align:right;margin-top:8px"><a href="/blog" style="font-size:13px;color:#6366f1">All stories &rarr;</a></div></div>';
}

function renderEmbed(s) {
  var attrBar = '<div style="height:32px;background:#f8fafc;border-top:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between;padding:0 12px;font-family:-apple-system,sans-serif">'
    + '<span style="font-size:11px;color:#64748b">&#128202; Source: Brilliant Jobs</span>'
    + '<a href="https://brilliantjobs.app/blog/'+esc(sl(s))+'" target="_blank" rel="noopener" style="font-size:11px;color:#6366f1;text-decoration:none;font-weight:500">View full &rarr;</a></div>';
  return shell(s.headline,s.social_snippet||s.lede||'',
    '<div style="padding:20px;min-height:calc(100% - 32px)">'
    + '<div style="font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Brilliant Jobs Insight</div>'
    + '<h2 style="font-size:18px;margin-bottom:8px;color:#e4e4e7">'+esc(s.headline)+'</h2>'
    + '<p style="font-size:14px;color:#71717a;margin-bottom:12px">'+esc(s.lede)+'</p>'
    + (keyStat(s.data_points) ? '<div class="key-stat" style="margin-bottom:12px">'+esc(keyStat(s.data_points))+'</div>' : '')
    + '</div>' + attrBar,
    {minimal:true,noIndex:true});
}

// Merchandising JSON: for index + data lab to fetch client-side
function renderMerchJSON(stories, limit, dedup) {
  var seen = {};
  var result = [];
  for (var i = 0; i < stories.length && result.length < limit; i++) {
    var s = stories[i];
    if (dedup && seen[s.category]) continue;
    seen[s.category] = true;
    result.push({id:s.id, headline:s.headline, lede:s.lede, category:s.category,
      slug:sl(s), key_stat:keyStat(s.data_points), published_at:s.published_at,
      score:s.score, tags:s.tags, data_points:s.data_points});
  }
  return result;
}

function renderRSS(stories) {
  var items = stories.map(function(s) {
    return '<item><title><![CDATA['+s.headline+']]></title><link>https://brilliantjobs.app/blog/'+sl(s)+'</link><description><![CDATA['+(s.lede||'')+']]></description><pubDate>'+new Date(s.published_at||s.created_at).toUTCString()+'</pubDate><guid>https://brilliantjobs.app/blog/'+sl(s)+'</guid><category>'+(s.category||'')+'</category></item>';
  }).join('\n');
  return '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>Brilliant Jobs Market Intelligence</title><link>https://brilliantjobs.app/blog</link><description>Data-driven job market insights</description><language>en-us</language><lastBuildDate>'+new Date().toUTCString()+'</lastBuildDate><atom:link href="https://brilliantjobs.app/blog/feed" rel="self" type="application/rss+xml"/>'+items+'</channel></rss>';
}

module.exports = async function handler(req, res) {
  try {
    var mode = req.query.mode || 'blog';
    var category = req.query.category || '';
    var qslug = req.query.slug || '';
    var qid = req.query.id || '';
    var offset = parseInt(req.query.offset) || 0;

    if (mode === 'blog') {
      var stories = await fetchPublished({ limit: 11, category: category||undefined, offset: offset });
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
      return res.status(200).send(renderBlogIndex(stories, category||undefined, offset));
    }
    if (mode === 'story') {
      if (!qslug) return res.status(400).send('Missing slug');
      var stories = await fetchPublished({ slug: qslug });
      if (!stories.length && /^\d+$/.test(qslug)) stories = await fetchPublished({ id: parseInt(qslug) });
      if (!stories.length) return res.status(404).send(shell('Not Found','','<div class="ctn"><h1>Story not found</h1><p><a href="/blog">&larr; Back to blog</a></p></div>'));
      var story = stories[0];
      // Fetch 3 related stories from different category
      var related = await fetchPublished({ limit: 3, notCategory: story.category, notId: story.id });
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
      return res.status(200).send(renderStory(story, related));
    }
    if (mode === 'feed') {
      var stories = await fetchPublished({ limit: 20, category: category||undefined });
      var feed = stories.map(function(s) { return {id:s.id,headline:s.headline,lede:s.lede,category:s.category,story_type:s.story_type,published_at:s.published_at,url:'/blog/'+sl(s),social_snippet:s.social_snippet,evergreen_link:s.evergreen_link,tags:s.tags,key_stat:keyStat(s.data_points)}; });
      res.setHeader('Content-Type','application/json');
      res.setHeader('Cache-Control','s-maxage=900, stale-while-revalidate=1800');
      res.setHeader('Access-Control-Allow-Origin','*');
      return res.status(200).json(feed);
    }
    if (mode === 'pulse') {
      var stories = await fetchPublished({ limit: 5 });
      res.setHeader('Content-Type','text/html; charset=utf-8');
      res.setHeader('Cache-Control','s-maxage=900, stale-while-revalidate=1800');
      res.setHeader('Access-Control-Allow-Origin','*');
      return res.status(200).send(renderPulse(stories));
    }
    if (mode === 'embed') {
      if (!qid) return res.status(400).send('Missing id');
      var stories = await fetchPublished({ id: parseInt(qid) });
      if (!stories.length) return res.status(404).send('Story not found');
      res.setHeader('Content-Type','text/html; charset=utf-8');
      res.setHeader('Cache-Control','s-maxage=3600, stale-while-revalidate=7200');
      res.setHeader('X-Frame-Options','ALLOWALL');
      res.setHeader('Access-Control-Allow-Origin','*');
      return res.status(200).send(renderEmbed(stories[0]));
    }
    if (mode === 'rss') {
      var stories = await fetchPublished({ limit: 30 });
      res.setHeader('Content-Type','application/rss+xml; charset=utf-8');
      res.setHeader('Cache-Control','s-maxage=1800, stale-while-revalidate=3600');
      return res.status(200).send(renderRSS(stories));
    }
    // Merchandising JSON endpoints
    if (mode === 'merch-index') {
      var stories = await fetchPublished({ limit: 10 });
      res.setHeader('Content-Type','application/json');
      res.setHeader('Cache-Control','s-maxage=900, stale-while-revalidate=1800');
      res.setHeader('Access-Control-Allow-Origin','*');
      return res.status(200).json(renderMerchJSON(stories, 3, true));
    }
    if (mode === 'merch-datalab') {
      var stories = await fetchPublished({ limit: 15 });
      res.setHeader('Content-Type','application/json');
      res.setHeader('Cache-Control','s-maxage=900, stale-while-revalidate=1800');
      res.setHeader('Access-Control-Allow-Origin','*');
      return res.status(200).json(renderMerchJSON(stories, 5, true));
    }
    if (mode === 'merch-dashboard') {
      // Dashboard cards: return top 2 highest-scoring recent stories
      // Filter-aware matching would need user context — for now return top 2
      var stories = await fetchPublished({ limit: 6 });
      res.setHeader('Content-Type','application/json');
      res.setHeader('Cache-Control','s-maxage=300, stale-while-revalidate=600');
      res.setHeader('Access-Control-Allow-Origin','*');
      return res.status(200).json(renderMerchJSON(stories, 2, true));
    }
    return res.status(400).send('Unknown mode');
  } catch (err) {
    console.error('content.js error:', err);
    return res.status(500).send('Error: ' + String(err.message || err));
  }
};
