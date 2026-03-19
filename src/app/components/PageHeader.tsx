// ============================================================
// PageHeader — Sticky page header matching legacy .page-header
// ============================================================
// Legacy CSS: padding 28px 40px 20px, border-bottom, bg-white
// h2: clamp(18px, 1.8vw + .5rem, 22px), 700 weight
// p: 13px, text-dim
// Sticky at top of scroll area (position: sticky, top: 0, z-10)
// "How this works →" opens the HelpPanel floating popup
// ============================================================

import { useState, useCallback } from 'react';
import { HelpPanel } from './HelpPanel';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  helpLink?: string;
  onHelp?: () => void;
  children?: React.ReactNode;
}

export function PageHeader({ title, subtitle, helpLink, children }: PageHeaderProps) {
  const [helpOpen, setHelpOpen] = useState(false);

  const toggleHelp = useCallback(() => {
    setHelpOpen(prev => !prev);
  }, []);

  const closeHelp = useCallback(() => {
    setHelpOpen(false);
  }, []);

  return (
    <>
      <div
        className="sticky top-0 z-10 border-b border-border -mx-10 mb-5"
        style={{
          padding: '28px 40px 20px',
          background: 'var(--bg-white, var(--bg-main))',
        }}
      >
        <h2
          className="font-bold text-text"
          style={{ fontSize: 'clamp(18px, 1.8vw + 0.5rem, 22px)', marginBottom: '2px' }}
        >
          {title}
        </h2>
        {subtitle && (
          <p className="text-[13px] text-text-dim">
            {subtitle}
            {helpLink && (
              <>
                {' '}
                <button
                  type="button"
                  onClick={toggleHelp}
                  className="text-accent hover:underline page-how-link"
                >
                  How this works →
                </button>
              </>
            )}
          </p>
        )}
        {children}
      </div>
      <HelpPanel helpId={helpOpen ? (helpLink || null) : null} onClose={closeHelp} />
    </>
  );
}

export default PageHeader;
