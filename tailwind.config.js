/** @type {import('tailwindcss').Config} */

/*──────────────────────────────────────────────────────────
  Brilliant Jobs — Tailwind Config
  Maps existing CSS variables to Tailwind design tokens.
  HSL-based color system for computed dim/glow variants.
──────────────────────────────────────────────────────────*/

module.exports = {
  safelist: [
    /* CS-P1-009 (CSS-003): Consolidated from 14 patterns to 7.
       Critical fix: patterns now require alpha char after dash to avoid
       matching Tailwind's built-in utilities (e.g. pl-4, sub-1, etc.)
       that inflated CSS by ~30KB. */
    { pattern: /^(page|nav-(?!w)|card|stat-(?!ic)|btn|fb-|rw-|cb-|ghost|admin|filter|jobs|micro|resume|app-|main-|badge|level|match-|mode|show|tab-|source|pay|top-co|job-|save|saved)/ },
    { pattern: /^(ai-|nri-|qb-|sf-|pl-[a-z]|rc-|gs-|ns-|ec-[a-z]|jt-|rp-[a-z]|st\d|ext-|type-|hs-|sg-|pa-[a-z]|rr-|fas-)/ },
    { pattern: /^(tuning-|setup-|notif-|credit-|seo-|sort-|pill-|poor-match-|sub-[a-z]|hide-|install-|feed-|hero-|intel-)/ },
    { pattern: /^(location-|company-|salary-|escalation-|suggestion-|or-[a-z]|not-[a-z]|no-[a-z]|collection-|preview-|download-|empty-state)/ },
    { pattern: /^(query-builder|readiness-|phone-|otp-|notify-|feedback-|loading|spinner|toggle-|sparkle|override-|instance-|freq-|tz-|when-|who-|auth-|browse-|step-[a-z]|quiet-|coll-|pending-apps)/ },
    { pattern: /^(high|mid|low|none|on|off|open|selected|collapsed|connected|stale|pulse|sorted|excluded|included|compact|disabled|active|inactive|amber|bug|danger|dim|doc|down|dragover|email|empty|full|green|mark|pdf|red|skip|sms|tall|up|wait|warning|new-resume-item|is-placeholder|css|woff2|chip-count|s[1-8]|esc-)$/ },
    { pattern: /^(u-|bg-indigo-dim)/ },
  ],
  content: [
    './dashboard.html',
    './admin.html',
    './js/**/*.js',
    './js/**/*.ts',
    './src/app/**/*.tsx',
    './src/app/**/*.ts',
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
