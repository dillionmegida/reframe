/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}', './index.html'],
  theme: {
    extend: {
      colors: {
        bg: '#0e0e0e',
        panel: '#161616',
        border: '#2a2a2a',
        accent: '#f97316',
        trim: '#3b82f6',
        'text-primary': '#e5e5e5',
        'text-muted': '#6b7280',
      },
      fontFamily: {
        mono: ['"IBM Plex Mono"', 'monospace'],
        sans: ['"Inter"', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
