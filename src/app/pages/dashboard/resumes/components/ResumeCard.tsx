// ============================================================
// ResumeCard — Individual resume card (SA-016)
// ============================================================
// Displays: name, meta, badges (Drive/Premium/AI), score,
// filter dots, actions. Expandable panel for AI analysis.
// Zero inline styles. Design tokens via Tailwind.
// ============================================================

import { useMemo } from 'react';
import { Button, Badge } from '@app/components';
import type { Resume, SavedFilter, ReadinessScore, PipelineMeta } from '../hooks/useResumes';

interface ResumeCardProps {
  resume: Resume;
  index: number;
  isExpanded: boolean;
  savedFilters: SavedFilter[];
  filterColors: string[];
  readinessScore: ReadinessScore | null;
  pipelineMeta: Record<string, PipelineMeta>;
  levels: Array<{ label: string; color: string }>;
  onToggleExpand: (idx: number) => void;
  onToggleFilter: (idx: number, filterName: string) => void;
  onSetLevel: (idx: number, level: string) => void;
  onArchive: (idx: number) => void;
  onDelete: (idx: number) => void;
  onDownload: (idx: number) => void;
  onRename: (idx: number) => void;
  onRescore: (idx: number) => void;
  onScore: (idx: number) => void;
  onLaunchRewrite: (idx: number) => void;
  onReplacePlaceholder: (idx: number) => void;
  onReUpload: (idx: number) => void;
}

function getFileIcon(fileName: string): { text: string; cls: string } {
  if (!fileName) return { text: '📄', cls: 'icon-default' };
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return { text: '📕', cls: 'icon-pdf' };
  if (ext === 'docx' || ext === 'doc') return { text: '📘', cls: 'icon-word' };
  if (ext === 'txt') return { text: '📝', cls: 'icon-txt' };
  return { text: '📄', cls: 'icon-default' };
}

