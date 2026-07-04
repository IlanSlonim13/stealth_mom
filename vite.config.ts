import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // three.js alone is ~512 kB minified — that's the floor, not a smell
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ["three"],
          vendor: ["react", "react-dom", "zustand", "howler"],
        },
      },
    },
  },
  server: {
    host: true,
    port: 5173,
  },
});
