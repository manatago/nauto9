/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          900: '#0b0e14',
          800: '#11151f',
          700: '#1a2030',
          600: '#252d42',
          500: '#36405c'
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
