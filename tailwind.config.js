/** @type {import('tailwindcss').Config} */

/*──────────────────────────────────────────────────────────
  Brilliant Jobs — Tailwind Config
  Maps existing CSS variables to Tailwind design tokens.
  HSL-based color system for computed dim/glow variants.
──────────────────────────────────────────────────────────*/

module.exports = {
  safelist: [
    /* SPA-CUT-FINAL: Reduced from 7 regex patterns to minimal.
       SPA uses Tailwind utilities directly — no safelist needed for React.
       Keep u- prefix (utility classes in legacy CSS) and bg-indigo-dim. */
    { pattern: /^u-/ },
    'bg-indigo-dim', 'hidden',
  ],
  content: [
    './*.html',
    './src/app/**/*.tsx',
    './src/app/**/*.ts',
  ],
  theme: {
    fontFamily: {
      sans: ["'Outfit'", '-apple-system', 'sans-serif'],
      mono: ["'JetBrains Mono'", 'monospace'],
    },

    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      white: '#ffffff',
      black: '#000000',

      bg: {
        main:  'var(--bg-main)',
        white: 'var(--bg-white)',
        card:  'var(--bg-card)',
        input: 'var(--bg-input)',
        hover: 'var(--bg-hover)',
      },

      border: {
        DEFAULT: 'var(--border)',
        hover:   'var(--border-hover)',
      },

      text: {
        DEFAULT: 'var(--text)',
        dim:     'var(--text-dim)',
        faint:   'var(--text-faint)',
      },

      accent: {
        DEFAULT: 'var(--accent)',
        hover:   'var(--accent-hover)',
        glow:    'var(--accent-glow)',
        dim:     'hsla(var(--accent-hsl), 0.08)',
      },

      green: {
        DEFAULT: 'var(--green)',
        dim:     'var(--green-dim)',
      },

      warm: {
        DEFAULT: 'var(--warm)',
        dim:     'var(--warm-dim)',
      },

      red: {
        DEFAULT: 'var(--red)',
        dim:     'var(--red-dim)',
      },

      purple: {
        DEFAULT: 'var(--purple)',
        dim:     'var(--purple-dim)',
      },

      pink: {
        DEFAULT: 'var(--pink)',
        dim:     'var(--pink-dim)',
      },

      indigo: {
        DEFAULT: 'var(--indigo)',
        dim:     'var(--indigo-dim)',
      },

      nav: {
        bg:           'var(--nav-bg)',
        hover:        'var(--nav-bg-hover)',
        active:       'var(--nav-bg-active)',
        text:         'hsl(0 0% 100% / 0.65)',
        'text-active':'hsl(0 0% 100%)',
      },

      greenhouse: { bg: '#dcfce7', text: '#166534' },
      lever:      { bg: '#ede9fe', text: '#5b21b6' },
      workday:    { bg: '#ccfbf1', text: '#115e59' },
      linkedin:   { bg: '#dbeafe', text: '#1e40af' },
      indeed:     { bg: '#fef3c7', text: '#92400e' },
      ashby:      { bg: '#fce7f3', text: '#9d174d' },
      career:     { bg: '#e5e7eb', text: '#374151' },
    },

    extend: {
      spacing: {
        'nav': '240px',
        'nav-sm': '60px',
      },

      borderRadius: {
        sm:  '4px',
        md:  '8px',
        lg:  '12px',
      },

      fontSize: {
        'fluid-page':  ['clamp(1.125rem, 1rem + 0.5vw, 1.375rem)',  { lineHeight: '1.3' }],
        'fluid-stat':  ['clamp(1.375rem, 1.25rem + 0.75vw, 1.75rem)', { lineHeight: '1.2', letterSpacing: '-0.025em' }],
        'fluid-body':  ['clamp(0.75rem, 0.7rem + 0.15vw, 0.8125rem)',  { lineHeight: '1.5' }],
      },

      keyframes: {
        sparkPop: {
          '0%':   { opacity: '0', transform: 'scale(0)' },
          '30%':  { opacity: '1', transform: 'scale(1.8)' },
          '60%':  { opacity: '0.8', transform: 'scale(1)' },
          '100%': { opacity: '0', transform: 'scale(0.3)' },
        },
        starPop: {
          '0%':   { opacity: '0', transform: 'scale(0) rotate(0deg)' },
          '25%':  { opacity: '1', transform: 'scale(1.3) rotate(15deg)' },
          '50%':  { opacity: '0.9', transform: 'scale(1) rotate(-5deg)' },
          '100%': { opacity: '0', transform: 'scale(0.2) rotate(30deg)' },
        },
        shimmerSweep: {
          '0%':   { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
        tabIconPop: {
          '0%':   { transform: 'scale(1.3)' },
          '50%':  { transform: 'scale(0.95)' },
          '100%': { transform: 'scale(1)' },
        },
        pillIn: {
          from: { opacity: '0', transform: 'scale(0.9)' },
          to:   { opacity: '1', transform: 'scale(1)' },
        },
        modalFadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        modalSlideUp: {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        spin: {
          to: { transform: 'rotate(360deg)' },
        },
        newBadgePulse: {
          '0%':   { opacity: '0', transform: 'scale(0.8)' },
          '30%':  { opacity: '1', transform: 'scale(1.05)' },
          '100%': { transform: 'scale(1)' },
        },
        navPulse: {
          '0%, 100%': { boxShadow: '0 0 0 0 hsl(220 100% 62% / 0.4)' },
          '50%':      { boxShadow: '0 0 0 6px hsl(220 100% 62% / 0)' },
        },
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
      },

      animation: {
        'spark-pop':     'sparkPop 0.6s ease-out forwards',
        'star-pop':      'starPop 0.8s ease-out forwards',
        'shimmer-sweep': 'shimmerSweep 1.2s 0.2s ease-in-out forwards',
        'tab-icon-pop':  'tabIconPop 0.4s ease-out',
        'pill-in':       'pillIn 0.15s ease',
        'modal-fade':    'modalFadeIn 0.15s ease-out',
        'modal-slide':   'modalSlideUp 0.2s ease-out',
        'spin':          'spin 0.8s linear infinite',
        'spin-fast':     'spin 0.7s linear infinite',
        'new-badge':     'newBadgePulse 2s ease-in-out',
        'nav-pulse':     'navPulse 2s ease-in-out infinite',
        'fade-in':       'fadeIn 0.25s ease forwards',
      },
    },
  },
  plugins: [],
};
