import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    port: parseInt(process.env.VITE_DEV_SERVER_PORT || "5173"),
    strictPort: true,
  },
});

