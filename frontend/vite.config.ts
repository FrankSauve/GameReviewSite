import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // The app calls a same-origin /graphql in every environment; in dev there
    // is no reverse proxy, so vite forwards it to the local API.
    proxy: {
      "/graphql": "http://localhost:4000",
    },
  },
});
