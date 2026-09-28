import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { cliBackendAcquire } from "../../src/cli/cliBackendAcquire.js"
import { cliLocalRuntimeCreate } from "../../src/cli/cliLocalRuntimeCreate.js"
import { uuidv7 } from "../../src/uuid/uuidv7.js"

test("local continuation ignores unrelated cwd but denies a persisted project removed from configured roots", async () => {
  const fixture = await mkdtemp("/tmp/opencode/codeline-cli-session-")
  const project = join(fixture, "project")
  const otherRoot = join(fixture, "other-root")
  const unrelated = join(fixture, "unrelated")
  await Promise.all([mkdir(project), mkdir(otherRoot), mkdir(unrelated)])
  const environment = {
    HOME: fixture,
    XDG_DATA_HOME: join(fixture, "data"),
    CODELINE_PROJECT_ROOTS: JSON.stringify([project]),
    CODEX_LB_API_TOKEN: "fixture-key",
  }
  let initial: Extract<Awaited<ReturnType<typeof cliLocalRuntimeCreate>>, { success: true }>["data"] | undefined
  let allowed: Extract<Awaited<ReturnType<typeof cliBackendAcquire>>, { success: true }>["data"] | undefined
  let denied: typeof allowed
  try {
    const created = await cliLocalRuntimeCreate({ cwd: project, environment })
    if (!created.success) throw new Error(created.errorMessage)
    initial = created.data
    expect(initial.target.agentId).toBeDefined()
    const response = await initial.fetch(
      new Request("http://local.invalid/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientRequestId: uuidv7(),
          primaryAgentId: initial.target.agentId,
          projectPath: project,
          serverId: initial.target.serverId,
          title: "Persisted local session",
        }),
      }),
    )
    expect(response.status).toBe(201)
    const body = (await response.json()) as { session: { id: string } }
    const sessionId = body.session.id
    expect((await initial.shutdown()).success).toBe(true)
    initial = undefined

    const continued = await cliBackendAcquire({
      options: { backend: "local", session: sessionId },
      context: { cwd: unrelated, env: environment },
    })
    if (!continued.success) throw new Error(continued.errorMessage)
    allowed = continued.data
    expect("projectPath" in allowed.runOptions && allowed.runOptions.projectPath).toBeFalsy()
    const admitted = await allowed.transport.chatSubmit(sessionId, {
      messages: [{ content: "/nonexistent-command", id: uuidv7(), role: "user" }],
      runId: uuidv7(),
      threadId: sessionId,
    })
    expect(admitted.success).toBe(false)
    if (!admitted.success) expect(admitted.statusCode).toBe(400)
    expect((await allowed.shutdown()).success).toBe(true)
    allowed = undefined

    const changedRoots = { ...environment, CODELINE_PROJECT_ROOTS: JSON.stringify([otherRoot]) }
    const reopened = await cliBackendAcquire({
      options: { backend: "local", session: sessionId },
      context: { cwd: unrelated, env: changedRoots },
    })
    if (!reopened.success) throw new Error(reopened.errorMessage)
    denied = reopened.data
    const blocked = await denied.transport.chatSubmit(sessionId, {
      messages: [{ content: "Run tools in the old project", id: uuidv7(), role: "user" }],
      runId: uuidv7(),
      threadId: sessionId,
    })
    expect(blocked.success).toBe(false)
    if (!blocked.success) expect(blocked.statusCode).toBe(404)
  } finally {
    if (denied) await denied.shutdown()
    if (allowed) await allowed.shutdown()
    if (initial) await initial.shutdown()
    await rm(fixture, { recursive: true, force: true })
  }
})
