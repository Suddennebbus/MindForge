/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist Variable', 'Geist', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        base: '#f6f0e3',
        surface: '#eee6d3',
        raised: '#e6dcc5',
        inset: '#f1eadc',
        line: '#e0d5bd',
        'line-strong': '#d1c4a4',
        text: {
          primary: '#1a1a1a',
          secondary: '#44403c',
          tertiary: '#6b6560',
          muted: '#8a847c',
        },
        accent: {
          DEFAULT: '#0d9488',
          dim: '#0f766e',
        },
      },
      borderRadius: {
        sm: '6px',
        DEFAULT: '8px',
        lg: '10px',
      },
      maxWidth: {
        page: '1200px',
      },
    },
  },
  plugins: [],
}
