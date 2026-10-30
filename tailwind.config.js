/** @type {import('tailwindcss').Config} */
export default {
  // Keep full class tokens in source, including conditional UI states.
  // The application uses the same default v3 theme as the former Play CDN.
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
};
