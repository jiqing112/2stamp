import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import path from "node:path";

// 部署到 GitHub Pages 等子路径时，设 VITE_BASE=/2stamp/（CI 里自动设置）
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE || "/",
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  build: {
    chunkSizeWarningLimit: 4000,
  },
});
