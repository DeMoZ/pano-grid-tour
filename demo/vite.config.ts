import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Demo app: `npm run dev` (add `:host` to open it from a phone on the same network).
export default defineConfig({
  root: "demo",
  base: "./",
  plugins: [react()],
  build: { outDir: "../demo-dist", emptyOutDir: true },
});
