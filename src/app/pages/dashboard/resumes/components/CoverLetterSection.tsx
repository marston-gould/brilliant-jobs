// ============================================================
// CoverLetterSection — AI Cover Letter Generator
// ============================================================
// Legacy: _clGenerate, _clExportDocx, _clSetTone, _clCopyToClipboard
// Generates cover letter from resume + job description via edge function.
// Supports tone selection, clipboard copy, and DOCX export.
// ============================================================

import { useState, useCallback } from 'react';
import { callGateway } from '@app/lib/supabase';

type Tone = 'professional' | 'casual' | 'confident';

export function CoverLetterSection() {
  const [tone, setTone] = useState<Tone>('professional');
  const [jobDescription, setJobDescription] = useState('');
  const [coverLetter, setCoverLetter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const generate = useCallback(async () => {
    if (!jobDescription.trim()) { setError('Paste a job description first'); return; }
    setLoading(true); setError(''); setCoverLetter('');
    try {
      const result = await callGateway('generate-cover-letter', {
        job_description: jobDescription.trim(),
        tone,
      });
      setCoverLetter(result?.cover_letter || result?.text || 'No cover letter generated. Check your credits.');
    } catch (e: any) {
      setError(e.message || 'Failed to generate cover letter');
    }
    setLoading(false);
  }, [jobDescription, tone]);

  const copyToClipboard = useCallback(() => {
    if (!coverLetter) return;
    navigator.clipboard.writeText(coverLetter);
    (window as any).__bjToast?.('Copied to clipboard', 'success');
  }, [coverLetter]);

  const exportDocx = useCallback(async () => {
    if (!coverLetter) return;
    try {
      const result = await callGateway('generate-cover-letter-docx', { text: coverLetter });
      if (result?.url) window.open(result.url, '_blank');
      else (window as any).__bjToast?.('DOCX export not available yet', 'info');
    } catch {
      (window as any).__bjToast?.('DOCX export failed', 'info');
    }
  }, [coverLetter]);

  const tones: { key: Tone; label: string; desc: string }[] = [
    { key: 'professional', label: 'Professional', desc: 'Polished and formal' },
    { key: 'casual', label: 'Casual', desc: 'Friendly and approachable' },
    { key: 'confident', label: 'Confident', desc: 'Bold and assertive' },
  ];

  return (
    <div className="border border-border rounded-xl bg-bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-bg-input/50">
        <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2} className="text-text-dim">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <path d="M14 2v6h6" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
        <span className="text-[13px] font-bold text-text">Cover Letter Generator</span>
        <span className="text-[11px] text-text-faint ml-1">1 credit</span>
      </div>

      <div className="p-5 space-y-4">
        {/* Tone selector */}
        <div>
          <div className="text-[11px] font-semibold text-text-faint uppercase tracking-[0.5px] mb-2">Tone</div>
          <div className="flex gap-2">
            {tones.map(t => (
              <button key={t.key} onClick={() => setTone(t.key)}
                className={`flex-1 px-3 py-2 rounded-lg border text-left transition-all ${
                  tone === t.key ? 'border-accent bg-accent/5' : 'border-border hover:border-accent'
                }`}>
                <div className="text-[12px] font-semibold text-text">{t.label}</div>
                <div className="text-[10px] text-text-faint">{t.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Job description input */}
        <div>
          <div className="text-[11px] font-semibold text-text-faint uppercase tracking-[0.5px] mb-2">Job Description</div>
          <textarea
            rows={5}
            value={jobDescription}
            onChange={e => setJobDescription(e.target.value)}
            placeholder="Paste the job description here..."
            className="w-full px-3 py-2.5 rounded-lg border border-border bg-bg-input text-[13px] text-text placeholder:text-text-faint resize-y focus:outline-none focus:border-accent"
          />
        </div>

        {/* Generate button */}
        <div className="flex items-center gap-2">
          <button onClick={generate} disabled={loading}
            className="px-4 py-2 rounded-lg bg-accent text-white text-[13px] font-semibold disabled:opacity-50">
            {loading ? 'Generating…' : 'Generate Cover Letter'}
          </button>
          {error && <span className="text-[11px] text-red">{error}</span>}
        </div>

        {/* Output */}
        {coverLetter && (
          <div className="space-y-3">
            <div className="bg-bg-main border border-border rounded-lg p-4">
              <div className="text-[13px] text-text leading-relaxed whitespace-pre-wrap">{coverLetter}</div>
            </div>
            <div className="flex gap-2">
              <button onClick={copyToClipboard}
                className="px-3.5 py-[7px] rounded-lg border border-border text-[12px] font-semibold text-text-dim hover:border-accent hover:text-accent transition-all">
                Copy to Clipboard
              </button>
              <button onClick={exportDocx}
                className="px-3.5 py-[7px] rounded-lg border border-border text-[12px] font-semibold text-text-dim hover:border-accent hover:text-accent transition-all">
                Export DOCX
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default CoverLetterSection;
