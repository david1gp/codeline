import { defineConfig } from "drizzle-kit"
import * as v from "valibot"

const databaseUrl = v.safeParse(v.pipe(v.string(), v.url()), process.env.DATABASE_URL)
if (!databaseUrl.success) throw new Error("DATABASE_URL is required and must be a valid URL.")

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/database/schema/*.ts",
  out: "./src/database/migrations",
  dbCredentials: {
    url: databaseUrl.output,
  },
})
