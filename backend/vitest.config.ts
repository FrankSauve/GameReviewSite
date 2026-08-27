import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // The tests share one Postgres database, so they must not run concurrently.
    fileParallelism: false,
    // Each file gets a fresh module registry, which matters because the app
    // reads configuration from the environment when it is constructed.
    isolate: true,
    env: {
      NODE_ENV: "test",
      AUTH_PROXY_SECRET: "test-proxy-secret",
      // Must stay unset: it would make every request authenticate as one user.
      AUTH_DEV_IDENTITY: "",
      // High enough that the functional tests never trip it; the rate limit
      // test lowers it for itself.
      RATE_LIMIT_MAX: "100000",
      RAWG_RATE_LIMIT_MAX: "100000",
    },
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
