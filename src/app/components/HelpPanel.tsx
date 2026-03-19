// ============================================================
// HelpPanel — "How this works" floating panel (legacy: #page-help-panel)
// ============================================================
// Fixed bottom-right, 340px, numbered steps per page.
// Content from legacy js/app.ts _helpContent (lines 665-727).
// ============================================================

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

const helpContent: Record<string, { title: string; steps: string[] }> = {
  feed: { title: 'Jobs Feed', steps: [
    'Check one or more saved searches in the sidebar to search jobs.',
    'Shift+click column headers for multi-column sorting.',
    'Click a job title to open the full description and apply.',
    'Colored number badges show which filter matched each job.',
    'Use the keyword insights panel to see term frequency and resume match scores.',
  ]},
  tuning: { title: 'Search Tuning', steps: [
    'Set global rules that apply across ALL your saved searches.',
    'Location rules: US-only toggle and city/country exclusions.',
    'Title exclusions: remove common false positives (e.g. "intern").',
    'Company exclusions: block specific employers or industries.',
    'Level hierarchy: define seniority levels and their keywords for automatic job ranking.',
  ]},
  pipeline: { title: 'Pipeline', steps: [
    'Track every job from saved through offer/rejection.',
    'Click stage headers to collapse/expand sections.',
    'Use the Move dropdown on any row to advance jobs through stages.',
    'Stats at top show response rates and days-to-response.',
    'Filter by saved search using the dropdown above the stages.',
  ]},
  resumes: { title: 'Resumes', steps: [
    'Upload a resume for each role type or seniority level you target.',
    'Assign a level (Director, Manager, etc.) to each resume.',
    'Click filter pills on each card to assign resumes to your saved searches.',
    'When you apply, the matching resume is automatically selected.',
    'Keyword extraction shows how well each resume matches job descriptions.',
  ]},
  applications: { title: 'Applications', steps: [
    'Queue tab: manage pending applications (manual add, batch process).',
    'Rules tab: set default application mode (Manual, Notify, Auto) and auto-apply rules.',
    'Notifications tab: configure email/SMS preferences for every alert type.',
    'Verify your phone to unlock SMS notifications and escalation.',
    'Set escalation rules: unanswered emails auto-escalate to SMS after your timeout.',
    'Override notification settings per saved search for targeted control.',
    'History tab: full audit trail of applications and notification delivery log.',
  ]},
  stats: { title: 'Stats', steps: [
    'View aggregated analytics across all your job search activity.',
    'Track application volume, response rates, and pipeline velocity.',
    'Compare performance across different filters and resume versions.',
  ]},
  'get-started': { title: 'Setup', steps: [
    'Connect the Chrome extension to scan your LinkedIn network.',
    'Your connections are matched against our job database.',
    'Jobs where you have an inside contact are flagged for priority.',
  ]},
  settings: { title: 'Settings', steps: [
    'Manage your account, notification preferences, and data.',
    'Export or delete your data at any time.',
  ]},
  subscription: { title: 'Subscription', steps: [
    'View your current plan and usage.',
    'Upgrade to Pro for auto-apply, advanced analytics, and more.',
  ]},
  notifications: { title: 'Notification Center', steps: [
    'Preferences tab: toggle email and SMS per notification type.',
    'Verify your phone number to enable SMS alerts.',
    'Log tab: view delivery history for all notifications.',
  ]},
  'interview-prep': { title: 'Interview Prep', steps: [
    'Browse the question bank by category.',
    'Practice mode lets you record and review your answers.',
    'AI scoring gives feedback on structure and content.',
  ]},
};

interface HelpPanelProps {
  helpId: string | null;
  onClose: () => void;
}

export function HelpPanel({ helpId, onClose }: HelpPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!helpId) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    // Delay to avoid the click that opened it
    const timer = setTimeout(() => document.addEventListener('click', handleClick), 50);
    return () => { clearTimeout(timer); document.removeEventListener('click', handleClick); };
  }, [helpId, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!helpId) return;
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [helpId, onClose]);

  if (!helpId) return null;
  const content = helpContent[helpId];
  if (!content) return null;

  return (
    <div
      ref={panelRef}
      className="fixed z-[9998] overflow-y-auto"
      style={{
        bottom: 80, right: 24, width: 340, maxHeight: '60vh',
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.25)', padding: 20,
      }}
    >
      <div className="flex justify-between items-center mb-3">
        <div className="text-[14px] font-bold text-text">{content.title}</div>
        <button
          onClick={onClose}
          className="text-text-faint hover:text-text transition-colors p-0.5"
          aria-label="Close help panel"
        >
          <X className="w-4 h-4" strokeWidth={1.75} />
        </button>
      </div>
      <div className="space-y-2.5">
        {content.steps.map((step, i) => (
          <div key={i} className="flex gap-2.5 items-start">
            <span
              className="w-5 h-5 rounded-full bg-accent text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0"
            >
              {i + 1}
            </span>
            <span className="text-[12px] text-text-dim leading-[1.7]">{step}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default HelpPanel;
