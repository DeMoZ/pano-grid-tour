import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Library build: one ES module + one stylesheet; React and Photo Sphere Viewer stay
// dependencies of the host app.
export default defineConfig({
  plugins: [react()],
  build: {
    lib: { entry: "src/index.ts", formats: ["es"], fileName: () => "index.js", cssFileName: "style" },
    rollupOptions: {
      external: [/^react($|\/)/, /^react-dom($|\/)/, /^@photo-sphere-viewer\//, /^three($|\/)/],
      output: { banner: '"use client";' },
    },
    sourcemap: true,
  },
  test: { include: ["src/**/*.test.ts"] },
});
