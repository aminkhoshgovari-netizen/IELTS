import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In local development the API runs separately (npm run dev:api, port 8787) and is proxied here.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": { target: "http://localhost:8787", changeOrigin: true } } },
});
