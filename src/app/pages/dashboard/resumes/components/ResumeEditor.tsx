// ============================================================
// ResumeEditor — Tabbed editor for parsed resume data
// Legacy lines 1656-1724
// ============================================================

import { useState, useCallback } from 'react';

type EditorTab = 'contact' | 'summary' | 'experience' | 'education' | 'skills' | 'certs';

interface ResumeEditorProps {
  onSave?: (data: Record<string, any>) => void;
  onReset?: () => void;
  initialData?: Record<string, any>;
}

const TABS: { key: EditorTab; label: string }[] = [
  { key: 'contact', label: 'Contact' },
  { key: 'summary', label: 'Summary' },
  { key: 'experience', label: 'Experience' },
  { key: 'education', label: 'Education' },
  { key: 'skills', label: 'Skills' },
  { key: 'certs', label: 'Certs' },
];

const input = "w-full px-2.5 py-1.5 rounded-md border border-border bg-bg-input text-[12px] text-text";
const label = "text-[10px] text-text-dim block mb-0.5";

export function ResumeEditor({ onSave, onReset, initialData }: ResumeEditorProps) {
  const [tab, setTab] = useState<EditorTab>('contact');
  const [data, setData] = useState<Record<string, any>>(initialData || {});
  const [saveStatus, setSaveStatus] = useState('');

  const set = useCallback((key: string, value: string) => {
    setData(prev => ({ ...prev, [key]: value }));
  }, []);

  const addEntry = useCallback((section: string) => {
    setData(prev => {
      const arr = [...(prev[section] || []), {}];
      return { ...prev, [section]: arr };
    });
  }, []);

  const updateEntry = useCallback((section: string, idx: number, field: string, value: string) => {
    setData(prev => {
      const arr = [...(prev[section] || [])];
      arr[idx] = { ...(arr[idx] || {}), [field]: value };
      return { ...prev, [section]: arr };
    });
  }, []);

  const removeEntry = useCallback((section: string, idx: number) => {
    setData(prev => {
      const arr = [...(prev[section] || [])];
      arr.splice(idx, 1);
      return { ...prev, [section]: arr };
    });
  }, []);

  const handleSave = useCallback(() => {
    setSaveStatus('Saving...');
    onSave?.(data);
    setTimeout(() => setSaveStatus('Saved'), 300);
  }, [data, onSave]);

  return (
    <div className="border border-border rounded-xl bg-bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-bg-input/50">
        <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2} className="text-text-dim"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        <span className="text-[13px] font-bold text-text">Edit Your Resume</span>
      </div>
      <div className="p-5">
        <div className="flex gap-1 mb-4 border-b border-border">
          {TABS.map(t => (
            <button key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 text-[11px] font-medium border-b-2 -mb-px transition-colors ${tab === t.key ? 'border-accent text-accent' : 'border-transparent text-text-faint hover:text-text'}`}
            >{t.label}</button>
          ))}
        </div>

        {tab === 'contact' && (
          <div className="grid grid-cols-2 gap-3">
            <div><label className={label}>Full Name</label><input type="text" value={data.name || ''} onChange={e => set('name', e.target.value)} placeholder="Jane Smith" className={input} /></div>
            <div><label className={label}>Email</label><input type="email" value={data.email || ''} onChange={e => set('email', e.target.value)} placeholder="jane@example.com" className={input} /></div>
            <div><label className={label}>Phone</label><input type="tel" value={data.phone || ''} onChange={e => set('phone', e.target.value)} placeholder="+1 555 000 0000" className={input} /></div>
            <div><label className={label}>LinkedIn URL</label><input type="url" value={data.linkedin || ''} onChange={e => set('linkedin', e.target.value)} placeholder="linkedin.com/in/janesmith" className={input} /></div>
            <div><label className={label}>Location</label><input type="text" value={data.location || ''} onChange={e => set('location', e.target.value)} placeholder="San Francisco, CA" className={input} /></div>
            <div><label className={label}>Website</label><input type="url" value={data.website || ''} onChange={e => set('website', e.target.value)} placeholder="janesmith.dev" className={input} /></div>
          </div>
        )}

        {tab === 'summary' && (
          <div>
            <label className={label}>Professional Summary</label>
            <textarea value={data.summary || ''} onChange={e => set('summary', e.target.value)}
              rows={5} placeholder="Experienced software engineer with 8+ years..."
              className={`${input} resize-y`} />
          </div>
        )}

        {tab === 'experience' && (
          <div className="space-y-4">
            {(data.experience || []).map((exp: any, i: number) => (
              <div key={i} className="border border-border rounded-lg p-3 space-y-2 relative">
                <button onClick={() => removeEntry('experience', i)} className="absolute top-2 right-2 text-red text-xs font-bold">×</button>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className={label}>Title</label><input type="text" value={exp.title || ''} onChange={e => updateEntry('experience', i, 'title', e.target.value)} className={input} /></div>
                  <div><label className={label}>Company</label><input type="text" value={exp.company || ''} onChange={e => updateEntry('experience', i, 'company', e.target.value)} className={input} /></div>
                  <div><label className={label}>Start</label><input type="text" value={exp.start || ''} onChange={e => updateEntry('experience', i, 'start', e.target.value)} placeholder="Jan 2020" className={input} /></div>
                  <div><label className={label}>End</label><input type="text" value={exp.end || ''} onChange={e => updateEntry('experience', i, 'end', e.target.value)} placeholder="Present" className={input} /></div>
                </div>
                <div><label className={label}>Bullets</label><textarea value={exp.bullets || ''} onChange={e => updateEntry('experience', i, 'bullets', e.target.value)} rows={3} className={`${input} resize-y`} placeholder="One bullet per line" /></div>
              </div>
            ))}
            <button onClick={() => addEntry('experience')} className="px-3 py-1 rounded-md text-xs font-medium text-accent border border-accent hover:bg-accent/5">+ Add Position</button>
          </div>
        )}

        {tab === 'education' && (
          <div className="space-y-4">
            {(data.education || []).map((edu: any, i: number) => (
              <div key={i} className="border border-border rounded-lg p-3 space-y-2 relative">
                <button onClick={() => removeEntry('education', i)} className="absolute top-2 right-2 text-red text-xs font-bold">×</button>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className={label}>School</label><input type="text" value={edu.school || ''} onChange={e => updateEntry('education', i, 'school', e.target.value)} className={input} /></div>
                  <div><label className={label}>Degree</label><input type="text" value={edu.degree || ''} onChange={e => updateEntry('education', i, 'degree', e.target.value)} className={input} /></div>
                  <div><label className={label}>Year</label><input type="text" value={edu.year || ''} onChange={e => updateEntry('education', i, 'year', e.target.value)} placeholder="2018" className={input} /></div>
                  <div><label className={label}>GPA (optional)</label><input type="text" value={edu.gpa || ''} onChange={e => updateEntry('education', i, 'gpa', e.target.value)} className={input} /></div>
                </div>
              </div>
            ))}
            <button onClick={() => addEntry('education')} className="px-3 py-1 rounded-md text-xs font-medium text-accent border border-accent hover:bg-accent/5">+ Add Education</button>
          </div>
        )}

        {tab === 'skills' && (
          <div>
            <label className={label}>Skills (comma-separated)</label>
            <textarea value={data.skills || ''} onChange={e => set('skills', e.target.value)}
              rows={4} placeholder="TypeScript, React, Node.js, PostgreSQL, AWS..."
              className={`${input} resize-y`} />
          </div>
        )}

        {tab === 'certs' && (
          <div className="space-y-4">
            {(data.certifications || []).map((cert: any, i: number) => (
              <div key={i} className="border border-border rounded-lg p-3 space-y-2 relative">
                <button onClick={() => removeEntry('certifications', i)} className="absolute top-2 right-2 text-red text-xs font-bold">×</button>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className={label}>Name</label><input type="text" value={cert.name || ''} onChange={e => updateEntry('certifications', i, 'name', e.target.value)} className={input} /></div>
                  <div><label className={label}>Issuer</label><input type="text" value={cert.issuer || ''} onChange={e => updateEntry('certifications', i, 'issuer', e.target.value)} className={input} /></div>
                  <div><label className={label}>Date</label><input type="text" value={cert.date || ''} onChange={e => updateEntry('certifications', i, 'date', e.target.value)} placeholder="2023" className={input} /></div>
                </div>
              </div>
            ))}
            <button onClick={() => addEntry('certifications')} className="px-3 py-1 rounded-md text-xs font-medium text-accent border border-accent hover:bg-accent/5">+ Add Certification</button>
          </div>
        )}

        <div className="flex gap-2 mt-4 items-center">
          <button onClick={handleSave} className="px-4 py-2 rounded-md bg-accent text-white text-sm font-semibold">Save Changes</button>
          <button onClick={() => { setData({}); onReset?.(); }} className="px-4 py-2 rounded-md border border-border text-sm font-medium text-text-dim hover:border-accent">Start Over</button>
          {saveStatus && <span className="text-[11px] text-green font-medium">{saveStatus}</span>}
        </div>
      </div>
    </div>
  );
}
