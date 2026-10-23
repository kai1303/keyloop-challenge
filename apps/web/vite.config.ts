import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  const apiOrigin = env.INVENTORY_API_ORIGIN || "http://127.0.0.1:3000";
  const bookingOrigin = env.BOOKINGS_API_ORIGIN || apiOrigin;
  return {
    plugins: [react(), tailwindcss()],
    test: {
      // Leave CPU capacity for API tests and builds running alongside jsdom.
      maxWorkers: 2,
    },
    server: {
      host: "127.0.0.1",
      proxy: {
        "/api": {
          target: apiOrigin,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
        "/booking-api": {
          target: bookingOrigin,
          rewrite: (path) => path.replace(/^\/booking-api/, ""),
        },
      },
    },
  };
});
