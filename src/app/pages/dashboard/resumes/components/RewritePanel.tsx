// ============================================================
// RewritePanel — AI Resume Rewrite (SPA-CUT-FINAL)
// ============================================================
// Inline panel that appears when user clicks "Rewrite" on a resume.
// Sends resume text to the rewrite EF via gateway, shows result,
// lets user accept (saves as new resume version) or discard.
// ============================================================

import { useState, useCallback } from 'react';
import { Button, Card } from '@app/components';
import { callGateway } from '@lib/supabase';

interface RewritePanelProps {
  resumeName: string;
  resumeText: string;
  onAccept: (rewrittenText: string) => void;
  onClose: () => void;
}

export function RewritePanel({ resumeName, resumeText, onAccept, onClose }: RewritePanelProps) {
  const [step, setStep] = useState<'config' | 'loading' | 'result'>('config');
  const [tone, setTone] = useState<'professional' | 'concise' | 'creative'>('professional');
  const [focus, setFocus] = useState('');
  const [result, setResult] = useState('');
  const [error, setError] = useState<string | null>(null);

  const runRewrite = useCallback(async () => {
    setStep('loading');
    setError(null);
    try {
      const response = await callGateway<{ rewritten_text: string }>('rewrite-resume', {
        resume_text: resumeText,
        tone,
        focus_areas: focus || undefined,
      }, { timeout: 60000 });
      if (response?.rewritten_text) {
        setResult(response.rewritten_text);
        setStep('result');
      } else {
        throw new Error('No rewritten text returned');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rewrite failed');
      setStep('config');
    }
  }, [resumeText, tone, focus]);

  return (
    <Card className="mt-4 border-accent/30">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-text">
          AI Rewrite — {resumeName}
        </h3>
        <button
          onClick={onClose}
          className="text-text-faint hover:text-text text-xs"
          aria-label="Close rewrite panel"
        >
          ✕
        </button>
      </div>

      {step === 'config' && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-text-dim mb-1">Tone</label>
            <div className="flex gap-2">
              {(['professional', 'concise', 'creative'] as const).map(t => (
                <button
                  key={t}
                  className={`px-3 py-1.5 text-xs rounded-md border transition-all ${
                    tone === t ? 'border-accent bg-accent/10 text-accent' : 'border-border text-text-dim hover:border-border-hover'
                  }`}
                  onClick={() => setTone(t)}
                  aria-label={`Set tone to ${t}`}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="rewrite-focus" className="block text-xs font-medium text-text-dim mb-1">
              Focus areas (optional)
            </label>
            <input
              id="rewrite-focus"
              type="text"
              className="w-full px-2.5 py-1.5 text-xs bg-bg-input border border-border rounded-md text-text placeholder:text-text-faint"
              placeholder="e.g., leadership, technical skills, quantified impact"
              value={focus}
              onChange={e => setFocus(e.target.value)}
              aria-label="Focus areas for rewrite"
            />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <Button onClick={runRewrite}>Rewrite with AI</Button>
        </div>
      )}

      {step === 'loading' && (
        <div className="flex items-center justify-center py-8">
          <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" aria-hidden="true" />
          <span className="ml-2 text-xs text-text-dim">Rewriting resume…</span>
        </div>
      )}

      {step === 'result' && (
        <div className="space-y-3">
          <div className="max-h-64 overflow-y-auto p-3 bg-bg-input rounded-md border border-border">
            <pre className="text-xs text-text whitespace-pre-wrap font-sans leading-relaxed">{result}</pre>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => onAccept(result)}>Accept Rewrite</Button>
            <Button onClick={() => setStep('config')}>Try Again</Button>
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-text-faint hover:text-text"
              aria-label="Discard rewrite"
            >
              Discard
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

export default RewritePanel;
