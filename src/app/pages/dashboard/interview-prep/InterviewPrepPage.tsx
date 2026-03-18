// ============================================================
// InterviewPrepPage — Legacy Parity (lines 3816-3958)
// ============================================================
// 2 tabs: Question Bank, My Sessions
// Question Bank: role/dept/level filters, category pills,
//   difficulty toggle, search, bookmarks, question cards
// My Sessions: start mock interview, session list
// ============================================================

import { useState } from 'react';
import { PageHeader } from '@app/components';
import { Play, Bookmark } from 'lucide-react';

type IpTab = 'question-bank' | 'my-sessions';
const CATEGORIES = ['All', 'Behavioral', 'Technical', 'Situational', 'Case Study'];
const DIFFICULTIES = ['All', 'Standard', 'Advanced'];

export default function InterviewPrepPage() {
  const [tab, setTab] = useState<IpTab>('question-bank');
  const [activeCat, setActiveCat] = useState('All');
  const [activeDiff, setActiveDiff] = useState('All');

  const pillCls = (active: boolean) =>
    `px-3 py-1 rounded-full text-[11px] font-semibold border transition-all cursor-pointer ${
      active ? 'bg-accent text-white border-accent' : 'bg-bg-card text-text-dim border-border hover:border-accent'
    }`;

  const selectCls = "px-2.5 py-1.5 rounded-md border border-border bg-bg-input text-[12px] text-text min-w-[120px]";

  return (
    <div>
      <PageHeader title="Interview Prep" subtitle="Practice with role-specific questions generated from real job descriptions" />

      {/* Tab bar */}
      <div className="flex gap-1 mb-4 border-b border-border">
        {([
          { key: 'question-bank' as IpTab, label: 'Question Bank' },
          { key: 'my-sessions' as IpTab, label: 'My Sessions' },
        ]).map(t => (
          <button key={t.key}
            className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-colors -mb-px
              ${tab === t.key ? 'border-accent text-accent' : 'border-transparent text-text-faint hover:text-text'}
            `}
            onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Question Bank */}
      {tab === 'question-bank' && (
        <div>
          {/* Filters */}
          <div className="flex gap-2 flex-wrap mb-3">
            <select className={selectCls}><option>All Roles</option></select>
            <select className={selectCls}><option>All Departments</option></select>
            <select className={selectCls}><option>All Levels</option></select>
          </div>

          {/* Category pills */}
          <div className="flex gap-1.5 flex-wrap mb-2.5">
            {CATEGORIES.map(c => (
              <button key={c} className={pillCls(activeCat === c)} onClick={() => setActiveCat(c)}>{c}</button>
            ))}
          </div>

          {/* Difficulty + search */}
          <div className="flex gap-2 items-center flex-wrap mb-4">
            <div className="flex gap-1">
              {DIFFICULTIES.map(d => (
                <button key={d} className={pillCls(activeDiff === d)} onClick={() => setActiveDiff(d)}>{d}</button>
              ))}
            </div>
            <input type="text" placeholder="Search questions or skills..."
              className="flex-1 min-w-[200px] px-3 py-1.5 rounded-md border border-border bg-bg-input text-[12px] text-text placeholder:text-text-faint" />
          </div>

          {/* Question cards placeholder */}
          <div className="text-center py-10 text-text-faint">
            <p className="text-[13px] font-medium">Loading questions...</p>
            <p className="text-[11px] mt-1">Questions will be generated from job descriptions in your pipeline</p>
          </div>
        </div>
      )}

      {/* My Sessions */}
      {tab === 'my-sessions' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="text-[13px] text-text-dim">Practice interviews powered by Claude AI</div>
            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-accent text-white text-[12px] font-semibold">
              <Play className="w-3.5 h-3.5" strokeWidth={2} /> Start Mock Interview
            </button>
          </div>
          <div className="text-center py-10 text-text-faint">
            <p className="text-[13px]">No practice sessions yet.</p>
            <p className="text-[11px] mt-1">Start a mock interview to practice with AI-generated questions.</p>
          </div>
        </div>
      )}
    </div>
  );
}