export function ResumeCard({
  resume: r,
  index: i,
  isExpanded,
  savedFilters: sf,
  filterColors,
  readinessScore,
  pipelineMeta,
  levels,
  onToggleExpand,
  onToggleFilter,
  onSetLevel,
  onArchive,
  onDelete,
  onDownload,
  onRename,
  onRescore,
  onScore,
  onLaunchRewrite,
  onReplacePlaceholder,
  onReUpload,
}: ResumeCardProps) {
  const icon = getFileIcon(r.fileName);
  const assignedIds = r.filterIds || [];
  const isPlaceholder = r.needsUpload;

  // Performance stats
  const { jobsApplied, responded, responseRate } = useMemo(() => {
    const entries = Object.values(pipelineMeta);
    const applied = entries.filter(m => m.resumeUsed === r.name && m.stage !== 'saved').length;
    const resp = entries.filter(m => m.resumeUsed === r.name && ['responded', 'interview', 'offer'].includes(m.stage)).length;
    return {
      jobsApplied: applied,
      responded: resp,
      responseRate: applied > 0 ? Math.round((resp / applied) * 100) : 0,
    };
  }, [pipelineMeta, r.name]);

  // Score display
  const scoreVal = readinessScore?.overallScore ?? null;
  const scoreVariant = scoreVal !== null && scoreVal >= 75 ? 'success' : scoreVal !== null && scoreVal >= 50 ? 'warning' : scoreVal !== null ? 'error' : 'default';

  // AI detection
  const aiData = r.aiScore;
  const aiLabel = aiData?.label === 'ai_generated' ? 'AI-Generated' : aiData?.label === 'mixed' ? 'Mixed' : aiData?.label === 'human' ? 'Human-Written' : null;
  const aiPct = aiData ? Math.round((aiData.score || 0) * 100) : null;
  const aiVariant = aiData?.label === 'human' ? 'success' : aiData?.label === 'mixed' ? 'warning' : aiData?.label === 'ai_generated' ? 'error' : 'default';

  // Score history delta
  const prevScore = r.aiScoreHistory && r.aiScoreHistory.length > 1
    ? r.aiScoreHistory[r.aiScoreHistory.length - 2]
    : null;
  const prevPct = prevScore ? Math.round((prevScore.score || 0) * 100) : null;
  const delta = aiPct !== null && prevPct !== null ? aiPct - prevPct : null;

  // Filter dots for compact row
  const activeFilterDots = sf.map((f, fi) => {
    const isActive = assignedIds.includes(f.name);
    if (!isActive) return null;
    return (
      <span
        key={f.name}
        className="inline-block w-2 h-2 rounded-full mr-0.5"
        style={{ backgroundColor: filterColors[fi % filterColors.length] }}
        title={f.name}
      />
    );
  }).filter(Boolean);

  // Cooldown check for rescore
  const isCooldown = r._rescoreCooldownUntil ? Date.now() < r._rescoreCooldownUntil : false;

  return (
    <div
      className={`rounded-lg border transition-all cursor-pointer ${
        isExpanded ? 'border-accent bg-bg-card shadow-md' : 'border-border bg-bg-card hover:border-accent/40'
      } ${isPlaceholder ? 'opacity-60 border-dashed' : ''}`}
      onClick={() => onToggleExpand(i)}
      role="button"
      tabIndex={0}
      aria-expanded={isExpanded}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleExpand(i); } }}
    >
      {/* ── Compact Row ──────────────────────────────────────── */}
      <div className="flex items-center gap-3 p-3">
        {/* Icon */}
        <div className="flex-shrink-0 text-lg w-8 text-center" aria-hidden="true">
          {isPlaceholder ? '?' : icon.text}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-text truncate max-w-xs" title={r.name}>
              {r.name}
            </span>
            {r.source === 'gdrive' && (
              <Badge variant="info" size="sm">Drive</Badge>
            )}
            {r.source === 'rewrite' && (
              <Badge variant="purple" size="sm">
                ✨ Premium{r.rewrite_round && r.rewrite_round > 1 ? ` R${r.rewrite_round}` : ''}
              </Badge>
            )}
            {r.aiScoreStatus === 'scoring' && (
              <Badge variant="default" size="sm">🔄 Scoring…</Badge>
            )}
            {aiLabel && r.aiScoreStatus !== 'scoring' && (
              <Badge variant={aiVariant} size="sm">
                {aiData?.label === 'human' ? '✅' : aiData?.label === 'mixed' ? '⚠️' : '🤖'} {aiLabel} {aiPct}%
              </Badge>
            )}
            {delta !== null && (
              <span className={`text-xs ${delta > 5 ? 'text-red-500' : delta < -5 ? 'text-green-500' : 'text-text-faint'}`}>
                {delta > 0 ? '↑' : delta < 0 ? '↓' : '↔'} was {prevPct}%
              </span>
            )}
          </div>
          <div className="text-xs text-text-faint mt-0.5">
            {!isPlaceholder ? `${r.size} · ${r.uploadedAt}` : 'Placeholder'}
            {' · '}{assignedIds.length} filter{assignedIds.length !== 1 ? 's' : ''}
            {r.levelLabel && ` · ${r.levelLabel}`}
            {jobsApplied > 0 && ` · ${jobsApplied} applied`}
          </div>
        </div>

        {/* Filter dots */}
        <div className="hidden sm:flex items-center gap-0.5">
          {activeFilterDots}
        </div>

        {/* Score */}
        <div className="flex-shrink-0 w-12 text-center">
          {scoreVal !== null ? (
            <div>
              <span className={`text-lg font-bold ${
                scoreVal >= 75 ? 'text-green-500' : scoreVal >= 50 ? 'text-yellow-500' : 'text-red-500'
              }`}>
                {scoreVal}
              </span>
              <p className="text-xs text-text-faint">
                {scoreVal >= 75 ? 'Strong' : scoreVal >= 50 ? 'Partial' : 'Weak'}
              </p>
            </div>
          ) : (
            <span className="text-sm text-text-faint">{isPlaceholder ? '—' : assignedIds.length > 0 ? '…' : '—'}</span>
          )}
        </div>

        {/* Actions */}
        <div className="hidden sm:flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="sm" onClick={() => onDownload(i)} title="Download">⬇</Button>
          <Button variant="ghost" size="sm" onClick={() => onRename(i)} title="Rename">✎</Button>
          <Button variant="ghost" size="sm" onClick={() => onArchive(i)} title="Archive">📦</Button>
          <Button variant="danger" size="sm" onClick={() => onDelete(i)} title="Delete">✕</Button>
        </div>
      </div>

      {/* ── Expanded Panel ───────────────────────────────────── */}
      {isExpanded && (
        <div className="border-t border-border px-4 py-3" onClick={(e) => e.stopPropagation()}>
          {/* Mobile actions */}
          <div className="flex sm:hidden items-center gap-1 mb-3">
            <Button variant="ghost" size="sm" onClick={() => onDownload(i)}>⬇ Download</Button>
            <Button variant="ghost" size="sm" onClick={() => onRename(i)}>✎ Rename</Button>
            <Button variant="ghost" size="sm" onClick={() => onArchive(i)}>📦 Archive</Button>
            <Button variant="danger" size="sm" onClick={() => onDelete(i)}>✕ Delete</Button>
          </div>

          {/* AI Analysis / Score CTA */}
          {readinessScore ? (
            <div className="mb-3">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant={scoreVariant} size="sm">
                  {scoreVal}% — {scoreVal !== null && scoreVal >= 75 ? 'Strong' : scoreVal !== null && scoreVal >= 50 ? 'Partial' : 'Weak'} Match
                </Badge>
                {!isCooldown && r.extractedText && r.extractedText.length >= 100 && (
                  <Button variant="ghost" size="sm" onClick={() => onRescore(i)}>🔄 Rescore</Button>
                )}
              </div>
              {readinessScore.filterScores && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {Object.entries(readinessScore.filterScores).map(([filter, score]) => (
                    <div key={filter} className="rounded-md border border-border p-2">
                      <p className="text-xs font-medium text-text truncate">{filter}</p>
                      <p className={`text-sm font-bold ${
                        score >= 75 ? 'text-green-500' : score >= 50 ? 'text-yellow-500' : 'text-red-500'
                      }`}>{score}%</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : isPlaceholder ? (
            <div className="text-center py-4">
              <p className="text-sm text-yellow-500 cursor-pointer hover:underline" onClick={() => onReplacePlaceholder(i)}>
                Upload a file to enable scoring
              </p>
            </div>
          ) : r.textStatus === 'no-text' && r.fileName && /\.docx?$/i.test(r.fileName) ? (
            <div className="text-center py-4">
              <p className="text-sm text-red-500 cursor-pointer hover:underline" onClick={() => onReUpload(i)}>
                ⚠ Re-upload file to enable scoring
              </p>
            </div>
          ) : assignedIds.length > 0 ? (
            <div className="flex items-center justify-center py-4">
              <Button variant="primary" size="sm" onClick={() => onScore(i)}>Score Resume</Button>
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-sm text-text-faint">Assign a filter to see readiness analysis</p>
            </div>
          )}

          {/* Filter pills */}
          {!isPlaceholder && (
            <div className="mt-3 pt-3 border-t border-border">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-semibold text-text-faint mr-1">Filters:</span>
                {sf.length > 0 ? sf.map((f, fi) => {
                  const color = filterColors[fi % filterColors.length];
                  const isActive = assignedIds.includes(f.name);
                  return (
                    <button
                      key={f.name}
                      className={`text-xs font-medium px-2.5 py-0.5 rounded-full border transition-colors ${
                        isActive ? 'opacity-100' : 'opacity-50 hover:opacity-75'
                      }`}
                      style={{ borderColor: `${color}44`, color, backgroundColor: `${color}${isActive ? '22' : '10'}` }}
                      onClick={() => onToggleFilter(i, f.name)}
                      title={`Click to ${isActive ? 'unassign' : 'assign'}`}
                    >
                      {f.name}
                    </button>
                  );
                }) : (
                  <span className="text-xs text-text-faint italic">Save a filter first to assign</span>
                )}
              </div>

              {/* Level selector */}
              {levels.length > 0 && (
                <div className="mt-2">
                  <select
                    className="text-xs rounded-md border border-border bg-bg-card text-text px-2 py-1 min-w-[120px]"
                    value={r.levelLabel || ''}
                    onChange={(e) => onSetLevel(i, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <option value="">— Level —</option>
                    {levels.map(l => (
                      <option key={l.label} value={l.label}>{l.label}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Rewrite promo */}
          {readinessScore && scoreVal !== null && scoreVal < 85 && !isPlaceholder && (
            <div className="mt-3 p-3 rounded-lg border border-accent/20 bg-accent/5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-text">✨ Guided Rewrite Interview</p>
                  <p className="text-xs text-text-dim mt-0.5">Fill gaps, quantify impact, and strategically position your experience.</p>
                  <div className="flex gap-3 mt-2">
                    {['Fill Gaps', 'Quantify', 'Position', 'Rewrite'].map((step, si) => (
                      <span key={step} className="text-xs text-text-faint">
                        <span className="font-bold text-accent mr-0.5">{si + 1}</span>{step}
                      </span>
                    ))}
                  </div>
                </div>
                <Button variant="primary" size="sm" onClick={() => onLaunchRewrite(i)} className="flex-shrink-0 whitespace-nowrap">
                  Start Rewrite
                </Button>
              </div>
            </div>
          )}

          {/* Performance stats */}
          {jobsApplied > 0 && (
            <div className="mt-2 text-xs text-text-faint font-mono">
              {jobsApplied} applied · {responded} responded · {responseRate}% rate
            </div>
          )}
        </div>
      )}
    </div>
  );
}
