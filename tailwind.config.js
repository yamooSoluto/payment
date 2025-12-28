/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
        },
        yamoo: {
          primary: '#ffbf03',
          secondary: '#e6ac00',
          accent: '#ffd54f',
          dark: '#b38600',  // 텍스트 링크용 진한 색상
        }
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
