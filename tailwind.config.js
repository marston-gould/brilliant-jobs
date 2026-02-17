/** @type {import('tailwindcss').Config} */

/*──────────────────────────────────────────────────────────
  Brilliant Jobs — Tailwind Config
  Maps existing CSS variables to Tailwind design tokens.
  HSL-based color system for computed dim/glow variants.
──────────────────────────────────────────────────────────*/

module.exports = {
  content: [
    './dashboard.html',
    './js/**/*.js',
    './app.js',
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
        main:  'hsl(230 25% 97%)',
        white: 'hsl(0 0% 100%)',
        card:  'hsl(0 0% 100%)',
        input: 'hsl(228 14% 95%)',
        hover: 'hsl(228 20% 95%)',
      },

      border: {
        DEFAULT: 'hsl(230 16% 91%)',
        hover:   'hsl(230 14% 84%)',
      },

      text: {
        DEFAULT: 'hsl(230 28% 14%)',
        dim:     'hsl(230 12% 42%)',
        faint:   'hsl(228 10% 64%)',
      },

      accent: {
        DEFAULT: 'hsl(220 100% 62%)',
        hover:   'hsl(220 84% 55%)',
        glow:    'hsl(220 100% 62% / 0.10)',
        dim:     'hsl(220 100% 62% / 0.08)',
      },

      green: {
        DEFAULT: 'hsl(142 71% 45%)',
        dim:     'hsl(142 71% 45% / 0.10)',
      },

      warm: {
        DEFAULT: 'hsl(38 92% 50%)',
        dim:     'hsl(38 92% 50% / 0.10)',
      },

      red: {
        DEFAULT: 'hsl(0 84% 60%)',
        dim:     'hsl(0 84% 60% / 0.08)',
      },

      purple: {
        DEFAULT: 'hsl(258 90% 66%)',
        dim:     'hsl(258 90% 66% / 0.10)',
      },

      pink: {
        DEFAULT: 'hsl(330 81% 60%)',
        dim:     'hsl(330 81% 60% / 0.08)',
      },

      indigo: {
        DEFAULT: 'hsl(239 84% 67%)',
        dim:     'hsl(239 84% 67% / 0.08)',
      },

      nav: {
        bg:           'hsl(215 63% 27%)',
        hover:        'hsl(215 60% 34%)',
        active:       'hsl(0 0% 100% / 0.12)',
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
