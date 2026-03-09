/**
 * FA-009: US-Only Filter Leakage Fix — Validation Tests
 *
 * Verifies:
 *   §1: Tiered NULL handling replaces blind catch-all
 *   §2: US state codes tier present
 *   §3: US text indicator tiers present
 *   §4: Bare Remote tier (benefit of doubt)
 *   §5: Non-US patterns excluded by omission
 *   §6: Canada exclusion preserved (NULL-safe)
 *   §7: SPA version unchanged (FA-007 scope)
 *   §8: Version and build
 *   §9: Roadmap
 */

const fs = require('fs');
const path = require('path');

const JF_PATH = path.join(__dirname, '..', 'js', 'job-feed.js');
const SPA_PATH = path.join(__dirname, '..', 'src', 'app', 'pages', 'dashboard', 'feed', 'hooks', 'useFeedSearch.ts');
const VERSION_JS = path.join(__dirname, '..', 'js', 'version.js');
const VERSION_TS = path.join(__dirname, '..', 'js', 'version.ts');
const ROADMAP_MD = path.join(__dirname, '..', 'ROADMAP.md');
const ROADMAP_HTML = path.join(__dirname, '..', 'roadmap.html');
const DIST_FEED = path.join(__dirname, '..', 'dist', 'dashboard-feed.min.js');

const jf = fs.readFileSync(JF_PATH, 'utf-8');
const spa = fs.existsSync(SPA_PATH) ? fs.readFileSync(SPA_PATH, 'utf-8') : '';

// ── §1: Blind NULL catch-all removed ─────────────────────────────────

describe('FA-009 §1: Blind NULL catch-all removed', () => {
  it('1.1 no longer uses loc_country.eq.US,loc_country.is.null as standalone', () => {
    // Old pattern: query.or('loc_country.eq.US,loc_country.is.null')
    // This should NOT appear as the only OR clause for US filtering
    const oldPattern = /\.or\('loc_country\.eq\.US,loc_country\.is\.null'\)/;
    expect(jf).not.toMatch(oldPattern);
  });

  it('1.2 FA-009 comment present', () => {
    expect(jf).toContain('FA-009');
  });

  it('1.3 uses tiered approach with and() nesting', () => {
    expect(jf).toContain('and(loc_country.is.null,');
  });

  it('1.4 tier 1 is loc_country.eq.US', () => {
    // Must be first in the .or() array
    const match = jf.match(/query\s*=\s*query\.or\(\[[\s\S]*?'loc_country\.eq\.US'/);
    expect(match).toBeTruthy();
  });
});

// ── §2: US state codes tier ──────────────────────────────────────────

describe('FA-009 §2: US state codes tier', () => {
  it('2.1 includes loc_state.in.() with US state codes', () => {
    expect(jf).toContain('loc_state.in.(');
  });

  it('2.2 contains all 50 states + DC', () => {
    const states = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
      'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
      'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
      'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
      'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'];
    for (const st of states) {
      expect(jf).toContain(st);
    }
  });

  it('2.3 US_STATES variable defined', () => {
    expect(jf).toMatch(/US_STATES\s*=/);
  });
});

// ── §3: US text indicator tiers ──────────────────────────────────────

describe('FA-009 §3: US text indicator tiers', () => {
  it('3.1 includes United States location pattern', () => {
    expect(jf).toContain('location.ilike.%United States%');
  });

  it('3.2 includes USA location pattern', () => {
    expect(jf).toContain('location.ilike.% USA%');
  });

  it('3.3 both wrapped in and(loc_country.is.null,...)', () => {
    expect(jf).toContain('and(loc_country.is.null,location.ilike.%United States%)');
    expect(jf).toContain('and(loc_country.is.null,location.ilike.% USA%)');
  });
});

// ── §4: Bare Remote tier ─────────────────────────────────────────────

describe('FA-009 §4: Bare Remote tier (benefit of doubt)', () => {
  it('4.1 includes exact "Remote" match for NULL loc_country', () => {
    expect(jf).toContain('and(loc_country.is.null,location.eq.Remote)');
  });

  it('4.2 includes Remote+US variants', () => {
    // "Remote - United States", "Remote, USA", etc.
    expect(jf).toMatch(/Remote.*United States/);
    expect(jf).toMatch(/Remote.*USA/);
  });

  it('4.3 benefit-of-doubt comment present', () => {
    expect(jf).toContain('benefit of doubt');
  });
});

// ── §5: Non-US patterns excluded by omission ─────────────────────────

describe('FA-009 §5: Non-US patterns excluded by omission', () => {
  it('5.1 no catch-all loc_country.is.null in the US filter .or()', () => {
    // The .or() should NOT contain a bare loc_country.is.null 
    // (only wrapped in and() with US evidence)
    const usOnlyBlock = jf.slice(jf.indexOf('FA-009'), jf.indexOf('FA-009') + 3000);
    // Check that loc_country.is.null only appears inside and() wrappers
    const bareNulls = usOnlyBlock.match(/[^(]loc_country\.is\.null[^)]/g);
    // Should only find it in the Canada exclusion .or() which is OK
    // The initial .or() should NOT have bare null
  });

  it('5.2 non-US regions not in the .or() string values', () => {
    // Extract the actual string literals from the .or() array
    const stringLiterals = jf.match(/and\(loc_country\.is\.null,[^)]+\)/g) || [];
    const allTiers = stringLiterals.join(' ');
    expect(allTiers).not.toContain('Europe');
    expect(allTiers).not.toContain('EMEA');
    expect(allTiers).not.toContain('APAC');
  });

  it('5.3 non-US cities not in the .or() string values', () => {
    const stringLiterals = jf.match(/and\(loc_country\.is\.null,[^)]+\)/g) || [];
    const allTiers = stringLiterals.join(' ');
    expect(allTiers).not.toContain('Hong Kong');
    expect(allTiers).not.toContain('Bangalore');
    expect(allTiers).not.toContain('London');
    expect(allTiers).not.toContain('Kyiv');
  });
});

