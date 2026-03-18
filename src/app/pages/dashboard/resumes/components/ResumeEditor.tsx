import { useState, useCallback } from 'react';

type EditorTab = 'contact' | 'summary' | 'experience' | 'education' | 'skills' | 'certs';
const TABS: { key: EditorTab; label: string }[] = [
  { key: 'contact', label: 'Contact' },
  { key: 'summary', label: 'Summary' },
  { key: 'experience', label: 'Experience' },
  { key: 'education', label: 'Education' },
  { key: 'skills', label: 'Skills' },
  { key: 'certs', label: 'Certs' },
];

interface ResumeEditorProps {
  onSave: () => void;
  onReset: () => void;
  status: string;
}

const inputCls = "w-full px-2.5 py-1.5 rounded-md border border-border bg-bg-input text-[12px] text-text";
const labelCls = "text-[10px] text-text-dim block mb-0.5";

export function ResumeEditor({ onSave, onReset, status }: ResumeEditorProps) {
  const [tab, setTab] = useState<EditorTab>('contact');
  const [data, setData] = useState({
    name: '', email: '', phone: '', linkedin: '', location: '', website: '',
    summary: '',
    experience: [{ title: '', company: '', dates: '', bullets: '' }],
    education: [{ school: '', degree: '', dates: '' }],
    skills: '',
    certs: '',
  });

  const set = useCallback((field: string, value: string) => {
    setData(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleSave = useCallback(async () => {
    try {
      const { callGateway } = await import('@app/lib/supabase');
      await callGateway('build-resume', { data }, { timeout: 15000 });
      onSave();
    } catch { onSave(); }
  }, [data, onSave]);

  return (
    <>
      <div className="flex gap-1 mb-4 border-b border-border">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 text-[11px] font-medium border-b-2 -mb-px transition-colors ${tab === t.key ? 'border-accent text-accent' : 'border-transparent text-text-faint hover:text-text'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'contact' && (
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelCls}>Full Name</label><input value={data.name} onChange={e => set('name', e.target.value)} placeholder="Jane Smith" className={inputCls} /></div>
          <div><label className={labelCls}>Email</label><input value={data.email} onChange={e => set('email', e.target.value)} placeholder="jane@example.com" className={inputCls} /></div>
          <div><label className={labelCls}>Phone</label><input value={data.phone} onChange={e => set('phone', e.target.value)} placeholder="+1 555 000 0000" className={inputCls} /></div>
          <div><label className={labelCls}>LinkedIn URL</label><input value={data.linkedin} onChange={e => set('linkedin', e.target.value)} placeholder="linkedin.com/in/janesmith" className={inputCls} /></div>
          <div><label className={labelCls}>Location</label><input value={data.location} onChange={e => set('location', e.target.value)} placeholder="San Francisco, CA" className={inputCls} /></div>
          <div><label className={labelCls}>Website</label><input value={data.website} onChange={e => set('website', e.target.value)} placeholder="janesmith.dev" className={inputCls} /></div>
        </div>
      )}

      {tab === 'summary' && (
        <div>
          <label className={labelCls}>Professional Summary</label>
          <textarea value={data.summary} onChange={e => set('summary', e.target.value)} rows={6} placeholder="Results-driven product manager with 8+ years…" className={`${inputCls} resize-y`} />
        </div>
      )}

      {tab === 'experience' && (
        <div className="space-y-4">
          {data.experience.map((exp, i) => (
            <div key={i} className="border border-border rounded-lg p-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div><label className={labelCls}>Job Title</label><input value={exp.title} onChange={e => { const next = [...data.experience]; next[i] = { ...next[i] as any, title: e.target.value }; setData(prev => ({ ...prev, experience: next })); }} placeholder="Senior Product Manager" className={inputCls} /></div>
                <div><label className={labelCls}>Company</label><input value={exp.company} onChange={e => { const next = [...data.experience]; next[i] = { ...next[i] as any, company: e.target.value }; setData(prev => ({ ...prev, experience: next })); }} placeholder="Google" className={inputCls} /></div>
              </div>
              <div><label className={labelCls}>Dates</label><input value={exp.dates} onChange={e => { const next = [...data.experience]; next[i] = { ...next[i] as any, dates: e.target.value }; setData(prev => ({ ...prev, experience: next })); }} placeholder="Jan 2020 – Present" className={inputCls} /></div>
              <div><label className={labelCls}>Bullet Points (one per line)</label><textarea value={exp.bullets} onChange={e => { const next = [...data.experience]; next[i] = { ...next[i] as any, bullets: e.target.value }; setData(prev => ({ ...prev, experience: next })); }} rows={4} placeholder="Led cross-functional team of 12…" className={`${inputCls} resize-y`} /></div>
            </div>
          ))}
          <button onClick={() => setData(prev => ({ ...prev, experience: [...prev.experience, { title: '', company: '', dates: '', bullets: '' }] }))} className="px-3 py-1 rounded-md text-xs font-medium text-accent border border-accent hover:bg-accent/5">+ Add Position</button>
        </div>
      )}

      {tab === 'education' && (
        <div className="space-y-4">
          {data.education.map((edu, i) => (
            <div key={i} className="border border-border rounded-lg p-3 space-y-2">
              <div><label className={labelCls}>School</label><input value={edu.school} onChange={e => { const next = [...data.education]; next[i] = { ...next[i] as any, school: e.target.value }; setData(prev => ({ ...prev, education: next })); }} placeholder="Stanford University" className={inputCls} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className={labelCls}>Degree</label><input value={edu.degree} onChange={e => { const next = [...data.education]; next[i] = { ...next[i] as any, degree: e.target.value }; setData(prev => ({ ...prev, education: next })); }} placeholder="MBA" className={inputCls} /></div>
                <div><label className={labelCls}>Dates</label><input value={edu.dates} onChange={e => { const next = [...data.education]; next[i] = { ...next[i] as any, dates: e.target.value }; setData(prev => ({ ...prev, education: next })); }} placeholder="2016 – 2018" className={inputCls} /></div>
              </div>
            </div>
          ))}
          <button onClick={() => setData(prev => ({ ...prev, education: [...prev.education, { school: '', degree: '', dates: '' }] }))} className="px-3 py-1 rounded-md text-xs font-medium text-accent border border-accent hover:bg-accent/5">+ Add School</button>
        </div>
      )}

      {tab === 'skills' && (
        <div>
          <label className={labelCls}>Skills (comma-separated)</label>
          <textarea value={data.skills} onChange={e => set('skills', e.target.value)} rows={4} placeholder="React, TypeScript, Product Strategy, SQL, Figma, A/B Testing…" className={`${inputCls} resize-y`} />
        </div>
      )}

      {tab === 'certs' && (
        <div>
          <label className={labelCls}>Certifications (one per line)</label>
          <textarea value={data.certs} onChange={e => set('certs', e.target.value)} rows={4} placeholder="PMP, Project Management Institute, 2021&#10;AWS Solutions Architect, Amazon, 2020" className={`${inputCls} resize-y`} />
        </div>
      )}

      <div className="flex gap-2 mt-4 items-center">
        <button onClick={handleSave} className="px-4 py-2 rounded-md bg-accent text-white text-sm font-semibold">Save Changes</button>
        <button onClick={() => { setData({ name: '', email: '', phone: '', linkedin: '', location: '', website: '', summary: '', experience: [{ title: '', company: '', dates: '', bullets: '' }], education: [{ school: '', degree: '', dates: '' }], skills: '', certs: '' }); onReset(); }} className="px-4 py-2 rounded-md border border-border text-sm font-medium text-text-dim hover:border-accent">Start Over</button>
        {status && <span className="text-[11px] text-text-dim">{status}</span>}
      </div>
    </>
  );
}
