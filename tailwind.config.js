/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./App.tsx", "./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        bg: "#0B0B12",
        surface: "#15151F",
        accent: "#A78BFA",
        muted: "#6B7280",
      },
    },
  },
  plugins: [],
};
