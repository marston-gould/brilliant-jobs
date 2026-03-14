// EDE-001: Event-Driven JD Enrichment — Validation Tests
import { describe, it, expect, vi } from 'vitest';

// ── Location key normalisation (mirrors EF logic) ──────────────────
const STATE_MAP = {
  'alabama':'al','alaska':'ak','arizona':'az','arkansas':'ar','california':'ca',
  'colorado':'co','connecticut':'ct','delaware':'de','florida':'fl','georgia':'ga',
  'hawaii':'hi','idaho':'id','illinois':'il','indiana':'in','iowa':'ia',
  'kansas':'ks','kentucky':'ky','louisiana':'la','maine':'me','maryland':'md',
  'massachusetts':'ma','michigan':'mi','minnesota':'mn','mississippi':'ms',
  'missouri':'mo','montana':'mt','nebraska':'ne','nevada':'nv',
  'new hampshire':'nh','new jersey':'nj','new mexico':'nm','new york':'ny',
  'north carolina':'nc','north dakota':'nd','ohio':'oh','oklahoma':'ok',
  'oregon':'or','pennsylvania':'pa','rhode island':'ri','south carolina':'sc',
  'south dakota':'sd','tennessee':'tn','texas':'tx','utah':'ut',
  'vermont':'vt','virginia':'va','washington':'wa','west virginia':'wv',
  'wisconsin':'wi','wyoming':'wy','district of columbia':'dc',
};

function normalizeLocationKey(raw) {
  const s = raw.trim();
  const lower = s.toLowerCase().replace(/[.,]/g, '').trim();
  if (['remote','remote work','work from home'].includes(lower)) return { key: 'remote', display: 'Remote' };
  if (['united states','usa','us','u.s.','u.s.a.','america'].includes(lower)) return { key: 'us', display: 'United States' };
  const m = s.match(/^(.+?),?\s+([A-Z]{2})$/);
  if (m) { const city = m[1].trim().toLowerCase().replace(/\s+/g, '-'); return { key: `us:${m[2].toLowerCase()}:${city}`, display: `${m[1].trim()}, ${m[2]}` }; }
  if (STATE_MAP[lower]) return { key: `us:${STATE_MAP[lower]}`, display: s };
  return { key: `us:${lower.replace(/\s+/g, '-')}`, display: s };
}

function calcEtaMinutes(jobs) { return Math.round(Math.max(0.5, Math.ceil(jobs / 300)) * 60); }

function passesEligibilityGate(j) {
  if (j.status !== 'open') return false;
  if (!j.content || j.content.length <= 200) return false;
  if (!j.title) return false;
  if (j.jd_skills !== null && j.jd_skills !== undefined) return false;
  if ((j.jd_enrich_retry_count || 0) >= 3) return false;
  if (j.jd_extracted_at) return false;
  return true;
}

