/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          orange: '#F97316',
          dark: '#0A0A0A',
          card: '#141414',
          border: '#2A2A2A'
        }
      }
    },
  },
  plugins: [],
}