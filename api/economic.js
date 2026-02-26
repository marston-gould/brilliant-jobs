/**
 * /api/economic.js — Economic indicators API
 * Serves economic data for Data Lab pages, blog context enrichment, and dashboard widgets
 */
const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://qojhagupdnbtomfoxnsf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvamhhZ3VwZG5idG9tZm94bnNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NjkwNjYsImV4cCI6MjA4NjE0NTA2Nn0.0AFgnrN7omBC4Jg8G0kxZACn5mXLWPazIodI6JOx1rg';
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

module.exports = async function handler(req, res) {
  try {
    var mode = req.query.mode || 'dashboard';
    var source = req.query.source || '';
    var series = req.query.series || '';

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');

    if (mode === 'dashboard') {
      // Dashboard widget: latest value per key series
      var keySeries = [
        'LNS14000000', 'CES0000000001', 'JTS000000000000000JOL',
        'FEDFUNDS', 'ICSA', 'UMCSENT', 'CES0500000003', 'CIVPART',
        'T10Y2Y', 'CUUR0000SA0'
      ];
      var { data, error } = await sb
        .from('economic_indicators')
        .select('source,series_id,indicator_name,period_start,value,unit')
        .in('series_id', keySeries)
        .order('period_start', { ascending: false })
        .limit(200);

      if (error) return res.status(500).json({ error: error.message });

      // Deduplicate to latest per series
      var latest = {};
      (data || []).forEach(function(r) {
        if (!latest[r.series_id] || r.period_start > latest[r.series_id].period_start) {
          latest[r.series_id] = r;
        }
      });

      return res.status(200).json({
        mode: 'dashboard',
        updated_at: new Date().toISOString(),
        indicators: Object.values(latest)
      });
    }

    if (mode === 'series') {
      // Full time series for a specific indicator
      if (!series) return res.status(400).json({ error: 'Missing series param' });
      var q = sb.from('economic_indicators')
        .select('period_start,value,unit,metadata')
        .eq('series_id', series)
        .order('period_start', { ascending: true });
      if (source) q = q.eq('source', source);
      var { data, error } = await q.limit(500);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ series_id: series, data: data || [] });
    }

    if (mode === 'context') {
      // Economic context events for blog enrichment
      var { data, error } = await sb
        .from('economic_context')
        .select('*')
        .order('relevance_score', { ascending: false })
        .limit(20);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ events: data || [] });
    }

    if (mode === 'correlations') {
      var { data, error } = await sb
        .from('economic_correlations')
        .select('*')
        .order('computed_at', { ascending: false })
        .limit(20);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ correlations: data || [] });
    }

    if (mode === 'all-series') {
      // List all available series with latest values
      var { data, error } = await sb
        .from('economic_indicators')
        .select('source,series_id,indicator_name,period_start,value,unit')
        .order('period_start', { ascending: false })
        .limit(1000);
      if (error) return res.status(500).json({ error: error.message });

      var latest = {};
      (data || []).forEach(function(r) {
        if (!latest[r.series_id]) latest[r.series_id] = r;
      });

      return res.status(200).json({
        series_count: Object.keys(latest).length,
        series: Object.values(latest).sort(function(a, b) {
          return a.source.localeCompare(b.source) || a.indicator_name.localeCompare(b.indicator_name);
        })
      });
    }

    return res.status(400).json({ error: 'Unknown mode. Use: dashboard, series, context, correlations, all-series' });
  } catch (err) {
    return res.status(500).json({ error: String(err.message || err) });
  }
};
