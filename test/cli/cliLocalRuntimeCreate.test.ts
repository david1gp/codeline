import { expect, spyOn, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises"
import { join } from "node:path"
import { appCreate } from "../../src/app/appCreate.js"
import { cliLocalRuntimeCreate } from "../../src/cli/cliLocalRuntimeCreate.js"
import { providerRuntimeAdapterCreate } from "../../src/providers/runtime/providerRuntimeAdapterCreate.js"
import { runExecutionSnapshotResolve } from "../../src/run/actions/runExecutionSnapshotResolve.js"

test("local factory migrates private XDG SQLite and reuses identity, secret and catalog target without opening a listener", async () => {
  const fixture = await mkdtemp("/tmp/opencode/codeline-cli-local-")
  const project = join(fixture, "project")
  const dataHome = join(fixture, "data")
  const serve = spyOn(Bun, "serve").mockImplementation(() => {
    throw new Error("No listener allowed")
  })
  let first: Awaited<ReturnType<typeof cliLocalRuntimeCreate>> | undefined
  let second: Awaited<ReturnType<typeof cliLocalRuntimeCreate>> | undefined
  try {
    await mkdir(project)
    const environment = {
      HOME: fixture,
      XDG_DATA_HOME: dataHome,
      CODELINE_PROJECT_ROOTS: JSON.stringify([fixture]),
      CODEX_LB_API_TOKEN: "fixture-key",
    }
    first = await cliLocalRuntimeCreate({ cwd: project, environment })
    if (!first.success) throw new Error(first.errorMessage)
    expect(first.data.databasePath).toBe(join(dataHome, "codeline", "db.sqlite"))
    expect(first.data.projectPath).toBe(project)
    expect(first.data.projectRootDirs).toEqual([fixture])
    expect(first.data.identity).toEqual({ userId: "local:user", organizationId: "local:organization" })
    expect(first.data.target.agentId).toBeDefined()
    expect((await first.data.fetch(new Request("http://local.invalid/api/ready"))).status).toBe(200)
    expect((await first.data.fetch(new Request("http://local.invalid/api/servers"))).status).toBe(200)
    expect(
      (await first.data.fetch(new Request(`http://local.invalid/api/servers/${first.data.target.serverId}/agents`)))
        .status,
    ).toBe(200)
    expect(serve).not.toHaveBeenCalled()
    const secret = await readFile(join(dataHome, "codeline", "journal-secret"), "utf8")
    expect((await stat(join(dataHome, "codeline"))).mode & 0o777).toBe(0o700)
    expect((await stat(join(dataHome, "codeline", "configuration-store"))).mode & 0o777).toBe(0o700)
    expect((await stat(first.data.databasePath)).mode & 0o777).toBe(0o600)
    expect((await stat(join(dataHome, "codeline", "journal-secret"))).mode & 0o777).toBe(0o600)
    const concurrent = await cliLocalRuntimeCreate({ cwd: project, environment })
    expect(concurrent.success).toBe(false)
    if (!concurrent.success) expect(concurrent.errorMessage).toContain("already owns")
    expect((await first.data.shutdown()).success).toBe(true)
    second = await cliLocalRuntimeCreate({ cwd: project, environment })
    if (!second.success) throw new Error(second.errorMessage)
    expect(second.data.identity).toEqual(first.data.identity)
    expect(second.data.target).toEqual(first.data.target)
    expect(await readFile(join(dataHome, "codeline", "journal-secret"), "utf8")).toBe(secret)
    expect((await second.data.fetch(new Request("http://local.invalid/api/ready"))).status).toBe(200)
  } finally {
    if (second?.success) await second.data.shutdown()
    if (first?.success) await first.data.shutdown()
    serve.mockRestore()
    await rm(fixture, { recursive: true, force: true })
  }
})

test("a fresh isolated local runtime admits a catalog-backed chat with prompt and tools without provider network access", async () => {
  const fixture = await mkdtemp("/tmp/opencode/codeline-cli-admission-")
  const project = join(fixture, "project")
  const environment = {
    HOME: fixture,
    XDG_DATA_HOME: join(fixture, "data"),
    CODELINE_PROJECT_ROOTS: JSON.stringify([fixture]),
    CODEX_LB_API_TOKEN: "stub-only-token",
  }
  const resolutions: Array<ReturnType<typeof runExecutionSnapshotResolve>> = []
  const adapterOptions: Array<Parameters<typeof providerRuntimeAdapterCreate>[0]> = []
  let runtime: Awaited<ReturnType<typeof cliLocalRuntimeCreate>> | undefined
  try {
    await mkdir(project)
    runtime = await cliLocalRuntimeCreate({
      cwd: project,
      environment,
      appCreate: (options) =>
        appCreate({
          ...options,
          runExecutionSnapshotResolve: (...args) => {
            const resolution = runExecutionSnapshotResolve(...args)
            resolutions.push(resolution)
            return resolution
          },
          providerRuntimeAdapterCreate: (options) => {
            adapterOptions.push(options)
            return providerRuntimeAdapterCreate({
              ...options,
              configuration: { model: "stub", provider: "deterministic", tools: { bash: false, webfetch: false } },
              chunks: ["Local stub reply"],
            })
          },
        }),
    })
    if (!runtime.success) throw new Error(runtime.errorMessage)
    expect(runtime.data.target.agentId).toBe("build")
    const fetch = runtime.data.fetch
    const request = (path: string, body: unknown) =>
      fetch(
        new Request(`http://local.invalid${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      )
    const created = await request("/api/sessions", {
      clientRequestId: crypto.randomUUID(),
      primaryAgentId: runtime.data.target.agentId,
      serverId: runtime.data.target.serverId,
      projectPath: project,
      title: "Local admission",
    })
    expect(created.status).toBe(201)
    const sessionId = ((await created.json()) as { session: { id: string } }).session.id
    const chat = await request(`/api/sessions/${sessionId}/chat`, {
      messages: [{ content: "Hello", id: crypto.randomUUID(), role: "user" }],
      runId: crypto.randomUUID(),
      threadId: sessionId,
    })
    expect(chat.status).toBe(200)
    const runId = ((await chat.json()) as { runId: string }).runId
    let status: string | undefined
    for (let attempt = 0; attempt < 100 && status !== "succeeded"; attempt++) {
      const snapshot = await fetch(new Request(`http://local.invalid/api/sessions/${sessionId}/runs/${runId}/snapshot`))
      expect(snapshot.status).toBe(200)
      status = ((await snapshot.json()) as { status: string }).status
      if (status !== "succeeded") await Bun.sleep(5)
    }
    expect(status).toBe("succeeded")
    const detail = await fetch(new Request(`http://local.invalid/api/sessions/${sessionId}/runs/${runId}/detail`))
    expect(detail.status).toBe(200)
    expect(
      ((await detail.json()) as { detail: { transcript: { assistantText: string } } }).detail.transcript.assistantText,
    ).toBe("Local stub reply")
    const resolution = resolutions[0]
    expect(resolution?.success).toBe(true)
    if (!resolution?.success) return
    expect(resolution.data.agentPrompt).toContain("## build")
    expect(resolution.data.configurationRevision).toBeDefined()
    expect(resolution.data.executionManifest?.tools.primary.tools).toContain("read")
    expect(adapterOptions[0]?.environment.CODEX_LB_API_TOKEN).toBe("stub-only-token")
    expect(adapterOptions[0]?.systemPrompt).toContain("## build")
  } finally {
    if (runtime?.success) expect((await runtime.data.shutdown()).success).toBe(true)
    await rm(fixture, { recursive: true, force: true })
  }
})

test("local factory rejects out-of-root projects and ignores relative XDG data homes", async () => {
  const fixture = await mkdtemp("/tmp/opencode/codeline-cli-paths-")
  try {
    const inside = join(fixture, "inside")
    const outside = join(fixture, "outside")
    await mkdir(inside)
    await mkdir(outside)
    const environment = {
      HOME: fixture,
      XDG_DATA_HOME: "relative-data",
      CODELINE_PROJECT_ROOTS: JSON.stringify([inside]),
    }
    const denied = await cliLocalRuntimeCreate({ cwd: outside, environment })
    expect(denied.success).toBe(false)
    const allowed = await cliLocalRuntimeCreate({ cwd: inside, environment })
    if (!allowed.success) throw new Error(allowed.errorMessage)
    try {
      expect(allowed.data.databasePath).toBe(join(fixture, ".local", "share", "codeline", "db.sqlite"))
      expect(allowed.data.target.agentId).toBeUndefined()
    } finally {
      expect((await allowed.data.shutdown()).success).toBe(true)
    }
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})
