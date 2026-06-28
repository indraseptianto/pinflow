/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        pin: { red: '#E60023', dark: '#111', muted: '#767676' },
      },
    },
  },
  plugins: [],
}
