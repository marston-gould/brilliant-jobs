// ============================================================
// Brilliant Jobs — Design Tokens (SA-013)
// ============================================================
// Single source of truth for all design primitives.
// These map to CSS custom properties defined in src/input.css.
// Components consume tokens via Tailwind utilities — never raw values.
//
// MIGRATION RULE: Every page migration must use these tokens.
// Zero hardcoded colors, zero inline styles, zero raw px values.
// ============================================================

/**
 * Spacing scale — 4px base unit.
 * Usage: Tailwind utilities (p-1 = 4px, p-2 = 8px, etc.)
 * Custom values defined as CSS custom properties.
 */
export const spacing = {
  0: '0px',
  px: '1px',
  0.5: '2px',
  1: '4px',
  1.5: '6px',
  2: '8px',
  2.5: '10px',
  3: '12px',
  3.5: '14px',
  4: '16px',
  5: '20px',
  6: '24px',
  7: '28px',
  8: '32px',
  10: '40px',
  12: '48px',
  16: '64px',
  20: '80px',
  24: '96px',
} as const;

/**
 * Type scale — maps to Tailwind text-* utilities.
 * Fluid variants use clamp() for responsive sizing.
 */
export const typeScale = {
  xs: { size: '0.75rem', lineHeight: '1rem' },       // 12px
  sm: { size: '0.8125rem', lineHeight: '1.25rem' },   // 13px
  base: { size: '0.875rem', lineHeight: '1.5rem' },   // 14px
  lg: { size: '1rem', lineHeight: '1.5rem' },          // 16px
  xl: { size: '1.125rem', lineHeight: '1.75rem' },     // 18px
  '2xl': { size: '1.375rem', lineHeight: '1.875rem' }, // 22px
  '3xl': { size: '1.75rem', lineHeight: '2.25rem' },   // 28px
  // Fluid variants (from existing tailwind.config.js)
  'fluid-page': 'clamp(1.125rem, 1rem + 0.5vw, 1.375rem)',
  'fluid-stat': 'clamp(1.375rem, 1.25rem + 0.75vw, 1.75rem)',
  'fluid-body': 'clamp(0.75rem, 0.7rem + 0.15vw, 0.8125rem)',
} as const;

/**
 * Shadow system — elevation levels for depth hierarchy.
 */
export const shadows = {
  none: 'none',
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  base: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
  modal: '0 8px 32px rgba(0, 0, 0, 0.12)',
  dropdown: '0 4px 16px rgba(0, 0, 0, 0.08)',
} as const;

/**
 * Border radii — consistent rounding across all components.
 */
export const radii = {
  none: '0px',
  sm: '4px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  full: '9999px',
} as const;

/**
 * Transitions — standard durations and easings.
 */
export const transitions = {
  fast: '0.1s ease',
  base: '0.15s ease',
  normal: '0.2s ease',
  slow: '0.3s ease-out',
} as const;

/**
 * Z-index scale — predictable layering.
 */
export const zIndex = {
  base: 0,
  dropdown: 10,
  sticky: 20,
  overlay: 30,
  modal: 40,
  toast: 50,
  tooltip: 60,
} as const;

/**
 * Color semantic tokens — reference CSS custom properties.
 * These match the HSL system defined in src/input.css :root block.
 *
 * Usage: Tailwind classes (bg-bg-main, text-text, border-border, etc.)
 * Do NOT use hex/rgb values in components. Ever.
 */
export const colors = {
  bg: {
    main: 'var(--bg-main)',
    white: 'var(--bg-white)',
    card: 'var(--bg-card)',
    input: 'var(--bg-input)',
    hover: 'var(--bg-hover)',
  },
  text: {
    default: 'var(--text)',
    dim: 'var(--text-dim)',
    faint: 'var(--text-faint)',
  },
  border: {
    default: 'var(--border)',
    hover: 'var(--border-hover)',
  },
  accent: {
    default: 'var(--accent)',
    hover: 'var(--accent-hover)',
    glow: 'var(--accent-glow)',
    dim: 'var(--accent-dim)',
  },
  semantic: {
    success: 'var(--green)',
    warning: 'var(--warm)',
    error: 'var(--red)',
    info: 'var(--accent)',
  },
} as const;
