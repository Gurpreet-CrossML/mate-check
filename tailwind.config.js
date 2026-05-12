/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./App.tsx", "./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // MateCheck palette (sampled from brand art)
        bg: "#0E1A14",          // deep forest, the outdoor backdrop dimmed
        surface: "#16241C",     // slightly lighter card surface
        surfaceAlt: "#1E2F26",  // input rows, secondary cards
        brand: "#F5C518",       // MateCheck yellow (logo/script)
        accent: "#F5C518",      // primary CTAs
        secondary: "#2A66E0",   // MateCheck blue (shorts)
        text: "#F5F1E6",        // warm off-white
        muted: "#90A097",       // subdued sage gray
        bubble: "#243A2E",      // assistant bubble
      },
      fontFamily: {
        brand: ["System"],
      },
    },
  },
  plugins: [],
};
