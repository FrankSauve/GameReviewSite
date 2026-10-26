import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Not env(): that throws when the variable is unset, and the image runs
  // `prisma generate` at build time with no database to point at.
  datasource: { url: process.env["DATABASE_URL"] ?? "" },
});
