/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          50: '#f5f7fb',
          100: '#e6eaf2',
          200: '#d0d7e3',
          300: '#b9c1d1',
          400: '#9aa3b8', // secondary text — clearly readable on dark
          500: '#80899e', // dim/hint text — was #36405c (nearly invisible)
          600: '#252d42', // borders / dividers (kept dark on purpose)
          700: '#1a2030',
          800: '#11151f',
          900: '#0b0e14'
        },
        accent: {
          DEFAULT: '#5eead4',
          soft: '#2dd4bf'
        }
      }
    }
  },
  plugins: []
}
