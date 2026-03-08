// ============================================================
// KeywordTag — Keyword Pill (SA-015)
// ============================================================

import type { KeywordTerm } from '../hooks/useKeywords';

interface KeywordTagProps {
  term: KeywordTerm;
  variant: 'matched' | 'missing';
}

export function KeywordTag({ term, variant }: KeywordTagProps) {
  const label = typeof term === 'object' ? term.term : term;
  const count = typeof term === 'object' ? term.count : undefined;

  const classes = variant === 'matched'
    ? 'bg-green/5 border-green/20 text-green'
    : 'bg-red/5 border-red/15 text-red';

  const icon = variant === 'matched' ? '✓' : '✗';

  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded border ${classes}`}>
      <span>{icon}</span>
      <span>{label}</span>
      {count != null && count > 0 && (
        <span className="font-mono text-[9px] opacity-70">{count}</span>
      )}
    </span>
  );
}

export default KeywordTag;
