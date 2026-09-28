import { describe, expect, it } from "bun:test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { run } from "@stricli/core"
import { cliApplicationCreate } from "../../src/cli/cliApplicationCreate.js"
import type { CliCommandContext } from "../../src/cli/cliCommandContext.js"
import { cliLocalRuntimeCreate } from "../../src/cli/cliLocalRuntimeCreate.js"

const projectId = "019936c0-1234-7000-8000-000000000001"
type Snapshot = { partialText: string; status: "accepted" | "running" | "succeeded" | "failed" | "aborted" }

function finalized(runId: string, sessionId: string, answer: string) {
  return {
    kind: "finalized",
    detail: {
      run: { id: runId, sessionId, status: "succeeded", cancellationKind: null, failure: null },
      tools: [],
      transcript: {
        activities: [],
        assistantText: answer,
        attempts: [],
        cancellation: null,
        failure: null,
        invariantViolations: [],
        terminalOutcome: { status: "completed" },
      },
    },
  }
}

async function commandFixtureCreate() {
  const directory = await mkdtemp(join(tmpdir(), "codeline-cli-command-"))
  const stdout: string[] = []
  const stderr: string[] = []
  const requests: { url: URL; init?: RequestInit }[] = []
  const delays: number[] = []
  let interrupt: (() => void) | undefined
  let disposed = false
  const runId = "durable-run-id"
  const snapshots: (Snapshot | Response)[] = [
    { partialText: "", status: "accepted" },
    { partialText: "Hello", status: "running" },
    { partialText: "Hello", status: "running" },
    { partialText: "Hello world", status: "running" },
    { partialText: "", status: "succeeded" },
  ]
  let answer = "Hello world!"
  const process = {
    stdout: { write: (text: string) => stdout.push(text) },
    stderr: { write: (text: string) => stderr.push(text) },
    exitCode: 0,
  }
  const context: CliCommandContext = {
    process,
    configPath: join(directory, "config.json"),
    env: { CODELINE_SESSION_TOKEN: "opaque-test-cookie" },
    onInterrupt: (handler) => {
      interrupt = handler
      return () => {
        disposed = true
        interrupt = undefined
      }
    },
    pollingDelay: async (_signal, milliseconds) => {
      delays.push(milliseconds)
    },
    fetch: async (input, init) => {
      const url = new URL(String(input))
      requests.push({ url, init })
      if (url.pathname === "/api/servers")
        return Response.json({
          servers: [{ id: "server-1", name: "Server" }],
          etag: '"servers"',
          revision: 1,
          schemaVersion: "1",
        })
      if (url.pathname === "/api/servers/server-1/agents")
        return Response.json({
          agents: [
            { id: "child", name: "Child", parentAgentId: "primary", role: "primary", serverId: "server-1" },
            { id: "subagent", name: "Subagent", parentAgentId: null, role: "subagent", serverId: "server-1" },
            { id: "primary", name: "Primary", parentAgentId: null, role: "primary", serverId: "server-1" },
          ],
          etag: '"agents"',
          revision: 1,
          schemaVersion: "1",
        })
      if (url.pathname === "/api/sessions")
        return Response.json({
          created: true,
          session: {
            archivedAt: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            id: "new-session",
            metadata: {},
            parentSessionId: null,
            pinned: false,
            primaryAgentId: "primary",
            projectPath: "/server/project",
            revision: 1,
            serverId: "server-1",
            title: "hello",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        })
      const sessionId = decodeURIComponent(url.pathname.split("/")[3] ?? "")
      if (url.pathname.endsWith("/chat")) {
        return Response.json({ runId, sessionId })
      }
      if (url.pathname.endsWith("/snapshot")) {
        const snapshot = snapshots.shift()
        if (snapshot === undefined) throw new Error("Unexpected snapshot request")
        if (snapshot instanceof Response) return snapshot
        return Response.json({ lastSequence: 1, ...snapshot })
      }
      if (url.pathname.endsWith("/detail")) return Response.json(finalized(runId, sessionId, answer))
      if (url.pathname.endsWith("/cancel")) return Response.json({ cancelledRunIds: [runId], signalledRunIds: [runId] })
      throw new Error(`Unexpected request: ${url.pathname}`)
    },
  }
  return {
    answerSet: (text: string) => {
      answer = text
    },
    cleanup: () => rm(directory, { recursive: true, force: true }),
    context,
    delays,
    directory,
    disposed: () => disposed,
    interrupt: () => interrupt?.(),
    process,
    requests,
    snapshots,
    stderr,
    stdout,
    run: (args = ["run", "hello", "--backend", "https://remote.test", "--session", "existing-session"]) =>
      run(cliApplicationCreate(), args, context),
  }
}

describe("remote one-shot command", () => {
  it("streams each appended snapshot suffix once and recovers the final suffix after snapshot cleanup", async () => {
    const fixture = await commandFixtureCreate()
    try {
      fixture.context.pollingDelay = async (_signal, ms) => {
        fixture.delays.push(ms)
        if (fixture.delays.length === 2) expect(fixture.stdout).toEqual(["Hello"])
      }
      await fixture.run()
      expect(fixture.stdout).toEqual(["Hello", " world", "!"])
      expect(fixture.stderr).toEqual([])
      expect(fixture.process.exitCode).toBe(0)
      expect(fixture.delays).toEqual([100, 100, 100, 100])
      expect(fixture.requests[0]?.url.pathname).toBe("/api/sessions/existing-session/chat")
      expect(fixture.requests[1]?.url.pathname).toBe("/api/sessions/existing-session/runs/durable-run-id/snapshot")
      expect(JSON.parse(String(fixture.requests[0]?.init?.body)).runId).not.toBe("durable-run-id")
      expect(fixture.requests.some(({ url }) => url.pathname === "/api/events")).toBe(false)
      expect(fixture.disposed()).toBe(true)
    } finally {
      await fixture.cleanup()
    }
  })

  it("creates a remote session with projectId and discovered IDs, without using a local path or saving authentication", async () => {
    const fixture = await commandFixtureCreate()
    try {
      fixture.snapshots.splice(0, fixture.snapshots.length, { partialText: "", status: "succeeded" })
      await fixture.run(["run", "hello", "--backend", "https://remote.test", "--project", projectId])
      const created = fixture.requests.find(({ url }) => url.pathname === "/api/sessions")
      const body = JSON.parse(String(created?.init?.body))
      expect(body).toMatchObject({ projectId, primaryAgentId: "primary", serverId: "server-1", title: "hello" })
      expect(body.projectPath).toBeUndefined()
      expect(body.clientRequestId).toBeString()
      expect(new Headers(created?.init?.headers).get("Origin")).toBe("https://remote.test")
      expect(fixture.stdout.join("")).toBe("Hello world!")
      expect(fixture.process.exitCode).toBe(0)
      expect(await Bun.file(fixture.context.configPath).exists()).toBe(false)
    } finally {
      await fixture.cleanup()
    }
  })

  it("backs off retryable snapshot failures without duplicating output", async () => {
    const fixture = await commandFixtureCreate()
    try {
      fixture.snapshots.splice(
        2,
        0,
        Response.json({ error: { code: "platform.unavailable", message: "Retry later." } }, { status: 503 }),
        Response.json({ error: { code: "platform.rate-limit", message: "Retry later." } }, { status: 429 }),
      )
      await fixture.run()
      expect(fixture.process.exitCode).toBe(0)
      expect(fixture.stdout.join("")).toBe("Hello world!")
      expect(fixture.delays).toEqual([100, 100, 100, 200, 100, 100])
    } finally {
      await fixture.cleanup()
    }
  })

  for (const status of ["failed", "aborted"] as const) {
    it(`reports terminal ${status} to stderr with nonzero exit rather than success`, async () => {
      const fixture = await commandFixtureCreate()
      try {
        fixture.snapshots.splice(
          0,
          fixture.snapshots.length,
          { partialText: "partial", status: "running" },
          Response.json({
            lastSequence: 2,
            partialText: "",
            status,
            failure: { code: "provider.failed", message: "Provider failed." },
          }),
        )
        await fixture.run()
        expect(fixture.stdout).toEqual(["partial"])
        expect(fixture.stderr.join("")).toContain("Provider failed.")
        expect(fixture.process.exitCode).toBe(1)
        expect(fixture.disposed()).toBe(true)
      } finally {
        await fixture.cleanup()
      }
    })
  }

  for (const scenario of ["active rewrite", "final rewrite", "truncated final answer"] as const) {
    it(`does not fake success on ${scenario}`, async () => {
      const fixture = await commandFixtureCreate()
      try {
        fixture.snapshots.splice(
          0,
          fixture.snapshots.length,
          { partialText: "Hello", status: "running" },
          {
            partialText: scenario === "active rewrite" ? "rewritten" : "",
            status: scenario === "active rewrite" ? "running" : "succeeded",
          },
        )
        fixture.answerSet(scenario === "truncated final answer" ? "[Earlier output truncated]\n\ntail" : "rewritten")
        await fixture.run()
        expect(fixture.stdout).toEqual(["Hello"])
        expect(fixture.process.exitCode).toBe(1)
        expect(fixture.stderr.join("")).toContain("complete answer could not be recovered")
      } finally {
        await fixture.cleanup()
      }
    })
  }

  it("cancels the remote run on Ctrl-C during polling with a fresh signal and exit 130", async () => {
    const fixture = await commandFixtureCreate()
    try {
      fixture.context.pollingDelay = async (signal) => {
        fixture.interrupt()
        expect(signal?.aborted).toBe(true)
      }
      await fixture.run()
      const cancelled = fixture.requests.find(({ url }) => url.pathname.endsWith("/cancel"))
      expect(cancelled).toBeDefined()
      expect(cancelled?.url.pathname).toBe("/api/sessions/existing-session/runs/durable-run-id/cancel")
      expect(cancelled?.init?.signal?.aborted).toBe(false)
      expect(JSON.parse(String(cancelled?.init?.body))).toMatchObject({ kind: "requested" })
      expect(fixture.process.exitCode).toBe(130)
      expect(fixture.stderr.join("")).toContain("cancellation requested")
      expect(fixture.disposed()).toBe(true)
    } finally {
      await fixture.cleanup()
    }
  })

  it("lets admission settle before cancelling when Ctrl-C arrives during chat submission", async () => {
    const fixture = await commandFixtureCreate()
    try {
      const fetcher = fixture.context.fetch!
      fixture.context.fetch = async (input, init) => {
        if (String(input).endsWith("/chat")) {
          fixture.interrupt()
          expect(init?.signal?.aborted).toBe(false)
        }
        return fetcher(input, init)
      }
      await fixture.run()
      expect(fixture.requests.map(({ url }) => url.pathname.split("/").at(-1))).toEqual(["chat", "cancel"])
      expect(fixture.process.exitCode).toBe(130)
      expect(fixture.stdout).toEqual([])
      expect(fixture.disposed()).toBe(true)
    } finally {
      await fixture.cleanup()
    }
  })

  it("reports cancellation failure and redacts a reflected cookie without printing it or succeeding", async () => {
    const fixture = await commandFixtureCreate()
    try {
      fixture.context.pollingDelay = async () => fixture.interrupt()
      const fetcher = fixture.context.fetch!
      fixture.context.fetch = async (input, init) => {
        if (String(input).endsWith("/cancel"))
          return Response.json(
            { error: { code: "platform.unavailable", message: "opaque-test-cookie could not cancel" } },
            { status: 503 },
          )
        return fetcher(input, init)
      }
      await fixture.run()
      expect(fixture.process.exitCode).toBe(130)
      expect(fixture.stderr.join("")).toContain("remote cancellation failed")
      expect(fixture.stderr.join("")).not.toContain("opaque-test-cookie")
      expect(fixture.stderr.join("")).toContain("[redacted]")
    } finally {
      await fixture.cleanup()
    }
  })

  it("fails closed for missing authentication, empty prompts, conflicting session/project, and interactive mode without a TTY", async () => {
    const fixture = await commandFixtureCreate()
    try {
      fixture.context.env = {}
      await fixture.run()
      expect(fixture.stderr.join("")).toContain("CODELINE_SESSION_TOKEN")
      fixture.context.env = { CODELINE_SESSION_TOKEN: "opaque-test-cookie" }
      await fixture.run(["run", "   ", "--backend", "https://remote.test"])
      expect(fixture.stderr.join("")).toContain("prompt must contain text")
      await fixture.run(["run", "hello", "--backend", "https://remote.test", "--session", "s", "--project", "p"])
      expect(fixture.stderr.join("")).toContain("not both")
      await fixture.run(["chat", "--backend", "https://remote.test"])
      expect(fixture.stderr.join("")).toContain("requires a TTY")
      expect(fixture.process.exitCode).toBe(1)
      expect(fixture.requests).toEqual([])
      expect(fixture.stdout).toEqual([])
    } finally {
      await fixture.cleanup()
    }
  })

  it("reports a rejected chat request without starting polling", async () => {
    const fixture = await commandFixtureCreate()
    try {
      fixture.context.fetch = async () =>
        Response.json({ error: { code: "identity.unauthenticated", message: "Sign in required." } }, { status: 401 })
      await fixture.run()
      expect(fixture.process.exitCode).toBe(1)
      expect(fixture.stderr.join("")).toContain("Sign in required.")
      expect(fixture.stdout).toEqual([])
      expect(fixture.disposed()).toBe(true)
    } finally {
      await fixture.cleanup()
    }
  })

  it("aborts an in-flight snapshot read and cancels with the durable run ID", async () => {
    const fixture = await commandFixtureCreate()
    try {
      const fetcher = fixture.context.fetch!
      fixture.context.fetch = async (input, init) => {
        if (String(input).endsWith("/snapshot")) {
          fixture.interrupt()
          expect(init?.signal?.aborted).toBe(true)
          throw new Error("Aborted read")
        }
        return fetcher(input, init)
      }
      await fixture.run()
      expect(fixture.requests.at(-1)?.url.pathname).toBe("/api/sessions/existing-session/runs/durable-run-id/cancel")
      expect(fixture.process.exitCode).toBe(130)
      expect(fixture.stdout).toEqual([])
      expect(fixture.disposed()).toBe(true)
    } finally {
      await fixture.cleanup()
    }
  })

  it("cancels by the client admission ID when Ctrl-C accompanies a lost chat response", async () => {
    const fixture = await commandFixtureCreate()
    try {
      let clientRunId = ""
      const paths: string[] = []
      fixture.context.fetch = async (input, init) => {
        const path = new URL(String(input)).pathname
        paths.push(path)
        if (path.endsWith("/chat")) {
          clientRunId = JSON.parse(String(init?.body)).runId
          fixture.interrupt()
          throw new Error("Response lost after admission")
        }
        return Response.json({ cancelledRunIds: ["durable-run-id"], signalledRunIds: ["durable-run-id"] })
      }
      await fixture.run()
      expect(paths[1]).toBe(`/api/sessions/existing-session/runs/${clientRunId}/cancel`)
      expect(fixture.process.exitCode).toBe(130)
      expect(fixture.stderr.join("")).toContain("cancellation requested")
    } finally {
      await fixture.cleanup()
    }
  })

  it("stops before any request if interrupted during signal registration", async () => {
    const fixture = await commandFixtureCreate()
    try {
      let disposed = false
      fixture.context.onInterrupt = (handler) => {
        handler()
        return () => {
          disposed = true
        }
      }
      await fixture.run()
      expect(fixture.requests).toEqual([])
      expect(fixture.process.exitCode).toBe(130)
      expect(disposed).toBe(true)
    } finally {
      await fixture.cleanup()
    }
  })

  it("handles Ctrl-C racing terminal completion without claiming the run was cancelled", async () => {
    const fixture = await commandFixtureCreate()
    try {
      fixture.context.pollingDelay = async () => fixture.interrupt()
      const fetcher = fixture.context.fetch!
      fixture.context.fetch = async (input, init) => {
        if (String(input).endsWith("/cancel")) return Response.json({ cancelledRunIds: [], signalledRunIds: [] })
        return fetcher(input, init)
      }
      await fixture.run()
      expect(fixture.process.exitCode).toBe(130)
      expect(fixture.stderr.join("")).toContain("already terminal")
      expect(fixture.stderr.join("")).not.toContain("cancellation requested")
    } finally {
      await fixture.cleanup()
    }
  })

  it("gives up on a persistent snapshot outage with bounded backoff and no fake success", async () => {
    const fixture = await commandFixtureCreate()
    try {
      const fetcher = fixture.context.fetch!
      let polls = 0
      fixture.context.fetch = async (input, init) => {
        if (String(input).endsWith("/snapshot")) {
          polls += 1
          throw new Error("Offline")
        }
        return fetcher(input, init)
      }
      await fixture.run()
      expect(polls).toBe(7)
      expect(fixture.delays).toEqual([100, 200, 400, 800, 1600, 1600])
      expect(fixture.process.exitCode).toBe(1)
      expect(fixture.stdout).toEqual([])
      expect(fixture.disposed()).toBe(true)
    } finally {
      await fixture.cleanup()
    }
  })

  for (const unavailable of ["server", "primary agent"] as const) {
    it(`fails session creation if no ${unavailable} can be discovered`, async () => {
      const fixture = await commandFixtureCreate()
      try {
        const fetcher = fixture.context.fetch!
        fixture.context.fetch = async (input, init) => {
          const path = new URL(String(input)).pathname
          if (unavailable === "server" && path === "/api/servers")
            return Response.json({
              servers: [],
              etag: '"servers"',
              revision: 1,
              schemaVersion: "1",
            })
          if (unavailable === "primary agent" && path.endsWith("/agents"))
            return Response.json({
              agents: [],
              etag: '"agents"',
              revision: 1,
              schemaVersion: "1",
            })
          return fetcher(input, init)
        }
        await fixture.run(["run", "hello", "--backend", "https://remote.test", "--project", projectId])
        expect(fixture.process.exitCode).toBe(1)
        expect(fixture.stderr.join("")).toContain(
          unavailable === "server" ? "no available execution targets" : "no primary agent",
        )
        expect(fixture.requests.some(({ url }) => url.pathname === "/api/sessions")).toBe(false)
        expect(fixture.stdout).toEqual([])
      } finally {
        await fixture.cleanup()
      }
    })
  }
})

describe("local one-shot command", () => {
  it("creates an in-process session for the canonical cwd or --project using the provisioned target, without a cookie or listener", async () => {
    const fixture = await commandFixtureCreate()
    const project = join(fixture.directory, "project")
    await mkdir(project)
    fixture.context.cwd = project
    fixture.context.env = {
      HOME: fixture.directory,
      XDG_DATA_HOME: join(fixture.directory, "data"),
      CODELINE_PROJECT_ROOTS: JSON.stringify([fixture.directory]),
      CODEX_LB_API_TOKEN: "fixture-key",
    }
    const responses: { path: string; headers: Headers; body: string }[] = []
    let shutdowns = 0
    fixture.context.localRuntimeCreate = async (options) => {
      const created = await cliLocalRuntimeCreate(options)
      if (!created.success) return created
      const original = created.data
      return {
        success: true as const,
        data: {
          ...original,
          fetch: async (request: Request) => {
            const path = new URL(request.url).pathname
            responses.push({ path, headers: request.headers, body: await request.clone().text() })
            if (path.endsWith("/chat")) return Response.json({ runId: "fixture-run", sessionId: path.split("/")[3] })
            if (path.endsWith("/snapshot"))
              return Response.json({ lastSequence: 1, partialText: "", status: "succeeded" })
            if (path.endsWith("/detail"))
              return Response.json(finalized("fixture-run", path.split("/")[3]!, "Local reply"))
            return original.fetch(request)
          },
          shutdown: async () => {
            shutdowns += 1
            return original.shutdown()
          },
        },
      }
    }
    try {
      await fixture.run(["run", "hello"])
      expect(fixture.stderr).toEqual([])
      expect(fixture.process.exitCode).toBe(0)
      expect(fixture.stdout.join("")).toBe("Local reply")
      expect(fixture.stderr).toEqual([])
      expect(shutdowns).toBe(1)
      const created = responses.find(({ path }) => path === "/api/sessions")
      expect(JSON.parse(created!.body)).toMatchObject({
        projectPath: project,
        primaryAgentId: "build",
        serverId: "local:server",
      })
      expect(JSON.parse(created!.body).projectId).toBeUndefined()
      expect(responses.some(({ path }) => path === "/api/servers" || path.endsWith("/agents"))).toBe(false)
      expect(responses.every(({ headers }) => !headers.has("Cookie") && !headers.has("Origin"))).toBe(true)
      expect(fixture.disposed()).toBe(true)

      responses.length = 0
      fixture.stdout.length = 0
      await fixture.run(["run", "hello", "--project", "../project/."])
      expect(fixture.process.exitCode).toBe(0)
      expect(JSON.parse(responses.find(({ path }) => path === "/api/sessions")!.body).projectPath).toBe(project)
      expect(shutdowns).toBe(2)
    } finally {
      await fixture.cleanup()
    }
  })

  it("continues an existing session without passing an implicit cwd or discovering targets, and shuts down on failure", async () => {
    const fixture = await commandFixtureCreate()
    fixture.context.cwd = fixture.directory
    fixture.context.env = { HOME: fixture.directory, XDG_DATA_HOME: join(fixture.directory, "data") }
    const paths: string[] = []
    let shutdowns = 0
    let interruptOnChat = false
    fixture.context.localRuntimeCreate = async (options) => {
      const created = await cliLocalRuntimeCreate(options)
      if (!created.success) return created
      const original = created.data
      return {
        success: true as const,
        data: {
          ...original,
          fetch: async (request: Request) => {
            const path = new URL(request.url).pathname
            paths.push(path)
            if (interruptOnChat && path.endsWith("/chat")) {
              fixture.interrupt()
              return Response.json({ runId: "fixture-run", sessionId: "existing" })
            }
            if (path.endsWith("/cancel"))
              return Response.json({ cancelledRunIds: ["fixture-run"], signalledRunIds: ["fixture-run"] })
            return Response.json({ error: { code: "session.not-found", message: "No session." } }, { status: 404 })
          },
          shutdown: async () => {
            shutdowns += 1
            return original.shutdown()
          },
        },
      }
    }
    try {
      await fixture.run(["run", "hello", "--session", "existing"])
      expect(paths).toEqual(["/api/sessions/existing/chat"])
      expect(fixture.stderr.join("")).toContain("No session.")
      expect(fixture.process.exitCode).toBe(1)
      expect(shutdowns).toBe(1)
      paths.length = 0
      await fixture.run(["run", "hello", "--session", "existing", "--project", "."])
      expect(fixture.stderr.join("")).toContain("not both")
      expect(paths).toEqual([])
      expect(shutdowns).toBe(1)
      interruptOnChat = true
      await fixture.run(["run", "hello", "--session", "existing"])
      expect(paths).toEqual(["/api/sessions/existing/chat", "/api/sessions/existing/runs/fixture-run/cancel"])
      expect(fixture.process.exitCode).toBe(130)
      expect(shutdowns).toBe(2)
    } finally {
      await fixture.cleanup()
    }
  })

  it("fails explicitly without a provisioned provider and releases the runtime lock", async () => {
    const fixture = await commandFixtureCreate()
    fixture.context.cwd = fixture.directory
    fixture.context.env = { HOME: fixture.directory, XDG_DATA_HOME: join(fixture.directory, "data") }
    try {
      await fixture.run(["run", "hello"])
      expect(fixture.stderr.join("")).toContain("no provisioned primary agent")
      expect(fixture.process.exitCode).toBe(1)
      await fixture.run(["run", "hello"])
      expect(fixture.stderr.join("")).not.toContain("already owns")
    } finally {
      await fixture.cleanup()
    }
  })
})
