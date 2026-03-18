// ============================================================
// InterviewPrepPage — Legacy Parity (lines 3816-3958)
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@app/components';
import { Play, Bookmark, BookmarkCheck } from 'lucide-react';
import { useProviders } from '@providers';

type IpTab = 'question-bank' | 'my-sessions';
const CATEGORIES = ['All', 'Behavioral', 'Technical', 'Situational', 'Case Study'];
const DIFFICULTIES = ['All', 'Standard', 'Advanced'];

export default function InterviewPrepPage() {
  const { interviewPrep } = useProviders();
  const [tab, setTab] = useState<IpTab>('question-bank');
  const [activeCat, setActiveCat] = useState('All');
  const [activeDiff, setActiveDiff] = useState('All');
  const [role, setRole] = useState('');
  const [dept, setDept] = useState('');
  const [level, setLevel] = useState('');
  const [search, setSearch] = useState('');
  const [questions, setQuestions] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set());
  const [meta, setMeta] = useState<{ roles: string[]; departments: string[]; levels: string[] }>({ roles: [], departments: [], levels: [] });
  const [loading, setLoading] = useState(true);

  // Load cluster meta for dropdowns
  useEffect(() => {
    interviewPrep.getClusterMeta().then(setMeta).catch(() => {});
    interviewPrep.getBookmarks().then(b => setBookmarks(new Set(b))).catch(() => {});
    interviewPrep.getSessions().then(setSessions).catch(() => {});
  }, [interviewPrep]);

  // Load questions when filters change
  useEffect(() => {
    setLoading(true);
    const filters: Record<string, any> = {};
    if (activeCat !== 'All') filters.category = activeCat.toLowerCase().replace(' ', '_');
    if (activeDiff !== 'All') filters.difficulty = activeDiff.toLowerCase();
    if (role) filters.role = role;
    if (dept) filters.department = dept;
    if (level) filters.level = level;
    if (search) filters.search = search;
    interviewPrep.getQuestions(filters).then(q => { setQuestions(q); setLoading(false); }).catch(() => setLoading(false));
  }, [interviewPrep, activeCat, activeDiff, role, dept, level, search]);

  const toggleBookmark = useCallback(async (id: string) => {
    await interviewPrep.toggleBookmark(id);
    setBookmarks(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }, [interviewPrep]);

  const pill = (active: boolean) =>
    `px-3 py-1 rounded-full text-[11px] font-semibold border transition-all cursor-pointer ${
      active ? 'bg-accent text-white border-accent' : 'bg-bg-card text-text-dim border-border hover:border-accent'}`;
  const sel = "px-2.5 py-1.5 rounded-md border border-border bg-bg-input text-[12px] text-text min-w-[120px]";

  return (
    <div>
      <PageHeader title="Interview Prep" subtitle="Practice with role-specific questions generated from real job descriptions" />
      <div className="flex gap-1 mb-4 border-b border-border">
        {([{ key: 'question-bank' as IpTab, label: 'Question Bank' }, { key: 'my-sessions' as IpTab, label: 'My Sessions' }]).map(t => (
          <button key={t.key} className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-colors -mb-px ${tab === t.key ? 'border-accent text-accent' : 'border-transparent text-text-faint hover:text-text'}`} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {tab === 'question-bank' && (
        <div>
          {/* Filter dropdowns */}
          <div className="flex gap-2 flex-wrap mb-3">
            <select className={sel} value={role} onChange={e => setRole(e.target.value)}>
              <option value="">All Roles</option>
              {meta.roles.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <select className={sel} value={dept} onChange={e => setDept(e.target.value)}>
              <option value="">All Departments</option>
              {meta.departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select className={sel} value={level} onChange={e => setLevel(e.target.value)}>
              <option value="">All Levels</option>
              {meta.levels.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>

          {/* Category pills */}
          <div className="flex gap-1.5 flex-wrap mb-2.5">
            {CATEGORIES.map(c => <button key={c} className={pill(activeCat === c)} onClick={() => setActiveCat(c)}>{c}</button>)}
          </div>

          {/* Difficulty + search */}
          <div className="flex gap-2 items-center flex-wrap mb-4">
            <div className="flex gap-1">
              {DIFFICULTIES.map(d => <button key={d} className={pill(activeDiff === d)} onClick={() => setActiveDiff(d)}>{d}</button>)}
            </div>
            <input type="text" placeholder="Search questions or skills..." value={search} onChange={e => setSearch(e.target.value)}
              className="flex-1 min-w-[200px] px-3 py-[7px] rounded-md border border-border bg-bg-input text-[12px] text-text placeholder:text-text-faint" />
          </div>

          {/* Bookmarked section */}
          {bookmarks.size > 0 && (
            <details className="mb-4">
              <summary className="text-[13px] font-semibold text-accent cursor-pointer">
                <Bookmark className="w-3.5 h-3.5 inline mr-1" strokeWidth={2} /> Bookmarked Questions ({bookmarks.size})
              </summary>
              <div className="mt-2 space-y-2">
                {questions.filter(q => bookmarks.has(q.id)).map(q => (
                  <div key={q.id} className="border border-border rounded-lg bg-bg-card p-3 text-[12px] text-text">{q.question}</div>
                ))}
              </div>
            </details>
          )}

          {/* Question cards */}
          {loading ? (
            <div className="text-center py-10 text-text-faint text-[13px]">Loading questions...</div>
          ) : questions.length === 0 ? (
            <div className="text-center py-10 text-text-faint">
              <p className="text-[13px] font-medium">No questions found</p>
              <p className="text-[11px] mt-1">Try adjusting your filters or add jobs to your pipeline</p>
            </div>
          ) : (
            <div className="space-y-2">
              {questions.map(q => (
                <div key={q.id} className="border border-border rounded-lg bg-bg-card p-4 hover:border-accent transition-colors">
                  <div className="flex items-start gap-2">
                    <button onClick={() => toggleBookmark(q.id)} className="mt-0.5 flex-shrink-0 text-text-faint hover:text-accent">
                      {bookmarks.has(q.id) ? <BookmarkCheck className="w-4 h-4 text-accent" strokeWidth={2} /> : <Bookmark className="w-4 h-4" strokeWidth={1.5} />}
                    </button>
                    <div className="flex-1">
                      <div className="text-[13px] font-medium text-text">{q.question}</div>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {q.category && <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-accent/10 text-accent uppercase">{q.category}</span>}
                        {q.difficulty && <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-bg-input text-text-faint uppercase">{q.difficulty}</span>}
                        {q.role_cluster && <span className="text-[10px] text-text-faint">{q.role_cluster}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              <div className="text-[11px] text-text-faint text-center mt-2">{questions.length} question{questions.length !== 1 ? 's' : ''}</div>
            </div>
          )}
        </div>
      )}

      {tab === 'my-sessions' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="text-[13px] text-text-dim">Practice interviews powered by Claude AI</div>
            <button onClick={async () => { try { const { callGateway } = await import("@app/lib/supabase"); const result = await callGateway("interview-practice", { action: "start" }); if (result?.session_id) alert("Mock interview started! Session: " + result.session_id); } catch { alert("Failed to start mock interview"); } }} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-accent text-white text-[12px] font-semibold">
              <Play className="w-3.5 h-3.5" strokeWidth={2} /> Start Mock Interview
            </button>
          </div>
          {sessions.length === 0 ? (
            <div className="text-center py-10 text-text-faint">
              <p className="text-[13px]">No practice sessions yet.</p>
              <p className="text-[11px] mt-1">Start a mock interview to practice with AI-generated questions.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sessions.map((s: any) => (
                <div key={s.id} className="border border-border rounded-lg bg-bg-card p-3">
                  <div className="text-[13px] font-medium text-text">{s.title || 'Practice Session'}</div>
                  <div className="text-[11px] text-text-faint mt-0.5">{s.created_at ? new Date(s.created_at).toLocaleDateString() : ''} · {s.question_count || 0} questions</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
