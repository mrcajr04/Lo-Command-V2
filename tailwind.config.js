/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: '#1A345A',     /* Primary brand header, left & right pane */
        gold: '#C9A02C',     /* Signature Accent */
        steel: '#2E5F8A',    /* Secondary theme color */
        teal: '#1A7A6E',     /* Success / positive highlights */
        green: '#1E7A3A',    /* Check marks and active states */
        amber: '#C97A1A',    /* Warning elements */
        softBlue1: '#EDF4FB',/* Center Main page background */
        softBlue2: '#D6E8F7',/* Borders and accents */
        lightGray: '#F5F8FC',/* Table rows and subtle backgrounds */
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
