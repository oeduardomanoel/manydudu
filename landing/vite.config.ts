import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "landing",
  base: "/dm-propria/",
  plugins: [react()],
  build: {
    outDir: "../public/dm-propria",
    emptyOutDir: true,
    sourcemap: false,
  },
});
