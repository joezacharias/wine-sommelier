/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        wine: {
          50:  '#fdf2f4',
          100: '#fce7eb',
          200: '#f9d0da',
          300: '#f4a8bb',
          400: '#ec7396',
          500: '#e04575',
          600: '#cc2758',
          700: '#ac1b47',
          800: '#8f1940',
          900: '#7a183c',
          950: '#430819',
        },
        gold: {
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
        }
      },
    },
  },
  plugins: [],
};
