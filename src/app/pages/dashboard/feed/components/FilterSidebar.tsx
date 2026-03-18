// ============================================================
// FilterSidebar — Trust & AI Content Filters (SA-014)
// ============================================================
// Dropdown filters for trust level and AI content scoring.
// These are client-side post-filters applied after DB query.
// ============================================================

import { useState, useRef, useEffect, useCallback } from 'react';
import { ShieldCheck, Bot } from 'lucide-react';
import type { TrustLabel, AiLabel } from '../hooks/useFeedSearch';

// ── Shared dropdown hook ──────────────────────────────────

function useDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return { open, setOpen, ref };
}

// ── Trust Level Filter ────────────────────────────────────

interface TrustFilterProps {
  active: Set<TrustLabel>;
  onChange: (labels: Set<TrustLabel>) => void;
}

const TRUST_OPTIONS: Array<{ value: TrustLabel; icon: string; label: string; colorClass: string }> = [
  { value: 'safe', icon: '🛡️', label: 'Verified', colorClass: 'text-green-400' },
  { value: 'caution', icon: '⚠️', label: 'Caution', colorClass: 'text-amber-400' },
  { value: 'suspicious', icon: '🚩', label: 'Suspicious', colorClass: 'text-red-400' },
  { value: 'unknown', icon: '', label: 'Unscored', colorClass: 'text-text-faint' },
];

export function TrustFilter({ active, onChange }: TrustFilterProps) {
  const { open, setOpen, ref } = useDropdown();
  const _allChecked = active.size === TRUST_OPTIONS.length;
  const filterCount = TRUST_OPTIONS.length - active.size;

  const toggle = useCallback((value: TrustLabel) => {
    const next = new Set(active);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  }, [active, onChange]);

  const setAll = useCallback((checked: boolean) => {
    onChange(checked
      ? new Set(TRUST_OPTIONS.map(o => o.value))
      : new Set<TrustLabel>()
    );
  }, [onChange]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="flex items-center gap-1 px-2.5 py-0.5 text-[10px] text-text-faint border border-border rounded hover:border-border-hover transition-colors"
        onClick={() => setOpen(prev => !prev)}
      >
        <ShieldCheck className="w-3 h-3" strokeWidth={2} /> Trust Level
        {filterCount > 0 && (
          <span className="px-1.5 rounded-full text-[9px] font-bold bg-accent text-white">
            {filterCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute top-full left-0 z-10 mt-1 bg-bg-card border border-border rounded-lg shadow-dropdown p-2 min-w-[180px]">
          <div className="text-[10px] font-bold text-text-dim px-1.5 pb-1.5 mb-1 border-b border-border">
            Show jobs with trust level:
          </div>
          {TRUST_OPTIONS.map(opt => (
            <label
              key={opt.value}
              className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-bg-hover cursor-pointer"
            >
              <input
                type="checkbox"
                checked={active.has(opt.value)}
                onChange={() => toggle(opt.value)}
                className="cursor-pointer"
              />
              {opt.icon && <span>{opt.icon}</span>}
              <span className={`text-xs font-medium ${opt.colorClass}`}>{opt.label}</span>
            </label>
          ))}
          <div className="flex gap-1.5 mt-1.5 pt-1.5 border-t border-border">
            <button
              type="button"
              className="px-2 py-0.5 text-[10px] rounded bg-bg-hover text-text-dim hover:bg-bg-input transition-colors"
              onClick={() => setAll(true)}
            >
              All
            </button>
            <button
              type="button"
              className="px-2 py-0.5 text-[10px] rounded bg-bg-hover text-text-dim hover:bg-bg-input transition-colors"
              onClick={() => setAll(false)}
            >
              None
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── AI Content Filter ─────────────────────────────────────

interface AiContentFilterProps {
  active: Set<AiLabel>;
  onChange: (labels: Set<AiLabel>) => void;
}

const AI_OPTIONS: Array<{ value: AiLabel; label: string; colorClass: string }> = [
  { value: 'human', label: 'Human-Written', colorClass: 'text-green-400' },
  { value: 'mixed', label: 'Mixed Content', colorClass: 'text-amber-400' },
  { value: 'ai_generated', label: 'AI-Generated', colorClass: 'text-red-400' },
  { value: 'unscored', label: 'Unscored', colorClass: 'text-text-faint' },
];

export function AiContentFilter({ active, onChange }: AiContentFilterProps) {
  const { open, setOpen, ref } = useDropdown();
  const filterCount = AI_OPTIONS.length - active.size;

  const toggle = useCallback((value: AiLabel) => {
    const next = new Set(active);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  }, [active, onChange]);

  const setAll = useCallback((checked: boolean) => {
    onChange(checked
      ? new Set(AI_OPTIONS.map(o => o.value))
      : new Set<AiLabel>()
    );
  }, [onChange]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="flex items-center gap-1 px-2.5 py-0.5 text-[10px] text-text-faint border border-border rounded hover:border-border-hover transition-colors"
        onClick={() => setOpen(prev => !prev)}
      >
        <Bot className="w-3 h-3" strokeWidth={2} /> AI Content
        {filterCount > 0 && (
          <span className="px-1.5 rounded-full text-[9px] font-bold bg-accent text-white">
            {filterCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute top-full left-0 z-10 mt-1 bg-bg-card border border-border rounded-lg shadow-dropdown p-2 min-w-[190px]">
          <div className="text-[10px] font-bold text-text-dim px-1.5 pb-1.5 mb-1 border-b border-border">
            Show jobs by AI content level:
          </div>
          {AI_OPTIONS.map(opt => (
            <label
              key={opt.value}
              className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-bg-hover cursor-pointer"
            >
              <input
                type="checkbox"
                checked={active.has(opt.value)}
                onChange={() => toggle(opt.value)}
                className="cursor-pointer"
              />
              <span className={`text-xs font-medium ${opt.colorClass}`}>{opt.label}</span>
            </label>
          ))}
          <div className="flex gap-1.5 mt-1.5 pt-1.5 border-t border-border">
            <button
              type="button"
              className="px-2 py-0.5 text-[10px] rounded bg-bg-hover text-text-dim hover:bg-bg-input transition-colors"
              onClick={() => setAll(true)}
            >
              All
            </button>
            <button
              type="button"
              className="px-2 py-0.5 text-[10px] rounded bg-bg-hover text-text-dim hover:bg-bg-input transition-colors"
              onClick={() => setAll(false)}
            >
              None
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
