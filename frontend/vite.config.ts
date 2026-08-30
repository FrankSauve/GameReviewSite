import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // The app calls same-origin paths in every environment; in dev there is no
    // reverse proxy, so vite forwards them to the local API. /auth is here so
    // the real OIDC flow can be exercised against `npm run dev` -- it needs the
    // SPA and API to look like one origin, which this provides.
    proxy: {
      "/graphql": "http://localhost:4000",
      "/auth": "http://localhost:4000",
      "/export": "http://localhost:4000",
    },
  },
});
