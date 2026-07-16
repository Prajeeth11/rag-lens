/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#faf6f0', // warm off-white page
          raised: '#ffffff', // cards
          overlay: '#f1e8db', // beige inputs / chips
        },
        line: '#e4d6c3', // sand borders
        accent: {
          DEFAULT: '#b3603f', // clay
          soft: '#96482b', // deep clay (hover / link text)
        },
        ink: {
          DEFAULT: '#3d3327', // primary text
          soft: '#6c5d4c', // secondary text
          faint: '#857463', // muted text
        },
      },
    },
  },
  plugins: [],
}
