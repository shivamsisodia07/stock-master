import { defineConfig, loadEnv } from "vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const API_BASE_URL = env.VITE_API_BASE_URL || (mode === "production" ? "" : "http://127.0.0.1:8000");
  const API_PROXY_TARGET = env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
  console.log("API_BASE_URL:", API_BASE_URL);
  return {
    define: {
      "import.meta.env.VITE_API_BASE_URL": JSON.stringify(API_BASE_URL),
    },
    plugins: [react(), tailwindcss()],
    build: {
      outDir: "../backend/static",
      emptyOutDir: true,
    },
    server: {
      proxy: {
        "/api": { target: API_PROXY_TARGET, changeOrigin: true }
      }
    }
  }
});
