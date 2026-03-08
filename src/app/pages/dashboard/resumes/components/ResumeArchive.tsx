// ============================================================
// ResumeArchive — Archived resumes section (SA-016)
// ============================================================

import { useState } from 'react';
import { Button, Badge } from '@app/components';
import type { Resume, PipelineMeta } from '../hooks/useResumes';

interface ResumeArchiveProps {
  resumes: Resume[];
  pipelineMeta: Record<string, PipelineMeta>;
  onUnarchive: (idx: number) => void;
  onDelete: (idx: number) => void;
  onDownload: (idx: number) => void;
}

export function ResumeArchive({ resumes, pipelineMeta, onUnarchive, onDelete, onDownload }: ResumeArchiveProps) {
  const [expanded, setExpanded] = useState(false);

  if (resumes.length === 0) return null;

  return (
    <div className="mt-8">
      <button
        className="flex items-center gap-2 mb-3 w-full text-left group"
        onClick={() => setExpanded(prev => !prev)}
        aria-expanded={expanded}
      >
        <span className="text-sm font-semibold text-text-dim group-hover:text-text transition-colors">
          📦 Archive ({resumes.length})
        </span>
        <span className="text-xs text-text-faint">
          {expanded ? '▾' : '▸'}
        </span>
      </button>

      {expanded && (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-bg-card border-b border-border">
                <th className="text-left px-3 py-2 text-xs font-semibold text-text-faint">Name</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-text-faint hidden sm:table-cell">Size</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-text-faint hidden sm:table-cell">Applied</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-text-faint hidden sm:table-cell">Responded</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-text-faint">Actions</th>
              </tr>
            </thead>
            <tbody>
              {resumes.map((r, i) => {
                const entries = Object.values(pipelineMeta);
                const applied = entries.filter(m => m.resumeUsed === r.name).length;
                const responded = entries.filter(m => m.resumeUsed === r.name && ['responded', 'interview', 'offer'].includes(m.stage)).length;

                return (
                  <tr key={r.id || r.name} className="border-b border-border last:border-b-0 hover:bg-bg-card/50">
                    <td className="px-3 py-2">
                      <span className="text-text font-medium truncate block max-w-xs">{r.name}</span>
                    </td>
                    <td className="px-3 py-2 text-text-faint hidden sm:table-cell">{r.size}</td>
                    <td className="px-3 py-2 text-text-faint hidden sm:table-cell">{applied}</td>
                    <td className="px-3 py-2 text-text-faint hidden sm:table-cell">{responded}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center gap-1 justify-end">
                        <Button variant="ghost" size="sm" onClick={() => onDownload(i)} title="Download">⬇</Button>
                        <Button variant="ghost" size="sm" onClick={() => onUnarchive(i)} title="Restore">↩</Button>
                        <Button variant="danger" size="sm" onClick={() => onDelete(i)} title="Delete">✕</Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
