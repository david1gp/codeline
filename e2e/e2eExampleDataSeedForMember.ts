import { execFile } from "node:child_process"
import { promisify } from "node:util"
import * as v from "valibot"
import { exampleDataFixture } from "../src/database/exampleDataFixture.js"
import { e2eFixtureContextResolve } from "./e2eFixtureContextResolve.js"
import { e2eFixtureRequest } from "./e2eFixtureRequest.js"
import { e2eRepositoryRoot } from "./e2eRepositoryRoot.js"

const execFileAsync = promisify(execFile)
const sampleSchema = v.object({
  exists: v.literal(true),
  userId: v.string(),
  mapping: v.record(v.string(), v.string()),
})

const sources = {
  server: exampleDataFixture.servers.map((item) => item.id),
  agent: exampleDataFixture.agents.map((item) => item.id),
  project: exampleDataFixture.projects.map((item) => item.id),
  folder: exampleDataFixture.projects.map((item) => item.folderKey),
  path: exampleDataFixture.projects.map((item) => item.path),
  session: exampleDataFixture.sessions.map((item) => item.id),
  sessionRequest: exampleDataFixture.sessions.map((item) => item.clientRequestId),
  message: exampleDataFixture.sessions.flatMap((item) => item.messages.map((message) => message.id)),
  messageRequest: exampleDataFixture.sessions.flatMap((item) =>
    item.messages.map((message) => message.clientRequestId),
  ),
  run: exampleDataFixture.runs.map((item) => item.id),
  runClient: exampleDataFixture.runs.map((item) => item.clientRunId),
  stream: [...new Set([...exampleDataFixture.runs, ...exampleDataFixture.attempts].map((item) => item.streamId))],
  attempt: exampleDataFixture.attempts.map((item) => item.id),
  delegation: exampleDataFixture.delegations.map((item) => item.id),
  tool: [
    ...exampleDataFixture.tools.map((item) => item.toolCallId),
    ...exampleDataFixture.delegations.map((item) => item.delegationKey),
  ],
} as const

export type E2eExampleDataMapping = Record<`${keyof typeof sources}:${string}`, string>

/** Clone run-owned samples through the API; only legacy local mode reassigns the shared seed. */
export async function e2eExampleDataSeedForMember(input: {
  subject: string
  userId: string
  runId: string
}): Promise<E2eExampleDataMapping> {
  const context = await e2eFixtureContextResolve()
  if (context !== undefined) {
    if (!context.checkpoint.resourceIds.fixtureRunIds.includes(input.runId))
      throw new Error("Unregistered E2E sample fixture run")
    const sample = await e2eFixtureRequest(
      context.origin,
      context.token,
      `/${input.runId}/sample-sessions`,
      sampleSchema,
      "POST",
    )
    if (sample.userId !== input.userId) throw new Error("E2E sample fixture owner mismatch")
    const keys = Object.entries(sources).flatMap(([kind, ids]) => ids.map((source) => `${kind}:${source}`))
    if (Object.keys(sample.mapping).length !== keys.length || keys.some((key) => !sample.mapping[key]))
      throw new Error("E2E sample fixture manifest is incomplete")
    return sample.mapping as E2eExampleDataMapping
  }
  // The empty roots value selects fixture-only seed mode for this legacy child process. It
  // does not configure the already-running managed API; project registration for
  // direct session creation goes through its API in e2eSessionCreate.
  const fixtureEnvironment = {
    ...process.env,
    CODELINE_PROJECT_ROOTS: "[]",
    EXAMPLE_DATA_SUBJECT: input.subject,
    EXAMPLE_DATA_USER_ID: input.userId,
  }
  await execFileAsync("bun", ["run", "db:seed"], {
    cwd: e2eRepositoryRoot,
    env: fixtureEnvironment,
  })
  return Object.fromEntries(
    Object.entries(sources).flatMap(([kind, ids]) => ids.map((source) => [`${kind}:${source}`, source])),
  ) as E2eExampleDataMapping
}

/** Restore shared data only after a legacy local run; runner teardown belongs to the fixture API. */
export async function e2eExampleDataSeedRestore(): Promise<void> {
  if ((await e2eFixtureContextResolve()) !== undefined) return
  await execFileAsync("bun", ["run", "db:seed"], { cwd: e2eRepositoryRoot })
}