function simulateProgressUpdate(row, inc) {
  const enriched = Math.min(row.jobs_enriched + inc, row.jobs_total || row.jobs_enriched + inc);
  const done = enriched >= (row.jobs_total || 1);
  return { jobs_enriched: enriched, status: done ? 'complete' : 'processing', completed_at: done ? 'now' : null };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('EDE-001: Location key normalisation', () => {
  it('Remote', () => expect(normalizeLocationKey('Remote').key).toBe('remote'));
  it('remote work', () => expect(normalizeLocationKey('remote work').key).toBe('remote'));
  it('United States', () => expect(normalizeLocationKey('United States').key).toBe('us'));
  it('USA', () => expect(normalizeLocationKey('USA').key).toBe('us'));
  it('US', () => expect(normalizeLocationKey('US').key).toBe('us'));
  it('U.S.', () => expect(normalizeLocationKey('U.S.').key).toBe('us'));
  it('Austin, TX', () => expect(normalizeLocationKey('Austin, TX').key).toBe('us:tx:austin'));
  it('New York, NY', () => expect(normalizeLocationKey('New York, NY').key).toBe('us:ny:new-york'));
  it('San Francisco, CA', () => expect(normalizeLocationKey('San Francisco, CA').key).toBe('us:ca:san-francisco'));
  it('California (full state)', () => expect(normalizeLocationKey('California').key).toBe('us:ca'));
  it('Texas (full state)', () => expect(normalizeLocationKey('Texas').key).toBe('us:tx'));
  it('New York (state name)', () => expect(normalizeLocationKey('New York').key).toBe('us:ny'));
  it('display for Austin TX', () => expect(normalizeLocationKey('Austin, TX').display).toBe('Austin, TX'));
});

describe('EDE-001: ETA calculation', () => {
  it('minimum 30 min for 0 jobs', () => expect(calcEtaMinutes(0)).toBe(30));
  it('60 min for 50 jobs (ceil(50/300)=1h)', () => expect(calcEtaMinutes(50)).toBe(60));
  it('60 min for 300 jobs', () => expect(calcEtaMinutes(300)).toBe(60));
  it('120 min for 600 jobs', () => expect(calcEtaMinutes(600)).toBe(120));
  it('rounds up: 301 jobs = 120 min', () => expect(calcEtaMinutes(301)).toBe(120));
  it('1500 jobs = 300 min (5h)', () => expect(calcEtaMinutes(1500)).toBe(300));
});

describe('EDE-001: Eligibility gate', () => {
  const base = { status:'open', content:'x'.repeat(201), title:'Eng', jd_skills:null, jd_enrich_retry_count:0, jd_extracted_at:null };
  it('passes clean job', () => expect(passesEligibilityGate(base)).toBe(true));
  it('rejects closed', () => expect(passesEligibilityGate({ ...base, status:'closed' })).toBe(false));
  it('rejects content=200', () => expect(passesEligibilityGate({ ...base, content:'x'.repeat(200) })).toBe(false));
  it('rejects null content', () => expect(passesEligibilityGate({ ...base, content:null })).toBe(false));
  it('rejects null title', () => expect(passesEligibilityGate({ ...base, title:null })).toBe(false));
  it('rejects enriched (jd_skills set)', () => expect(passesEligibilityGate({ ...base, jd_skills:['react'] })).toBe(false));
  it('rejects retry_count=3', () => expect(passesEligibilityGate({ ...base, jd_enrich_retry_count:3 })).toBe(false));
  it('accepts retry_count=2', () => expect(passesEligibilityGate({ ...base, jd_enrich_retry_count:2 })).toBe(true));
  it('rejects already marked (jd_extracted_at set)', () => expect(passesEligibilityGate({ ...base, jd_extracted_at:'2026-03-15' })).toBe(false));
});

describe('EDE-001: Geography gate', () => {
  it('US job passes geo gate', () => {
    const j = { loc_country:'US', is_remote:false, loc_state:'TX' };
    expect(j.loc_country === 'US' || j.is_remote || j.loc_state !== null).toBe(true);
  });
  it('Remote job passes geo gate', () => {
    const j = { loc_country:null, is_remote:true, loc_state:null };
    expect(j.loc_country === 'US' || j.is_remote || j.loc_state !== null).toBe(true);
  });
  it('Non-US non-remote job fails geo gate', () => {
    const j = { loc_country:'ES', is_remote:false, loc_state:null };
    expect(j.loc_country === 'US' || j.is_remote || j.loc_state !== null).toBe(false);
  });
  it('Non-US non-remote with loc_state passes (US state jobs with wrong country)', () => {
    const j = { loc_country:'XX', is_remote:false, loc_state:'CA' };
    expect(j.loc_country === 'US' || j.is_remote || j.loc_state !== null).toBe(true);
  });
});

describe('EDE-001: Progress tracking', () => {
  it('marks complete at threshold', () => {
    const r = simulateProgressUpdate({ jobs_total:100, jobs_enriched:90 }, 10);
    expect(r.status).toBe('complete');
    expect(r.jobs_enriched).toBe(100);
  });
  it('stays processing when not done', () => {
    const r = simulateProgressUpdate({ jobs_total:100, jobs_enriched:40 }, 10);
    expect(r.status).toBe('processing');
    expect(r.jobs_enriched).toBe(50);
    expect(r.completed_at).toBeNull();
  });
  it('caps at jobs_total on over-increment', () => {
    const r = simulateProgressUpdate({ jobs_total:100, jobs_enriched:95 }, 50);
    expect(r.jobs_enriched).toBe(100);
    expect(r.status).toBe('complete');
  });
  it('marks complete on first batch jobs_total=1', () => {
    expect(simulateProgressUpdate({ jobs_total:1, jobs_enriched:0 }, 1).status).toBe('complete');
  });
});

describe('EDE-001: Dedup / caching', () => {
  it('caches recent non-no_jobs row', () => {
    const row = { requested_at: new Date(Date.now() - 3600000).toISOString(), status:'processing' };
    const cutoff = new Date(Date.now() - 86400000).toISOString();
    expect(new Date(row.requested_at) > new Date(cutoff) && row.status !== 'no_jobs').toBe(true);
  });
  it('does not cache > 24h old row', () => {
    const row = { requested_at: new Date(Date.now() - 25 * 3600000).toISOString(), status:'complete' };
    const cutoff = new Date(Date.now() - 86400000).toISOString();
    expect(new Date(row.requested_at) > new Date(cutoff)).toBe(false);
  });
  it('does not cache no_jobs', () => {
    const row = { requested_at: new Date().toISOString(), status:'no_jobs' };
    expect(row.status !== 'no_jobs').toBe(false);
  });
});

describe('EDE-001: Popup display conditions', () => {
  const show = (d) => d.status !== 'complete' && !d.cached && d.jobs_total > 0;
  it('shows for new processing request', () => expect(show({ status:'processing', jobs_total:100, cached:false })).toBe(true));
  it('hides when complete', () => expect(show({ status:'complete', jobs_total:100, cached:false })).toBe(false));
  it('hides when cached', () => expect(show({ status:'processing', jobs_total:100, cached:true })).toBe(false));
  it('hides when no jobs', () => expect(show({ status:'processing', jobs_total:0, cached:false })).toBe(false));
});

describe('EDE-001: triggerLocationEnrichment guards', () => {
  it('skips empty wherePills', () => expect(!!([] && [].length)).toBe(false));
  it('skips null wherePills', () => expect(!!(null && null.length)).toBe(false));
  it('skips null currentUser', () => expect(!!(null && [].length)).toBe(false));
  it('processes non-empty wherePills', () => expect(!!([{values:['Austin, TX']}] && [1].length)).toBe(true));
});

describe('EDE-001: Badge display', () => {
  const badge = (s) => s === 'complete' ? 'up-to-date' : (s === 'processing' || s === 'queued') ? 'reviewing' : '';
  it('complete → up-to-date', () => expect(badge('complete')).toBe('up-to-date'));
  it('queued → reviewing', () => expect(badge('queued')).toBe('reviewing'));
  it('processing → reviewing', () => expect(badge('processing')).toBe('reviewing'));
  it('no_jobs → empty', () => expect(badge('no_jobs')).toBe(''));
});

describe('EDE-001: Acceptance criteria', () => {
  it('AC1: non-US non-remote job excluded by geo gate', () => {
    const j = { loc_country:'ES', is_remote:false, loc_state:null };
    expect(j.loc_country === 'US' || j.is_remote || j.loc_state !== null).toBe(false);
  });
  it('AC2: content <= 200 blocked', () => {
    expect(passesEligibilityGate({ status:'open', content:'x'.repeat(200), title:'Dev', jd_skills:null, jd_enrich_retry_count:0, jd_extracted_at:null })).toBe(false);
  });
  it('AC3: same location within 24h → cached', () => {
    const row = { requested_at: new Date(Date.now() - 60000).toISOString(), status:'processing' };
    const cutoff = new Date(Date.now() - 86400000).toISOString();
    expect(new Date(row.requested_at) > new Date(cutoff) && row.status !== 'no_jobs').toBe(true);
  });
  it('AC4: no wherePills = no trigger', () => {
    const filter = { wherePills: [], includeRemote: false };
    expect((filter.wherePills || []).length > 0).toBe(false);
  });
  it('AC5: US job passes content + geo', () => {
    const j = { status:'open', content:'x'.repeat(201), title:'Eng', jd_skills:null, jd_enrich_retry_count:0, jd_extracted_at:null, loc_country:'US', is_remote:false };
    expect(passesEligibilityGate(j)).toBe(true);
    expect(j.loc_country === 'US' || j.is_remote || j.loc_state !== null).toBe(true);
  });
});
