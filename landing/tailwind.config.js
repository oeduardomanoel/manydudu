/** @type {import('tailwindcss').Config} */
export default {
  content: ["./landing/index.html", "./landing/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: "#F4EFE7",
        paper: "#FAF8F4",
        sand: "#E8DFD3",
        terra: { DEFAULT: "#C96442", light: "#DA8060", dark: "#984A32" },
        ink: "#1D1D1B",
        graphite: "#494742",
        muted: "#767169",
        confirm: "#3F7258",
      },
      fontFamily: {
        display: ["Newsreader", "Georgia", "serif"],
        sans: ["Manrope", "sans-serif"],
      },
      boxShadow: { paper: "0 18px 50px rgba(29,29,27,.08)" },
    },
  },
  plugins: [],
};
