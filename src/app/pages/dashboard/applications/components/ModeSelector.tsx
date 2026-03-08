// ============================================================
// ModeSelector — Application mode selector (SA-016)
// ============================================================
// Three modes: Manual, Auto, Notify
// ============================================================

import React from 'react';
import type { AppMode } from '../hooks/useApplications';

interface ModeSelectorProps {
  mode: AppMode;
  onSetMode: (mode: AppMode) => void;
}

const MODES: Array<{ value: AppMode; label: string; description: string; icon: string }> = [
  { value: 'manual', label: 'Manual', description: 'Review and submit each application yourself', icon: '✋' },
  { value: 'auto', label: 'Auto', description: 'Automatically submit when criteria are met', icon: '⚡' },
  { value: 'notify', label: 'Notify', description: 'Get notified, then approve with one click', icon: '🔔' },
];

export function ModeSelector({ mode, onSetMode }: ModeSelectorProps) {
  return (
    <div className="flex gap-2 mb-6">
      {MODES.map(m => {
        const isActive = mode === m.value;
        return (
          <button
            key={m.value}
            className={`flex-1 rounded-lg border-2 p-3 text-left transition-all ${
              isActive
                ? 'border-accent bg-accent/10'
                : 'border-border bg-bg-card hover:border-accent/30'
            }`}
            onClick={() => onSetMode(m.value)}
            aria-pressed={isActive}
          >
            <div className="flex items-center gap-2 mb-1">
              <span aria-hidden="true">{m.icon}</span>
              <span className={`text-sm font-semibold ${isActive ? 'text-accent' : 'text-text'}`}>
                {m.label}
              </span>
            </div>
            <p className={`text-xs ${isActive ? 'text-text-dim' : 'text-text-faint'}`}>
              {m.description}
            </p>
          </button>
        );
      })}
    </div>
  );
}
