// ============================================================
// SearchModeToggle — Filters/Chat/Guided Mode Switcher
// ============================================================
// Legacy dashboard.html lines 874-888: three modes
//   Filters (filter icon) | Chat (message-square) | Guided (wand-2)

interface SearchModeToggleProps {
  mode: 'filters' | 'chat' | 'guided';
  onModeChange: (mode: 'filters' | 'chat' | 'guided') => void;
}

const modes: Array<{ key: 'filters' | 'chat' | 'guided'; label: string; icon: string }> = [
  { key: 'filters', label: 'Filters', icon: 'M22 3H2l8 9.46V19l4 2v-8.54L22 3z' },
  { key: 'chat', label: 'Chat', icon: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' },
  { key: 'guided', label: 'Guided', icon: 'M15 4V2m0 2v2m0-2h-4.5M5 14H3m2 0v2m0-2h2m10 6v-1.5M19 14h2m-2 0v2m-8-8l-1.5 5h3L12 18' },
];

export function SearchModeToggle({ mode, onModeChange }: SearchModeToggleProps) {
  return (
    <div className="flex items-center py-2" style={{ marginBottom: 0 }}>
      <div className="inline-flex rounded-lg bg-bg-input border border-border p-0.5">
        {modes.map(m => (
          <button
            key={m.key}
            type="button"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              mode === m.key
                ? 'bg-bg-card text-text shadow-sm'
                : 'text-text-faint hover:text-text'
            }`}
            onClick={() => onModeChange(m.key)}
          >
            <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path d={m.icon} />
            </svg>
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default SearchModeToggle;
