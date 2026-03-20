// ============================================================
// FeedbackPage.tsx — Dashboard Feedback Page
// FB-04 through FB-07: POD2_HANDOFF_FeedbackSystem
// Three tabs: Honest Feedback | Report a Bug | Suggest a Feature
// ============================================================
import { useState, useEffect } from 'react';
import { MessageSquare, Bug, Lightbulb, Upload, X } from 'lucide-react';

// ── Supabase access ──────────────────────────────────────────
declare var sb: any;
declare var currentUser: any;

// ── Types ────────────────────────────────────────────────────
type Tab = 'feedback' | 'bug' | 'feature';

const SEVERITY_OPTIONS = [
  { value: 'minor',    label: 'Annoying but I can work around it' },
  { value: 'blocking', label: 'Blocks me from doing something' },
  { value: 'critical', label: 'Something is very wrong' },
];

const FEATURE_CATEGORIES = [
  'Resume and cover letters',
  'Job tracking and pipeline',
  'Auto-apply and automation',
  'Job discovery and filters',
  'LinkedIn and networking',
  'Data and analytics',
  'Employer accountability',
  'Company intelligence',
  'Notifications',
  'Interview prep',
  'Account and billing',
  'Platform and UX',
  'Other',
];

const DASHBOARD_PAGES = [
  'Jobs Feed', 'Pipeline', 'Resumes', 'Applications', 'Interview Prep',
  'Stats', 'Settings', 'Subscription', 'Notifications', 'Search Tuning',
  'Feedback', 'Other',
];

const STATUS_LABELS: Record<string, string> = {
  submitted: 'Submitted',
  confirmed: 'Confirmed',
  wont_fix:  "Won't fix",
  duplicate: 'Duplicate',
  planned:   'Planned',
  shipped:   'Shipped',
  declined:  'Declined',
};

// ── Score circles ─────────────────────────────────────────────
function ScoreCircles({ value, onChange, labels }: {
  value: number | null;
  onChange: (v: number) => void;
  labels?: [string, string];
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2 items-center">
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-pressed={value === n}
            className={`w-10 h-10 rounded-full border-2 text-[14px] font-semibold transition-all
              ${value === n
                ? 'bg-accent border-accent text-white'
                : 'border-border bg-bg-input text-text-dim hover:border-accent hover:text-accent'
              }`}
          >
            {n}
          </button>
        ))}
      </div>
      {labels && (
        <div className="flex justify-between text-[11px] text-text-faint px-1">
          <span>{labels[0]}</span>
          <span>{labels[1]}</span>
        </div>
      )}
    </div>
  );
}

