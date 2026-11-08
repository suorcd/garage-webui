// https://daisyui.com/docs/themes/
//
// `suorcd` is a custom theme, not a daisyUI built-in. It carries the site
// palette from https://suorcd.us/style.css (`.cyberpunkNeon`): a very dark
// blue base, neon magenta and bright cyan. daisyUI's own `synthwave` reads
// pastel next to it, so do not substitute that theme for this one.

export const themes = [
  "suorcd",
  "pastel",
  "dark",
  "dracula",
  "cupcake",
  "dim",
  "night",
  "nord",
  "corporate",
  "valentine",
  "winter",
] as const;

export type Themes = (typeof themes)[number];

// daisyUI reads a theme object as CSS variables. Every named color needs a
// matching `-content` value: that is the text color drawn on top of it.
//
// Source colors, verbatim from suorcd.us:
//   base-100  #091833  --bg-color
//   base text #e3e8fc  --text-color
//   primary   #ea00d9  --accent-color
//   neutral   #133e7c  --code-bg
//   secondary #0abdc6  --border-color
//
// The remaining hues are the outrun family the site colors come from:
// accent #711c91, warning #f9c80e, error #fe4450.
export const customThemes = [
  {
    suorcd: {
      "color-scheme": "dark",
      primary: "#ea00d9",
      "primary-content": "#091833",
      secondary: "#0abdc6",
      "secondary-content": "#091833",
      accent: "#711c91",
      "accent-content": "#e3e8fc",
      neutral: "#133e7c",
      "neutral-content": "#e3e8fc",
      "base-100": "#091833",
      "base-200": "#07142b",
      "base-300": "#050f21",
      "base-content": "#e3e8fc",
      info: "#0abdc6",
      "info-content": "#091833",
      success: "#0ad6a1",
      "success-content": "#091833",
      warning: "#f9c80e",
      "warning-content": "#091833",
      error: "#fe4450",
      "error-content": "#091833",
    },
  },
];
