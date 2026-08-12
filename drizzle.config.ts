import { defineConfig } from "drizzle-kit"

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/database/schema/*.ts",
  out: "./src/database/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://codeline:codeline@127.0.0.1:5432/codeline",
  },
})
