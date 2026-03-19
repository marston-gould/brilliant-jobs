// ============================================================
// PageHeader — Sticky page header matching legacy .page-header
// ============================================================
// Legacy CSS: padding 28px 40px 20px, border-bottom, bg-white
// h2: clamp(18px, 1.8vw + .5rem, 22px), 700 weight
// p: 13px, text-dim
// Sticky at top of scroll area (position: sticky, top: 0, z-10)
// ============================================================

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  helpLink?: string;
  onHelp?: () => void;
  children?: React.ReactNode;
}

export function PageHeader({ title, subtitle, helpLink, onHelp, children }: PageHeaderProps) {
  return (
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
          {helpLink && onHelp && (
            <>
              {' '}
              <button
                type="button"
                onClick={onHelp}
                className="text-accent hover:underline"
              >
                How this works →
              </button>
            </>
          )}
        </p>
      )}
      {children}
    </div>
  );
}

export default PageHeader;
