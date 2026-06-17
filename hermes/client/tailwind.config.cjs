/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#ffffff',
          muted: '#f5f5f7',
          dark: '#1a1a1d',
          'dark-muted': '#242428',
        },
      },
    },
  },
  plugins: [],
};
