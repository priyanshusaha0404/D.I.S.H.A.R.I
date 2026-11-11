import type { Config } from "tailwindcss";

// Colours are CSS variables (see src/app/globals.css) so light and dark themes share one token set.
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      screens: { wide: "1440px" },
      colors: {
        forest: v("forest"), teal: v("teal"), mangrove: v("mangrove"), water: v("water"), ivory: v("ivory"),
        earth: v("earth"), warn: v("warn"), risk: v("risk"), ok: v("ok"),
        surface: v("surface"), raised: v("raised"), sunken: v("sunken"), line: v("line"),
        ink: v("ink"), muted: v("muted"), faint: v("faint"), accent: v("accent"), "on-accent": v("on-accent"),
      },
      fontFamily: {
        sans: ["'Plus Jakarta Sans Variable'", "'Noto Sans Bengali'", "system-ui", "sans-serif"],
        bn: ["'Noto Sans Bengali'", "'Inter Variable'", "sans-serif"],
      },
      boxShadow: {
        float: "0 1px 2px rgb(0 0 0 / 0.06), 0 6px 20px -4px rgb(0 0 0 / 0.14)",
        panel: "0 2px 6px rgb(0 0 0 / 0.06), 0 18px 40px -12px rgb(0 0 0 / 0.22)",
      },
      borderRadius: { xl: "14px", "2xl": "18px" },
      fontSize: { "2xs": ["0.6875rem", "1rem"] },
      transitionTimingFunction: { soft: "cubic-bezier(.2,.8,.2,1)" },
    },
  },
  plugins: [],
};
export default config;
