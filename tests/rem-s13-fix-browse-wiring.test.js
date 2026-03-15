/**
 * REM-S13-FIX — FilterBuilder browse wiring verification
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const read = (f) => readFileSync(f, 'utf8');
const feedPage = read('src/app/pages/dashboard/feed/FeedPage.tsx');
const filterBuilder = read('src/app/pages/dashboard/feed/components/FilterBuilder.tsx');

describe('REM-S13: FeedPage → FilterBuilder browse wiring', () => {
  it('FeedPage defines handleBrowse callback', () => {
    expect(feedPage).toContain('const handleBrowse = useCallback');
  });

  it('handleBrowse bridges to window.openFilterBrowser', () => {
    expect(feedPage).toContain('w.openFilterBrowser(dimension, mode)');
  });

  it('handleBrowse falls back to window.openCompanyBrowser for company dimension', () => {
    expect(feedPage).toContain("w.openCompanyBrowser(mode)");
  });

  it('FeedPage passes onBrowse={handleBrowse} to FilterBuilder', () => {
    expect(feedPage).toContain('onBrowse={handleBrowse}');
  });

  it('FeedPage passes usOnly to FilterBuilder', () => {
    expect(feedPage).toContain('usOnly={usOnly}');
  });

  it('FeedPage reads usOnly from legacy tuningSettings', () => {
    expect(feedPage).toContain('tuningSettings');
    expect(feedPage).toContain('tuning.usOnly');
  });
});

describe('REM-S13: FilterBuilder renders Browse buttons when onBrowse provided', () => {
  it('FilterRow conditionally renders browse button', () => {
    expect(filterBuilder).toContain('onBrowse && (');
    expect(filterBuilder).toContain('onClick={onBrowse}');
  });

  it('What row gets title/include browse', () => {
    expect(filterBuilder).toContain("onBrowse('title', 'include')");
  });

  it('What-Not row gets title/exclude browse', () => {
    expect(filterBuilder).toContain("onBrowse('title', 'exclude')");
  });

  it('Who row gets company/include browse', () => {
    expect(filterBuilder).toContain("onBrowse('company', 'include')");
  });

  it('Who-Not row gets company/exclude browse', () => {
    expect(filterBuilder).toContain("onBrowse('company', 'exclude')");
  });
});

describe('REM-S14: US-Only banner in FilterBuilder', () => {
  it('shows US-Only banner when usOnly prop is true', () => {
    expect(filterBuilder).toContain('usOnly && (');
    expect(filterBuilder).toContain('US-Only filter active');
  });
});
