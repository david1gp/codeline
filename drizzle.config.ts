import { defineConfig } from "drizzle-kit"
import { databaseUrl } from "./src/database/databaseUrl.js"

export default defineConfig({
  dialect: "sqlite",
  schema: [
    "./src/api/db/*Table.ts",
    "./src/identity/db/*Table.ts",
    "./src/servers/db/*Table.ts",
    "./src/agents/db/*Table.ts",
    "./src/session/db/*Table.ts",
    "./src/message/db/*Table.ts",
    "./src/note/db/*Table.ts",
    "./src/run/db/*Table.ts",
    "./src/stream/db/*Table.ts",
    "./src/journal/db/*Table.ts",
  ],
  out: "./src/database/migrations",
  dbCredentials: {
    url: databaseUrl,
  },
})
