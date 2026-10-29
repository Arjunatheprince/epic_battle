/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        cinzel: ['Cinzel', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        fantasy: {
          bg: '#0a080f',
          panel: '#14101de6',
          gold: '#d9b25f',
          goldLight: '#f6d88c',
          kingdom: '#3b82f6',
          monster: '#ef4444',
        }
      }
    },
  },
  plugins: [],
};
