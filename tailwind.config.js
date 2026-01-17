/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/client/**/*.{js,ts,jsx,tsx,html}'],
  theme: {
    extend: {
      colors: {
        lark: {
          primary: '#3370FF',
          secondary: '#00D6B9',
          dark: '#1F2329',
          light: '#F5F6F7',
        },
      },
    },
  },
  plugins: [],
};