// ── Tab 1: Honest Feedback ────────────────────────────────────
function HonestFeedbackTab() {
  const [score, setScore] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => { loadHistory(); }, []);

  async function loadHistory() {
    try {
      const { data } = await sb.from('exit_surveys')
        .select('created_at, satisfaction, follow_up')
        .eq('survey_type', 'feedback_manual')
        .order('created_at', { ascending: false })
        .limit(10);
      setHistory(data || []);
    } catch (e) { console.error("[BJ:Feedback] Failed:", e); }
  }

  async function handleSubmit() {
    if (!score) return;
    setSubmitting(true);
    try {
      const session = await sb.auth.getSession();
      const userId = session?.data?.session?.user?.id || null;
      await sb.from('exit_surveys').insert({
        survey_type: 'feedback_manual',
        satisfaction: score,
        follow_up: text.trim() || null,
        user_id: userId,
        page_url: window.location.pathname,
      });
      if ((window as any).posthog) (window as any).posthog.capture('sat_prompt_feedback', { score, has_text: text.length > 0 });
      setSubmitted(true);
      setText('');
      setScore(null);
      await loadHistory();
    } catch (e) {
      console.error('[Feedback] Submit error:', e);
    }
    setSubmitting(false);
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <div className="text-green text-[32px]">✓</div>
        <p className="text-[15px] font-semibold">Thanks for the feedback!</p>
        <button onClick={() => setSubmitted(false)} className="text-[13px] text-accent hover:underline">Give more feedback</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 max-w-lg">
      <div>
        <p className="text-[14px] font-semibold text-text mb-3">How satisfied are you with Brilliant Jobs?</p>
        <ScoreCircles value={score} onChange={setScore} labels={['Not at all', 'Love it']} />
      </div>

      {score !== null && (
        <div>
          <label className="block text-[12px] font-semibold text-text-faint uppercase tracking-[0.5px] mb-1.5">
            Tell us more <span className="font-normal lowercase normal-case">(optional)</span>
          </label>
          <textarea
            rows={4}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={score <= 3 ? "What's not working? We want to fix it." : "What do you like most?"}
            className="w-full px-3 py-2.5 rounded-lg border border-border bg-bg-input text-[13px] text-text resize-y focus:border-accent focus:outline-none"
          />
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={!score || submitting}
        className="px-5 py-2.5 rounded-lg bg-accent text-white text-[13px] font-semibold self-start disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
      >
        {submitting ? 'Submitting…' : 'Submit'}
      </button>

      {history.length > 0 && (
        <div className="mt-2">
          <p className="text-[11px] font-semibold text-text-faint uppercase tracking-[0.5px] mb-2">Your feedback history</p>
          <div className="flex flex-col gap-1.5">
            {history.map((h, i) => (
              <div key={i} className="flex items-center gap-3 text-[12px] text-text-dim px-3 py-2 bg-bg-input rounded-lg">
                <span className="font-semibold text-accent">{h.satisfaction}/5</span>
                <span className="text-text-faint">{new Date(h.created_at).toLocaleDateString()}</span>
                {h.follow_up && <span className="truncate flex-1">{h.follow_up}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab 2: Report a Bug ───────────────────────────────────────
function BugReportTab({ lastPage }: { lastPage: string }) {
  const [happened, setHappened] = useState('');
  const [expected, setExpected] = useState('');
  const [page, setPage] = useState(lastPage || 'Other');
  const [severity, setSeverity] = useState('');
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotError, setScreenshotError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [bugRewardStandard, setBugRewardStandard] = useState(5);
  const [bugRewardCritical, setBugRewardCritical] = useState(15);

  useEffect(() => {
    loadHistory();
    loadRewardConfig();
  }, []);

  async function loadRewardConfig() {
    try {
      const cached = localStorage.getItem('bj_app_settings');
      if (cached) {
        const settings = JSON.parse(cached);
        if (settings.bug_reward_standard) setBugRewardStandard(parseInt(settings.bug_reward_standard, 10));
        if (settings.bug_reward_critical) setBugRewardCritical(parseInt(settings.bug_reward_critical, 10));
      }
    } catch (e) { console.error("[BJ:Feedback] Failed:", e); }
  }

  async function loadHistory() {
    try {
      const { data } = await sb.from('bug_reports')
        .select('created_at, page_name, severity, status, credits_awarded')
        .order('created_at', { ascending: false })
        .limit(10);
      setHistory(data || []);
    } catch (e) { console.error("[BJ:Feedback] Failed:", e); }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setScreenshotError('');
    const file = e.target.files?.[0] || null;
    if (!file) { setScreenshotFile(null); return; }
    if (file.size > 5 * 1024 * 1024) { setScreenshotError('Max 5MB'); return; }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setScreenshotError('PNG, JPG, or WebP only');
      return;
    }
    setScreenshotFile(file);
  }

  async function handleSubmit() {
    if (!happened.trim() || !expected.trim() || !severity) return;
    setSubmitting(true);
    try {
      const session = await sb.auth.getSession();
      const userId = session?.data?.session?.user?.id;

      let screenshotUrl: string | null = null;
      if (screenshotFile && userId) {
        const ext = screenshotFile.name.split('.').pop();
        const path = `bug-screenshots/${userId}/${Date.now()}.${ext}`;
        const { error: uploadErr } = await sb.storage.from('user-uploads').upload(path, screenshotFile);
        if (!uploadErr) screenshotUrl = path;
      }

      await sb.from('bug_reports').insert({
        user_id:        userId,
        what_happened:  happened.trim(),
        what_expected:  expected.trim(),
        page_name:      page,
        screenshot_url: screenshotUrl,
        severity,
      });

      if ((window as any).posthog) (window as any).posthog.capture('bug_report_submitted', { severity, page });

      setSubmitted(true);
      await loadHistory();
    } catch (e) {
      console.error('[BugReport] Submit error:', e);
    }
    setSubmitting(false);
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 max-w-lg">
        <div className="text-green text-[32px]">✓</div>
        <p className="text-[15px] font-semibold text-center">Thanks! We'll review this and award credits if confirmed.</p>
        <p className="text-[13px] text-text-dim text-center">Confirmed bugs earn {bugRewardStandard} credits. Critical bugs earn {bugRewardCritical} credits.</p>
        <button onClick={() => setSubmitted(false)} className="text-[13px] text-accent hover:underline">Report another bug</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 max-w-lg">
      <div className="px-3 py-2.5 bg-accent-dim border border-accent/20 rounded-lg text-[12px] text-text-dim">
        <span className="font-semibold text-accent">Earn credits</span> for confirmed bugs — {bugRewardStandard} for standard, {bugRewardCritical} for critical. Credits are awarded when we confirm the report.
      </div>

      <div>
        <label className="block text-[12px] font-semibold text-text-faint uppercase tracking-[0.5px] mb-1.5">What happened? <span className="text-red">*</span></label>
        <textarea rows={3} value={happened} onChange={e => setHappened(e.target.value)}
          placeholder="Describe what went wrong…"
          className="w-full px-3 py-2.5 rounded-lg border border-border bg-bg-input text-[13px] text-text resize-y focus:border-accent focus:outline-none" />
      </div>

      <div>
        <label className="block text-[12px] font-semibold text-text-faint uppercase tracking-[0.5px] mb-1.5">What did you expect? <span className="text-red">*</span></label>
        <textarea rows={2} value={expected} onChange={e => setExpected(e.target.value)}
          placeholder="What should have happened instead?"
          className="w-full px-3 py-2.5 rounded-lg border border-border bg-bg-input text-[13px] text-text resize-y focus:border-accent focus:outline-none" />
      </div>

      <div>
        <label className="block text-[12px] font-semibold text-text-faint uppercase tracking-[0.5px] mb-1.5">What page were you on?</label>
        <select value={page} onChange={e => setPage(e.target.value)}
          className="w-full px-3 py-2.5 rounded-lg border border-border bg-bg-input text-[13px] text-text cursor-pointer focus:border-accent focus:outline-none">
          {DASHBOARD_PAGES.map(p => <option key={p}>{p}</option>)}
        </select>
      </div>

      <div>
        <label className="block text-[12px] font-semibold text-text-faint uppercase tracking-[0.5px] mb-1.5">How bad is this? <span className="text-red">*</span></label>
        <div className="flex flex-col gap-1.5">
          {SEVERITY_OPTIONS.map(opt => (
            <label key={opt.value} className="flex items-center gap-2.5 cursor-pointer">
              <input type="radio" name="severity" value={opt.value} checked={severity === opt.value}
                onChange={() => setSeverity(opt.value)}
                className="accent-accent" />
              <span className="text-[13px] text-text-dim">{opt.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-[12px] font-semibold text-text-faint uppercase tracking-[0.5px] mb-1.5">Screenshot <span className="font-normal">(optional, max 5MB)</span></label>
        <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border bg-bg-input cursor-pointer hover:border-accent transition-colors text-[13px] text-text-dim">
          <Upload className="w-4 h-4" strokeWidth={1.5} />
          {screenshotFile ? screenshotFile.name : 'Choose PNG, JPG, or WebP…'}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={handleFileChange} />
        </label>
        {screenshotError && <p className="text-[11px] text-red mt-1">{screenshotError}</p>}
        {screenshotFile && (
          <button onClick={() => setScreenshotFile(null)} className="text-[11px] text-text-faint hover:text-red mt-1 flex items-center gap-1">
            <X className="w-3 h-3" /> Remove
          </button>
        )}
      </div>

      <button
        onClick={handleSubmit}
        disabled={!happened.trim() || !expected.trim() || !severity || submitting}
        className="px-5 py-2.5 rounded-lg bg-accent text-white text-[13px] font-semibold self-start disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
      >
        {submitting ? 'Submitting…' : 'Report bug and earn credits'}
      </button>

      {history.length > 0 && (
        <div className="mt-2">
          <p className="text-[11px] font-semibold text-text-faint uppercase tracking-[0.5px] mb-2">Your bug reports</p>
          <div className="flex flex-col gap-1.5">
            {history.map((h, i) => (
              <div key={i} className="flex items-center gap-3 text-[12px] text-text-dim px-3 py-2 bg-bg-input rounded-lg">
                <span className="text-text-faint">{new Date(h.created_at).toLocaleDateString()}</span>
                <span>{h.page_name || '—'}</span>
                <span className="capitalize">{h.severity}</span>
                <span className={`ml-auto font-semibold ${h.status === 'confirmed' ? 'text-green' : h.status === 'wont_fix' ? 'text-text-faint' : 'text-accent'}`}>
                  {STATUS_LABELS[h.status] || h.status}
                </span>
                {h.credits_awarded > 0 && <span className="text-green font-semibold">+{h.credits_awarded} cr</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab 3: Feature Suggestions ────────────────────────────────
function FeatureSuggestionTab() {
  const [type, setType] = useState<'new_feature' | 'change_existing'>('new_feature');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [rationale, setRationale] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => { loadHistory(); }, []);

  async function loadHistory() {
    try {
      const { data } = await sb.from('feature_suggestions')
        .select('created_at, category, status')
        .order('created_at', { ascending: false })
        .limit(10);
      setHistory(data || []);
    } catch (e) { console.error("[BJ:Feedback] Failed:", e); }
  }

  async function handleSubmit() {
    if (!description.trim() || !category) return;
    setSubmitting(true);
    try {
      const session = await sb.auth.getSession();
      const userId = session?.data?.session?.user?.id;
      await sb.from('feature_suggestions').insert({
        user_id:         userId,
        suggestion_type: type,
        category,
        description:     description.trim(),
        rationale:       rationale.trim() || null,
      });
      if ((window as any).posthog) (window as any).posthog.capture('feature_suggestion_submitted', { category, type });
      setSubmitted(true);
      await loadHistory();
    } catch (e) {
      console.error('[FeatureSuggestion] Submit error:', e);
    }
    setSubmitting(false);
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 max-w-lg">
        <div className="text-green text-[32px]">✓</div>
        <p className="text-[15px] font-semibold">Thanks! We review every suggestion.</p>
        <button onClick={() => setSubmitted(false)} className="text-[13px] text-accent hover:underline">Submit another suggestion</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 max-w-lg">
      <div>
        <label className="block text-[12px] font-semibold text-text-faint uppercase tracking-[0.5px] mb-2">Is this a new feature or a change to an existing one?</label>
        <div className="flex gap-0 rounded-lg overflow-hidden border border-border">
          {[
            { value: 'new_feature' as const, label: 'New feature' },
            { value: 'change_existing' as const, label: 'Change existing' },
          ].map(opt => (
            <button key={opt.value} type="button" onClick={() => setType(opt.value)}
              className={`flex-1 py-2 px-3.5 text-[13px] font-semibold text-center transition-all
                ${type === opt.value ? 'bg-accent text-white' : 'bg-bg-input text-text-dim hover:text-text'}`}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-[12px] font-semibold text-text-faint uppercase tracking-[0.5px] mb-1.5">Category <span className="text-red">*</span></label>
        <select value={category} onChange={e => setCategory(e.target.value)}
          className="w-full px-3 py-2.5 rounded-lg border border-border bg-bg-input text-[13px] text-text cursor-pointer focus:border-accent focus:outline-none">
          <option value="">Select a category…</option>
          {FEATURE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>

      <div>
        <label className="block text-[12px] font-semibold text-text-faint uppercase tracking-[0.5px] mb-1.5">What do you want? <span className="text-red">*</span></label>
        <textarea rows={4} value={description} onChange={e => setDescription(e.target.value)}
          placeholder="Describe the feature or change…"
          className="w-full px-3 py-2.5 rounded-lg border border-border bg-bg-input text-[13px] text-text resize-y focus:border-accent focus:outline-none" />
      </div>

      <div>
        <label className="block text-[12px] font-semibold text-text-faint uppercase tracking-[0.5px] mb-1.5">Why does this matter to you? <span className="font-normal">(optional)</span></label>
        <textarea rows={2} value={rationale} onChange={e => setRationale(e.target.value)}
          placeholder="How would this help your job search?"
          className="w-full px-3 py-2.5 rounded-lg border border-border bg-bg-input text-[13px] text-text resize-y focus:border-accent focus:outline-none" />
      </div>

      <button
        onClick={handleSubmit}
        disabled={!description.trim() || !category || submitting}
        className="px-5 py-2.5 rounded-lg bg-accent text-white text-[13px] font-semibold self-start disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
      >
        {submitting ? 'Submitting…' : 'Submit suggestion'}
      </button>

      {history.length > 0 && (
        <div className="mt-2">
          <p className="text-[11px] font-semibold text-text-faint uppercase tracking-[0.5px] mb-2">Your suggestions</p>
          <div className="flex flex-col gap-1.5">
            {history.map((h, i) => (
              <div key={i} className="flex items-center gap-3 text-[12px] text-text-dim px-3 py-2 bg-bg-input rounded-lg">
                <span className="text-text-faint">{new Date(h.created_at).toLocaleDateString()}</span>
                <span className="flex-1 truncate">{h.category}</span>
                <span className={`font-semibold ml-auto ${h.status === 'shipped' ? 'text-green' : h.status === 'planned' ? 'text-accent' : h.status === 'declined' ? 'text-text-faint' : 'text-text-dim'}`}>
                  {STATUS_LABELS[h.status] || h.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function FeedbackPage() {
  const [tab, setTab] = useState<Tab>('feedback');
  const [lastPage, setLastPage] = useState('Other');

  useEffect(() => {
    // FB-16: Pre-fill page from sessionStorage breadcrumb
    const prev = sessionStorage.getItem('bj_last_page');
    if (prev) setLastPage(prev);
  }, []);

  const tabs: { id: Tab; label: string; Icon: typeof MessageSquare }[] = [
    { id: 'feedback', label: 'How are we doing?', Icon: MessageSquare },
    { id: 'bug',      label: 'Report a bug',       Icon: Bug },
    { id: 'feature',  label: 'Suggest a feature',  Icon: Lightbulb },
  ];

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-[22px] font-bold text-text mb-1">Feedback</h1>
        <p className="text-[14px] text-text-dim">Help us make Brilliant Jobs better.</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border mb-6">
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-[13px] font-semibold border-b-2 transition-all -mb-px
              ${tab === id
                ? 'border-accent text-accent'
                : 'border-transparent text-text-dim hover:text-text hover:border-border-hover'
              }`}
          >
            <Icon className="w-4 h-4" strokeWidth={1.75} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'feedback' && <HonestFeedbackTab />}
      {tab === 'bug'      && <BugReportTab lastPage={lastPage} />}
      {tab === 'feature'  && <FeatureSuggestionTab />}
    </div>
  );
}
