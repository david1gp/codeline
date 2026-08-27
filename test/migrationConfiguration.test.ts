import { expect, test } from "bun:test"
import { databaseUrl } from "../src/database/databaseUrl.js"

type CommandResult = {
  exitCode: number
  stderr: string
  stdout: string
}

async function migrationConfigurationRun(): Promise<CommandResult> {
  const child = Bun.spawn(
    [
      process.execPath,
      "--no-env-file",
      "-e",
      'const config = await import("./drizzle.config.ts"); process.stdout.write(JSON.stringify({ dialect: config.default.dialect, schema: config.default.schema, out: config.default.out, url: config.default.dbCredentials.url }))',
    ],
    { cwd: process.cwd(), env: {}, stderr: "pipe", stdout: "pipe" },
  )
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  return { exitCode, stderr, stdout }
}

test("runtime migration configuration uses SQLite and an absolute file URL", async () => {
  const result = await migrationConfigurationRun()

  expect(result.exitCode).toBe(0)
  expect(JSON.parse(result.stdout)).toEqual({
    dialect: "sqlite",
    schema: [
      "./src/api/db/*Table.ts",
      "./src/identity/db/*Table.ts",
      "./src/servers/db/*Table.ts",
      "./src/agents/db/*Table.ts",
      "./src/session/db/*Table.ts",
      "./src/skills/db/*Table.ts",
      "./src/message/db/*Table.ts",
      "./src/note/db/*Table.ts",
      "./src/run/db/*Table.ts",
      "./src/journal/db/*Table.ts",
    ],
    out: "./src/database/migrations",
    url: databaseUrl,
  })
})
