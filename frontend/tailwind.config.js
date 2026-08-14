/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist Variable', 'Geist', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        base: {
          DEFAULT: 'var(--bg-base)',
        },
        surface: {
          DEFAULT: 'var(--bg-surface)',
        },
        raised: {
          DEFAULT: 'var(--bg-raised)',
        },
        inset: {
          DEFAULT: 'var(--bg-inset)',
        },
        'surface-hover': 'var(--bg-hover)',
        'surface-active': 'var(--bg-active)',
        border: {
          DEFAULT: 'var(--border-default)',
          subtle: 'var(--border-subtle)',
          strong: 'var(--border-strong)',
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          tertiary: 'var(--text-tertiary)',
          muted: 'var(--text-muted)',
        },
        accent: {
          cyan: 'var(--accent-cyan)',
          'cyan-dim': 'var(--accent-cyan-dim)',
          green: 'var(--accent-green)',
          'green-dim': 'var(--accent-green-dim)',
          amber: 'var(--accent-amber)',
          'amber-dim': 'var(--accent-amber-dim)',
          red: 'var(--accent-red)',
          'red-dim': 'var(--accent-red-dim)',
        },
        wiki: {
          entity: 'var(--wiki-entity)',
          concept: 'var(--wiki-concept)',
          synthesis: 'var(--wiki-synthesis)',
        },
      },
      fontSize: {
        'hero': ['2rem', { lineHeight: '1.15', letterSpacing: '-0.02em', fontWeight: '700' }],
        'title': ['1.5rem', { lineHeight: '1.25', letterSpacing: '-0.015em', fontWeight: '600' }],
        'subtitle': ['1.125rem', { lineHeight: '1.35', letterSpacing: '-0.01em', fontWeight: '500' }],
        'body': ['0.875rem', { lineHeight: '1.5', fontWeight: '400' }],
        'small': ['0.8125rem', { lineHeight: '1.45', fontWeight: '400' }],
        'xs': ['0.75rem', { lineHeight: '1.4', letterSpacing: '0.01em', fontWeight: '500' }],
        'mono-sm': ['0.8125rem', { lineHeight: '1.5', fontWeight: '400' }],
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
      },
      borderRadius: {
        'sm': '4px',
        'DEFAULT': '6px',
        'md': '6px',
        'lg': '8px',
      },
      transitionDuration: {
        '50': '50ms',
        '100': '100ms',
        '150': '150ms',
        '200': '200ms',
      },
    },
  },
  plugins: [],
}
