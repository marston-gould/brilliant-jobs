// ============================================================
// InterviewPrepPage — Question Bank + Practice Simulation
// ============================================================
// Phase C: Missing page — legacy had 1,046 lines in interview-prep.ts
// SPA equivalent with question bank, filters, bookmarks, and
// mock interview simulation via interview-simulate edge function.
// ============================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useInterviewPrepProvider } from '@providers';
import type {
  InterviewQuestion,
  InterviewQuestionFilters,
  InterviewClusterMeta,
  InterviewSession,
  SimulationMessage,
  InterviewScorecard,
} from '@providers/types';
import {
  BookOpen,
  Search,
  Bookmark,
  BookmarkCheck,
  Play,
  MessageSquare,
  Award,
  Filter,
  X,
  Send,
  ChevronDown,
  Loader2,
} from 'lucide-react';

// ── Category / difficulty colors (matching legacy) ───────

const CAT_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  behavioral: { bg: 'bg-blue-500/10', text: 'text-blue-500', label: 'Behavioral' },
  technical: { bg: 'bg-purple-500/10', text: 'text-purple-500', label: 'Technical' },
  situational: { bg: 'bg-amber-500/10', text: 'text-amber-500', label: 'Situational' },
  case_study: { bg: 'bg-emerald-500/10', text: 'text-emerald-500', label: 'Case Study' },
};

const DIFF_COLORS: Record<string, { bg: string; text: string }> = {
  standard: { bg: 'bg-slate-500/10', text: 'text-slate-500' },
  advanced: { bg: 'bg-red-500/10', text: 'text-red-500' },
};

type Tab = 'questions' | 'practice' | 'history';

