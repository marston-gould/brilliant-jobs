/**
 * REM-S14-FIX — US-Only banner in legacy generic filter browser
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const read = (f) => readFileSync(f, 'utf8');
const browsersJs = read('js/browsers.js');
const dashboard = read('dashboard.html');

describe('REM-S14: US-Only banner in legacy filter browser', () => {
  it('fb-us-only-banner exists in dashboard HTML', () => {
    expect(dashboard).toContain('id="fb-us-only-banner"');
  });

  it('banner text mentions US-Only and browse results', () => {
    expect(dashboard).toContain('US-Only filter active');
    expect(dashboard).toContain('browse results show US-based data only');
  });

  it('banner only shows for geography-sensitive dimensions', () => {
    expect(browsersJs).toContain('geoSensitiveDims');
  });

  it('title is geography-sensitive', () => {
    expect(browsersJs).toContain("'title'");
    const match = browsersJs.match(/geoSensitiveDims\s*=\s*\[([^\]]+)\]/);
    expect(match).not.toBeNull();
    expect(match[1]).toContain("'title'");
  });

  it('skill is geography-sensitive', () => {
    const match = browsersJs.match(/geoSensitiveDims\s*=\s*\[([^\]]+)\]/);
    expect(match[1]).toContain("'skill'");
  });

  it('jd_keyword is geography-sensitive', () => {
    const match = browsersJs.match(/geoSensitiveDims\s*=\s*\[([^\]]+)\]/);
    expect(match[1]).toContain("'jd_keyword'");
  });

  it('banner hidden when dimension is not geography-sensitive', () => {
    expect(browsersJs).toContain("!geoSensitiveDims.includes(dimension)");
  });

  it('banner hidden when US-Only is off', () => {
    expect(browsersJs).toContain('!currentUsOnly');
  });

  it('company browser has its own separate US-Only banner', () => {
    expect(browsersJs).toContain('cb-us-only-banner');
  });
});

describe('Version v9.29', () => {
  it('version.js has v9.29', () => {
    expect(read('js/version.js')).toContain('v9.29');
  });
});