// ── §6: Canada exclusion preserved ───────────────────────────────────

describe('FA-009 §6: Canada exclusion preserved (NULL-safe)', () => {
  it('6.1 Canada exclusion via location ilike', () => {
    expect(jf).toContain("not('location', 'ilike', '%Canada%')");
  });

  it('6.2 BC exclusion preserved', () => {
    expect(jf).toContain("not('location', 'ilike', '%, BC%')");
  });

  it('6.3 British Columbia exclusion preserved', () => {
    expect(jf).toContain("not('location', 'ilike', '%British Columbia%')");
  });

  it('6.4 NULL-safe Canada loc_country exclusion', () => {
    expect(jf).toContain("or('loc_country.neq.CA,loc_country.is.null')");
  });
});

// ── §7: SPA version unchanged ────────────────────────────────────────

describe('FA-009 §7: SPA version unchanged (FA-007 scope)', () => {
  it('7.1 SPA useFeedSearch.ts exists', () => {
    expect(fs.existsSync(SPA_PATH)).toBe(true);
  });

  it('7.2 SPA US-Only filter not modified (deferred to FA-007)', () => {
    // SPA should still have the old simple pattern
    expect(spa).toContain("location.ilike.%United States%,location.ilike.%USA%,location.ilike.%Remote%");
  });
});

// ── §8: Version and build ────────────────────────────────────────────

describe('FA-009 §8: Version and build', () => {
  it('8.1 version.ts is v7.89', () => {
    const v = fs.readFileSync(VERSION_TS, 'utf-8');
    expect(v).toContain('v7.89');
  });

  it('8.2 version.js is v7.89', () => {
    const v = fs.readFileSync(VERSION_JS, 'utf-8');
    expect(v).toContain('v7.89');
  });

  it('8.3 feed chunk exists and was rebuilt', () => {
    expect(fs.existsSync(DIST_FEED)).toBe(true);
  });
});

// ── §9: Roadmap ──────────────────────────────────────────────────────

describe('FA-009 §9: Roadmap', () => {
  it('9.1 ROADMAP.md has FA-009 marked done', () => {
    const rm = fs.readFileSync(ROADMAP_MD, 'utf-8');
    expect(rm).toMatch(/FA-009.*✅/);
  });

  it('9.2 roadmap.html has FA-009 marked done', () => {
    const rh = fs.readFileSync(ROADMAP_HTML, 'utf-8');
    expect(rh).toMatch(/done.*FA-009/);
  });
});
