// @ts-nocheck
/**
 * aggregations.js — Shared aggregation functions for Brilliant Jobs
 *
 * Used by:
 *   - Dashboard stats.js (client-side, imported via <script>)
 *   - Vercel serverless /api/seo-page (server-side, required via Node)
 *
 * All functions are pure: rows in → data out. No DOM, no Supabase, no side effects.
 */

(function (exports) {
  'use strict';

  // =========================================================================
  // Level hierarchy — must match tuning.js DEFAULT_LEVELS
  // =========================================================================
  var DEFAULT_LEVELS = [
    { label: 'C-Suite', keywords: 'ceo, cto, cmo, cfo, cro, coo, chief' },
    { label: 'VP', keywords: 'vice president, vp, svp, evp' },
    { label: 'Sr Director', keywords: 'senior director, sr director, sr. director' },
    { label: 'Director', keywords: 'director' },
    { label: 'Assoc Director', keywords: 'associate director, asst director, assistant director' },
    { label: 'Sr Manager', keywords: 'senior manager, sr manager, sr. manager' },
    { label: 'Lead', keywords: 'lead, principal, head of' },
    { label: 'Manager', keywords: 'manager' },
    { label: 'Senior', keywords: 'senior, sr, sr.' },
    { label: 'Staff', keywords: 'staff' },
    { label: 'Mid', keywords: 'associate, coordinator' },
    { label: 'Entry', keywords: 'junior, jr, intern, entry' },
  ];

  // =========================================================================
  // getJobLevel — classify title into seniority level
  // =========================================================================
  function getJobLevel(title, hierarchy) {
    var levels = hierarchy || DEFAULT_LEVELS;
    if (!title || levels.length === 0) return null;
    var t = ' ' + title.toLowerCase() + ' ';
    var entries = [];
    levels.forEach(function (lvl, rank) {
      (lvl.keywords || '').split(',').forEach(function (kw) {
        var k = kw.trim().toLowerCase();
        if (k) entries.push({ keyword: k, rank: rank, label: lvl.label });
      });
    });
    entries.sort(function (a, b) { return b.keyword.length - a.keyword.length; });
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      var escaped = e.keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      var re = new RegExp('(?:^|[\\s,\\-\\/\\(])' + escaped + '(?:[\\s,\\-\\/\\)]|$)', 'i');
      if (re.test(t)) return { rank: e.rank, label: e.label };
    }
    return null;
  }

  // =========================================================================
  // bucketSalaries — bin salary values into $25K ranges
  // =========================================================================
  function bucketSalaries(rows, bucketSize) {
    bucketSize = bucketSize || 25000;
    var buckets = {};
    rows.forEach(function (r) {
      var sal = r.salary_min || r.salary_max;
      if (!sal || sal <= 0) return;
      var b = Math.floor(sal / bucketSize) * bucketSize;
      var label = '$' + (b / 1000) + 'K-$' + ((b + bucketSize) / 1000) + 'K';
      buckets[label] = (buckets[label] || 0) + 1;
    });
    return buckets;
  }

  // =========================================================================
  // countByLevel — count jobs per seniority level
  // =========================================================================
  function countByLevel(rows, hierarchy) {
    var counts = {};
    var levels = hierarchy || DEFAULT_LEVELS;
    levels.forEach(function (l) { counts[l.label] = 0; });
    counts['Other'] = 0;
    rows.forEach(function (r) {
      var lvl = getJobLevel(r.title, levels);
      var label = lvl ? lvl.label : 'Other';
      counts[label] = (counts[label] || 0) + 1;
    });
    return counts;
  }

  // =========================================================================
  // countByLocType — remote / on-site / hybrid / unspecified
  // =========================================================================
  function countByLocType(rows) {
    var counts = { Remote: 0, 'On-site': 0, Hybrid: 0, Unspecified: 0 };
    rows.forEach(function (r) {
      var loc = (r.location || '').toLowerCase();
      var lt = (r.loc_type || '').toLowerCase();
      if (lt === 'remote' || r.is_remote || loc.startsWith('remote')) counts.Remote++;
      else if (lt === 'hybrid' || loc.indexOf('hybrid') !== -1) counts.Hybrid++;
      else if (r.location && r.location.trim()) counts['On-site']++;
      else counts.Unspecified++;
    });
    return counts;
  }

  // =========================================================================
  // bucketByWeek — group rows by ISO week of first_seen_at
  // =========================================================================
  function bucketByWeek(rows, dateField) {
    dateField = dateField || 'first_seen_at';
    var weekMap = {};
    rows.forEach(function (r) {
      if (!r[dateField]) return;
      var d = new Date(r[dateField]);
      var day = d.getUTCDay();
      var mon = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - (day === 0 ? 6 : day - 1)));
      var key = mon.toISOString().slice(0, 10);
      weekMap[key] = (weekMap[key] || 0) + 1;
    });
    // Sort by week
    var sorted = Object.keys(weekMap).sort();
    return sorted.map(function (week) {
      return { week: week, count: weekMap[week] };
    });
  }

  // =========================================================================
  // topCompaniesByCount — top N companies by job count
  // =========================================================================
  function topCompaniesByCount(rows, limit) {
    limit = limit || 20;
    var counts = {};
    rows.forEach(function (r) {
      if (r.company_name) counts[r.company_name] = (counts[r.company_name] || 0) + 1;
    });
    return Object.entries(counts)
      .sort(function (a, b) { return b[1] - a[1]; })
      .slice(0, limit)
      .map(function (e) { return { name: e[0], count: e[1] }; });
  }

  // =========================================================================
  // countByAtsSource — breakdown by ATS platform
  // =========================================================================
  function countByAtsSource(rows) {
    var counts = {};
    rows.forEach(function (r) {
      var src = r.ats_source || 'unknown';
      counts[src] = (counts[src] || 0) + 1;
    });
    return counts;
  }

  // =========================================================================
  // computeMedianSalary — median of salary_min (or salary_max as fallback)
  // =========================================================================
  function computeMedianSalary(rows) {
    var sals = [];
    rows.forEach(function (r) {
      var v = r.salary_min || r.salary_max;
      if (v && v > 0) sals.push(v);
    });
    if (sals.length === 0) return null;
    sals.sort(function (a, b) { return a - b; });
    var mid = Math.floor(sals.length / 2);
    return sals.length % 2 === 0
      ? Math.round((sals[mid - 1] + sals[mid]) / 2)
      : sals[mid];
  }

  // =========================================================================
  // computeVelocityChange — % change between two time periods
  // =========================================================================
  function computeVelocityChange(rows, currentStart, priorStart, priorEnd) {
    var current = 0, prior = 0;
    var csMs = new Date(currentStart).getTime();
    var psMs = new Date(priorStart).getTime();
    var peMs = new Date(priorEnd).getTime();
    rows.forEach(function (r) {
      if (!r.first_seen_at) return;
      var ts = new Date(r.first_seen_at).getTime();
      if (ts >= csMs) current++;
      else if (ts >= psMs && ts < peMs) prior++;
    });
    if (prior === 0) return { change: 0, current: current, prior: prior };
    return {
      change: Math.round(((current - prior) / prior) * 1000) / 10,
      current: current,
      prior: prior
    };
  }

  // =========================================================================
  // roundToThreshold — round down to nearest N, append "+"
  //   e.g. roundToThreshold(298733, 50000) → "250K+"
  // =========================================================================
  function roundToThreshold(count, threshold) {
    threshold = threshold || 50000;
    var rounded = Math.floor(count / threshold) * threshold;
    if (rounded >= 1000000) return Math.floor(rounded / 1000000) + 'M+';
    if (rounded >= 1000) return Math.floor(rounded / 1000) + 'K+';
    return rounded + '+';
  }

  // =========================================================================
  // computeSeniorPlusPct — % of jobs at Senior level or above
  // =========================================================================
  function computeSeniorPlusPct(rows, hierarchy) {
    var seniorLabels = { Senior: 1, Staff: 1, Lead: 1, Principal: 1, Manager: 1,
      'Sr Manager': 1, Director: 1, 'Sr Director': 1, 'Assoc Director': 1, VP: 1, 'C-Suite': 1 };
    var levels = hierarchy || DEFAULT_LEVELS;
    var total = rows.length;
    if (total === 0) return 0;
    var senior = 0;
    rows.forEach(function (r) {
      var lvl = getJobLevel(r.title, levels);
      if (lvl && seniorLabels[lvl.label]) senior++;
    });
    return Math.round((senior / total) * 100);
  }

  // =========================================================================
  // formatSalary — compact salary display ($125K, $1.2M)
  // =========================================================================
  function formatSalary(value) {
    if (!value || value <= 0) return 'N/A';
    if (value >= 1000000) return '$' + (Math.round(value / 100000) / 10) + 'M';
    return '$' + Math.round(value / 1000) + 'K';
  }

  // =========================================================================
  // EXPORTS — works in both browser (window.BJAggregations) and Node (require)
  // =========================================================================
  exports.DEFAULT_LEVELS = DEFAULT_LEVELS;
  exports.getJobLevel = getJobLevel;
  exports.bucketSalaries = bucketSalaries;
  exports.countByLevel = countByLevel;
  exports.countByLocType = countByLocType;
  exports.bucketByWeek = bucketByWeek;
  exports.topCompaniesByCount = topCompaniesByCount;
  exports.countByAtsSource = countByAtsSource;
  exports.computeMedianSalary = computeMedianSalary;
  exports.computeVelocityChange = computeVelocityChange;
  exports.roundToThreshold = roundToThreshold;
  exports.computeSeniorPlusPct = computeSeniorPlusPct;
  exports.formatSalary = formatSalary;

})(typeof module !== 'undefined' && module.exports ? module.exports : (window.BJAggregations = {}));
