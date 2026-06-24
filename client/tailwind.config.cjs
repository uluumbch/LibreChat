/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'Inter'", 'system-ui', 'sans-serif'],
        mono: ["'JetBrains Mono'", 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        brand: {
          DEFAULT: '#6366f1',
          dark: '#4f46e5',
        },
        ink: {
          DEFAULT: '#18181b',
          soft: '#3f3f46',
          muted: '#71717a',
          faint: '#a1a1aa',
        },
        surface: {
          DEFAULT: '#ffffff',
          sidebar: '#f6f6f7',
          input: '#f4f5f6',
          bubble: '#f0f0f3',
        },
      },
      boxShadow: {
        brand: '0 4px 14px rgba(99,102,241,0.3)',
        'brand-lg': '0 6px 18px rgba(99,102,241,0.35)',
      },
      keyframes: {
        'hm-fade': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'hm-slidein': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'hm-blink': { '0%,49%': { opacity: '1' }, '50%,100%': { opacity: '0' } },
        'hm-pulse': { '0%,100%': { opacity: '0.45' }, '50%': { opacity: '0.9' } },
      },
      animation: {
        'hm-fade': 'hm-fade .2s ease both',
        'hm-slidein': 'hm-slidein .35s ease both',
        'hm-blink': 'hm-blink 1s step-end infinite',
        'hm-pulse': 'hm-pulse 1.2s infinite',
      },
    },
  },
  plugins: [],
};
