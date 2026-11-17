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
      // The awards images; every other /users/ path is the SPA's. Copied from
      // parseImageFile in backend/src/lib/awardsImage.ts, which is authoritative.
      // Tested against the URL with its query, which the og:image carries.
      "^/users/[^/]+/awards/\\d{4}(-wide)?\\.png(\\?|$)":
        "http://localhost:4000",
    },
  },
});
