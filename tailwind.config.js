/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
      },
      colors: {
        otto: {
          brand: '#7dd3fc',
          night: '#050a12',
          card: '#ffffff',
        },
      },
      boxShadow: {
        'otto-fab': '0 0 0 1px rgba(125, 211, 252, 0.35), 0 0 48px rgba(34, 211, 238, 0.55), 0 12px 40px rgba(15, 23, 42, 0.45)',
      },
    },
  },
  plugins: [],
};
