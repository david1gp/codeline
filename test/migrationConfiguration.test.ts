import { expect, test } from "bun:test"

type CommandResult = {
  exitCode: number
  stderr: string
  stdout: string
}

async function migrationConfigurationRun(organizationId?: string): Promise<CommandResult> {
  const environment = {
    DATABASE_URL: "postgres://codeline:local@127.0.0.1:6002/codeline",
    ...(organizationId === undefined ? {} : { ZITADEL_ORGANIZATION_ID: organizationId }),
  }
  const child = Bun.spawn(
    [
      process.execPath,
      "--no-env-file",
      "-e",
      'const config = await import("./drizzle.config.ts"); process.stdout.write(config.default.dbCredentials.url)',
    ],
    { cwd: process.cwd(), env: environment, stderr: "pipe", stdout: "pipe" },
  )
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  return { exitCode, stderr, stdout }
}

test("runtime migration configuration rejects a missing organization ID", async () => {
  const result = await migrationConfigurationRun()

  expect(result.exitCode).not.toBe(0)
  expect(`${result.stdout}\n${result.stderr}`).toContain("ZITADEL_ORGANIZATION_ID")
})

test("runtime migration configuration rejects an empty organization ID", async () => {
  const result = await migrationConfigurationRun("  ")

  expect(result.exitCode).not.toBe(0)
  expect(`${result.stdout}\n${result.stderr}`).toContain("ZITADEL_ORGANIZATION_ID")
})

test("runtime migration configuration passes a valid organization ID to PostgreSQL", async () => {
  const result = await migrationConfigurationRun("configured-contentoren-organization")

  expect(result.exitCode).toBe(0)
  const databaseUrl = new URL(result.stdout)
  expect(databaseUrl.searchParams.get("options")).toBe(
    "-c codeline.organization_external_id=configured-contentoren-organization",
  )
})
