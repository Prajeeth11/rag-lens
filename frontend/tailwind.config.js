/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#0f1117',
          raised: '#161a23',
          overlay: '#1e2430',
        },
        line: '#2a3140',
        accent: {
          DEFAULT: '#6366f1',
          soft: '#818cf8',
        },
      },
    },
  },
  plugins: [],
}
