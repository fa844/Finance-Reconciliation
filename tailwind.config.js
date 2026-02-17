/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        inter: ['Inter', 'sans-serif'],
      },
      colors: {
        'zuzu-orange': {
          50: '#FFF5F0',
          100: '#FFEBE0',
          200: '#FFD4BF',
          300: '#FFBD9E',
          400: '#FF8C5A',
          500: '#FF6B35',
          600: '#E55A2B',
          700: '#CC4A1F',
          800: '#B33B14',
          900: '#992C0A',
        },
      },
    },
  },
  plugins: [],
}