export default function InterviewPrepPage() {
  const provider = useInterviewPrepProvider();
  const [tab, setTab] = useState<Tab>('questions');
  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  const [clusterMeta, setClusterMeta] = useState<InterviewClusterMeta>({ roles: [], departments: [], levels: [] });
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [filters, setFilters] = useState<InterviewQuestionFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<InterviewSession[]>([]);

  // Simulation state
  const [simActive, setSimActive] = useState(false);
  const [simSession, setSimSession] = useState<InterviewSession | null>(null);
  const [simHistory, setSimHistory] = useState<SimulationMessage[]>([]);
  const [simInput, setSimInput] = useState('');
  const [simLoading, setSimLoading] = useState(false);
  const [scorecard, setScorecard] = useState<InterviewScorecard | null>(null);

  // ── Load questions + meta ──
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [qs, meta, bm] = await Promise.all([
          provider.getQuestions(filters),
          provider.getClusterMeta(),
          provider.getBookmarks(),
        ]);
        setQuestions(qs);
        setClusterMeta(meta);
        setBookmarks(bm);
      } catch (err) {
        console.error('Failed to load interview questions:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [provider, filters]);

  // ── Load sessions for history tab ──
  useEffect(() => {
    if (tab === 'history') {
      provider.getSessions().then(setSessions).catch(() => setSessions([]));
    }
  }, [provider, tab]);

  // ── Bookmark toggle ──
  const toggleBookmark = useCallback(async (qId: string) => {
    await provider.toggleBookmark(qId);
    const updated = await provider.getBookmarks();
    setBookmarks(updated);
  }, [provider]);

  // ── Filter helpers ──
  const updateFilter = useCallback((key: keyof InterviewQuestionFilters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value || undefined }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({});
  }, []);

  const activeFilterCount = useMemo(() => {
    return Object.values(filters).filter(v => v !== undefined && v !== '').length;
  }, [filters]);

  // ── Start simulation ──
  const startSimulation = useCallback(async (questionIds: string[]) => {
    setSimLoading(true);
    try {
      const session = await provider.startSimulation({ questionIds });
      setSimSession(session);
      setSimHistory([]);
      setSimActive(true);
      setScorecard(null);
      setTab('practice');
    } catch (err) {
      console.error('Failed to start simulation:', err);
    } finally {
      setSimLoading(false);
    }
  }, [provider]);

  // ── Send message in simulation ──
  const sendSimMessage = useCallback(async () => {
    if (!simInput.trim() || !simSession) return;
    const userMsg: SimulationMessage = { role: 'user', content: simInput, timestamp: new Date().toISOString() };
    const newHistory = [...simHistory, userMsg];
    setSimHistory(newHistory);
    setSimInput('');
    setSimLoading(true);
    try {
      const reply = await provider.sendSimulationMessage(simSession.id, simInput, newHistory);
      setSimHistory(prev => [...prev, reply]);
    } catch {
      setSimHistory(prev => [...prev, { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' }]);
    } finally {
      setSimLoading(false);
    }
  }, [simInput, simSession, simHistory, provider]);

  // ── End simulation ──
  const endSimulation = useCallback(async () => {
    if (!simSession) return;
    setSimLoading(true);
    try {
      const sc = await provider.endSimulation(simSession.id, simHistory);
      setScorecard(sc);
      setSimActive(false);
    } catch (err) {
      console.error('Failed to end simulation:', err);
    } finally {
      setSimLoading(false);
    }
  }, [simSession, simHistory, provider]);

  // ── PostHog tracking ──
  useEffect(() => {
    try {
      const ph = (window as Record<string, any>).posthog;
      if (ph?.capture) ph.capture('interview_prep_page_viewed', { tab });
    } catch {}
  }, [tab]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <BookOpen className="w-6 h-6" />
            Interview Prep
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Practice with AI-generated questions tailored to your target roles
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border-subtle" role="tablist">
        {([
          { key: 'questions' as Tab, label: 'Question Bank', icon: BookOpen },
          { key: 'practice' as Tab, label: 'Practice', icon: MessageSquare },
          { key: 'history' as Tab, label: 'History', icon: Award },
        ]).map(t => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`
              flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px
              ${tab === t.key
                ? 'border-accent text-accent'
                : 'border-transparent text-text-secondary hover:text-text-primary'
              }
            `}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Questions Tab ── */}
      {tab === 'questions' && (
        <div>
          {/* Search + Filter bar */}
          <div className="flex gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-faint" />
              <input
                type="text"
                placeholder="Search questions..."
                value={filters.search || ''}
                onChange={e => updateFilter('search', e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-border-subtle bg-bg-surface text-sm text-text-primary placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors
                ${activeFilterCount > 0
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border-subtle text-text-secondary hover:bg-bg-surface'
                }
              `}
            >
              <Filter className="w-4 h-4" />
              Filters
              {activeFilterCount > 0 && (
                <span className="bg-accent text-white text-[10px] px-1.5 py-0.5 rounded-full">{activeFilterCount}</span>
              )}
            </button>
            <button
              onClick={() => updateFilter('bookmarked', filters.bookmarked ? '' : 'true')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors
                ${filters.bookmarked
                  ? 'border-amber-500 bg-amber-500/10 text-amber-600'
                  : 'border-border-subtle text-text-secondary hover:bg-bg-surface'
                }
              `}
            >
              <Bookmark className="w-4 h-4" />
              Bookmarked
            </button>
          </div>

          {/* Filter panel */}
          {showFilters && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 p-4 bg-bg-surface rounded-lg border border-border-subtle">
              <FilterSelect label="Category" value={filters.category} options={['behavioral', 'technical', 'situational', 'case_study']} onChange={v => updateFilter('category', v)} />
              <FilterSelect label="Difficulty" value={filters.difficulty} options={['standard', 'advanced']} onChange={v => updateFilter('difficulty', v)} />
              <FilterSelect label="Role" value={filters.role} options={clusterMeta.roles} onChange={v => updateFilter('role', v)} />
              <FilterSelect label="Level" value={filters.level} options={clusterMeta.levels} onChange={v => updateFilter('level', v)} />
              {activeFilterCount > 0 && (
                <button onClick={clearFilters} className="col-span-full text-xs text-text-faint hover:text-text-secondary flex items-center gap-1">
                  <X className="w-3 h-3" /> Clear all filters
                </button>
              )}
            </div>
          )}

          {/* Question list */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-text-faint" />
            </div>
          ) : questions.length === 0 ? (
            <div className="text-center py-16 text-text-faint">
              <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p>No questions match your filters</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-text-faint">{questions.length} question{questions.length !== 1 ? 's' : ''}</p>
              {questions.map(q => (
                <QuestionCard
                  key={q.id}
                  question={q}
                  bookmarked={bookmarks.includes(q.id)}
                  onToggleBookmark={() => toggleBookmark(q.id)}
                  onPractice={() => startSimulation([q.id])}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Practice Tab ── */}
      {tab === 'practice' && (
        <div>
          {scorecard ? (
            <ScorecardView scorecard={scorecard} onNewSession={() => { setScorecard(null); setTab('questions'); }} />
          ) : simActive && simSession ? (
            <div className="flex flex-col h-[calc(100vh-280px)]">
              <div className="flex-1 overflow-y-auto space-y-4 pb-4">
                {simHistory.length === 0 && (
                  <p className="text-sm text-text-faint text-center py-8">
                    The interviewer will begin shortly...
                  </p>
                )}
                {simHistory.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm
                      ${msg.role === 'user'
                        ? 'bg-accent text-white rounded-br-md'
                        : 'bg-bg-surface border border-border-subtle text-text-primary rounded-bl-md'
                      }
                    `}>
                      {msg.content}
                    </div>
                  </div>
                ))}
                {simLoading && (
                  <div className="flex justify-start">
                    <div className="bg-bg-surface border border-border-subtle px-4 py-3 rounded-2xl rounded-bl-md">
                      <Loader2 className="w-4 h-4 animate-spin text-text-faint" />
                    </div>
                  </div>
                )}
              </div>
              <div className="flex gap-2 pt-4 border-t border-border-subtle">
                <input
                  type="text"
                  value={simInput}
                  onChange={e => setSimInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendSimMessage()}
                  placeholder="Type your answer..."
                  className="flex-1 px-4 py-2.5 rounded-lg border border-border-subtle bg-bg-surface text-sm text-text-primary placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-accent/40"
                  disabled={simLoading}
                />
                <button
                  onClick={sendSimMessage}
                  disabled={simLoading || !simInput.trim()}
                  className="px-4 py-2.5 rounded-lg bg-accent text-white text-sm font-medium disabled:opacity-50 hover:bg-accent/90 transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
                <button
                  onClick={endSimulation}
                  className="px-4 py-2.5 rounded-lg border border-border-subtle text-sm font-medium text-text-secondary hover:bg-bg-surface transition-colors"
                >
                  End & Score
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-16 text-text-faint">
              <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="mb-2">No active practice session</p>
              <p className="text-xs">Select questions from the Question Bank tab and click Practice to start a mock interview</p>
            </div>
          )}
        </div>
      )}

      {/* ── History Tab ── */}
      {tab === 'history' && (
        <div>
          {sessions.length === 0 ? (
            <div className="text-center py-16 text-text-faint">
              <Award className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p>No practice sessions yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map(s => (
                <div key={s.id} className="p-4 bg-bg-surface rounded-lg border border-border-subtle">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium
                        ${s.status === 'completed' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-slate-500/10 text-slate-500'}
                      `}>
                        {s.status}
                      </span>
                      <span className="text-xs text-text-faint ml-2">
                        {new Date(s.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    {s.scorecard && (
                      <span className="text-sm font-semibold text-text-primary">
                        Score: {s.scorecard.overall_score}/100
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-secondary mt-2">
                    {s.question_ids.length} question{s.question_ids.length !== 1 ? 's' : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────

function QuestionCard({
  question: q,
  bookmarked,
  onToggleBookmark,
  onPractice,
}: {
  question: InterviewQuestion;
  bookmarked: boolean;
  onToggleBookmark: () => void;
  onPractice: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const catDefault = { bg: 'bg-blue-500/10', text: 'text-blue-500', label: 'Behavioral' };
  const diffDefault = { bg: 'bg-slate-500/10', text: 'text-slate-500' };
  const cat = CAT_COLORS[q.category] ?? catDefault;
  const diff = DIFF_COLORS[q.difficulty] ?? diffDefault;
  const catBg = cat.bg;
  const catText = cat.text;
  const diffBg = diff.bg;
  const diffText = diff.text;

  return (
    <div className="p-4 bg-bg-surface rounded-lg border border-border-subtle hover:border-border-default transition-colors">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary">{q.question}</p>
          <div className="flex flex-wrap gap-2 mt-2">
            <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${catBg} ${catText}`}>{cat.label}</span>
            <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${diffBg} ${diffText}`}>{q.difficulty}</span>
            {q.role_cluster && <span className="px-2 py-0.5 rounded text-[11px] bg-bg-main text-text-faint">{q.role_cluster}</span>}
            {q.level && <span className="px-2 py-0.5 rounded text-[11px] bg-bg-main text-text-faint">{q.level}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={onToggleBookmark}
            className="p-1.5 rounded-md hover:bg-bg-main transition-colors"
            aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark question'}
          >
            {bookmarked
              ? <BookmarkCheck className="w-4 h-4 text-amber-500" />
              : <Bookmark className="w-4 h-4 text-text-faint" />
            }
          </button>
          <button
            onClick={onPractice}
            className="p-1.5 rounded-md hover:bg-accent/10 text-accent transition-colors"
            aria-label="Practice this question"
          >
            <Play className="w-4 h-4" />
          </button>
          {(q.tips || q.sample_answer) && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1.5 rounded-md hover:bg-bg-main transition-colors"
              aria-label={expanded ? 'Collapse' : 'Expand tips'}
            >
              <ChevronDown className={`w-4 h-4 text-text-faint transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
      </div>
      {expanded && (q.tips || q.sample_answer) && (
        <div className="mt-3 pt-3 border-t border-border-subtle space-y-2">
          {q.tips && (
            <div>
              <p className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1">Tips</p>
              <p className="text-sm text-text-secondary">{q.tips}</p>
            </div>
          )}
          {q.sample_answer && (
            <div>
              <p className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1">Sample Answer</p>
              <p className="text-sm text-text-secondary">{q.sample_answer}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FilterSelect({ label, value, options, onChange }: {
  label: string;
  value?: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-[11px] font-medium text-text-faint uppercase tracking-wider mb-1 block">{label}</label>
      <select
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-1.5 rounded-md border border-border-subtle bg-bg-main text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
      >
        <option value="">All</option>
        {options.map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
      </select>
    </div>
  );
}

function ScorecardView({ scorecard, onNewSession }: { scorecard: InterviewScorecard; onNewSession: () => void }) {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-6">
        <Award className="w-12 h-12 mx-auto mb-3 text-accent" />
        <h2 className="text-xl font-bold text-text-primary">Session Complete</h2>
        <div className="mt-2">
          <span className="text-4xl font-bold text-accent">{scorecard.overall_score}</span>
          <span className="text-lg text-text-faint">/100</span>
        </div>
      </div>

      <p className="text-sm text-text-secondary mb-6">{scorecard.summary}</p>

      {scorecard.categories.length > 0 && (
        <div className="space-y-3 mb-6">
          <h3 className="text-sm font-semibold text-text-primary">Category Scores</h3>
          {scorecard.categories.map((c, i) => (
            <div key={i} className="p-3 bg-bg-surface rounded-lg border border-border-subtle">
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm font-medium text-text-primary">{c.name}</span>
                <span className="text-sm font-semibold text-accent">{c.score}/100</span>
              </div>
              <div className="w-full h-1.5 bg-bg-main rounded-full overflow-hidden mb-2">
                <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${c.score}%` }} />
              </div>
              <p className="text-xs text-text-secondary">{c.feedback}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 mb-6">
        {scorecard.strengths.length > 0 && (
          <div className="p-4 bg-emerald-500/5 rounded-lg border border-emerald-500/20">
            <h4 className="text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-2">Strengths</h4>
            <ul className="space-y-1">
              {scorecard.strengths.map((s, i) => (
                <li key={i} className="text-sm text-text-secondary">• {s}</li>
              ))}
            </ul>
          </div>
        )}
        {scorecard.improvements.length > 0 && (
          <div className="p-4 bg-amber-500/5 rounded-lg border border-amber-500/20">
            <h4 className="text-xs font-semibold text-amber-600 uppercase tracking-wider mb-2">Areas to Improve</h4>
            <ul className="space-y-1">
              {scorecard.improvements.map((s, i) => (
                <li key={i} className="text-sm text-text-secondary">• {s}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <button
        onClick={onNewSession}
        className="w-full py-2.5 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors"
      >
        Practice More Questions
      </button>
    </div>
  );
}
