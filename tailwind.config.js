/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        tasi: {
          green: '#00C853',
          red: '#FF1744',
          gold: '#FFD600',
          dark: '#0A0E17',
          card: '#111827',
          border: '#1F2937',
        },
      },
      fontFamily: {
        arabic: ['Noto Sans Arabic', 'Tahoma', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
