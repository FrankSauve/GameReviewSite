import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // The app calls same-origin GraphQL paths in every environment; in dev
    // there is no reverse proxy, so vite forwards both to the local API.
    proxy: {
      "/graphql": "http://localhost:4000",
      "/graphql-auth": "http://localhost:4000",
    },
  },
});
