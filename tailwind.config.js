/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "node_modules/daisyui/dist/**/*.js",
    "node_modules/react-daisyui/dist/**/*.js",
  ],
  theme: {
    extend: {},
  },
  plugins: [require("daisyui")],
  daisyui: {
    // Custom theme objects first, then the daisyUI built-in names. The
    // `suorcd` theme is an object; the rest are names.
    themes: [
      ...require("./src/app/themes").customThemes,
      ...require("./src/app/themes").themes,
    ],
  },
};
