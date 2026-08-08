/** @type {import('tailwindcss').Config} */
export default {
  content: ["./landing/index.html", "./landing/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: "#070707",
        paper: "#0C0C0C",
        sand: "#111111",
        terra: { DEFAULT: "#FF5A1F", light: "#FF8A45", dark: "#CC3A00" },
        ink: "#F4F4F0",
        graphite: "#B8B4AD",
        muted: "#817D76",
        confirm: "#63D391",
      },
      fontFamily: {
        display: ["Sora", "sans-serif"],
        sans: ["Manrope", "sans-serif"],
      },
      boxShadow: { paper: "0 18px 50px rgba(29,29,27,.08)" },
    },
  },
  plugins: [],
};
