import { describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createResult, createResultErrorCode } from "@adaptive-ds/result"
import type { Terminal } from "@earendil-works/pi-tui"
import { run } from "@stricli/core"
import { cliApplicationCreate } from "./cliApplicationCreate.js"
import type { CliCommandContext } from "./cliCommandContext.js"
import type { cliConversationCreate } from "./cliConversationCreate.js"

class FakeTerminal implements Terminal {
  output = ""
  onInput?: (data: string) => void
  starts = 0
  stops = 0
  columns = 80
  rows = 24
  kittyProtocolActive = false
  start(onInput: (data: string) => void) {
    this.starts++
    this.onInput = onInput
  }
  stop() {
    this.stops++
    this.onInput = undefined
  }
  async drainInput() {}
  write(data: string) {
    this.output += data
  }
  moveBy(_lines: number) {}
  hideCursor() {}
  showCursor() {}
  clearLine() {}
  clearFromCursor() {}
  clearScreen() {}
  setTitle(_title: string) {}
  setProgress(_active: boolean) {}
  input(text: string) {
    this.onInput?.(text)
  }
}

async function fixtureCreate() {
  const directory = await mkdtemp(join(tmpdir(), "cli-interactive-"))
  const terminal = new FakeTerminal()
  const stderr: string[] = []
  const stdout: string[] = []
  const handlers: { interrupt?: () => void; terminate?: () => void } = {}
  const process = {
    stdout: { write: (text: string) => stdout.push(text) },
    stderr: { write: (text: string) => stderr.push(text) },
    exitCode: 0,
  }
  const context: CliCommandContext = {
    process,
    configPath: join(directory, "config.json"),
    terminal,
    env: { HOME: directory, XDG_CONFIG_HOME: directory, CODELINE_SESSION_TOKEN: "secret-cookie" },
    onInterrupt: (handler) => {
      handlers.interrupt = handler
      return () => {
        handlers.interrupt = undefined
      }
    },
    onTerminate: (handler) => {
      handlers.terminate = handler
      return () => {
        handlers.terminate = undefined
      }
    },
  }
  return {
    context,
    directory,
    terminal,
    stderr,
    stdout,
    process,
    handlers,
    cleanup: () => rm(directory, { recursive: true, force: true }),
    launch: (args: string[]) => run(cliApplicationCreate(), args, context),
  }
}

const tick = async () => {
  await Bun.sleep(30)
}

describe("interactive command lifecycle", () => {
  test("default and chat commands use selected theme, session/project options, stream turns and preserve rejected input", async () => {
    const fixture = await fixtureCreate()
    try {
      const theme = join(fixture.directory, "custom.json")
      const builtin = await Bun.file(join(import.meta.dir, "themes/dark.json")).text()
      await writeFile(theme, builtin)
      await writeFile(
        fixture.context.configPath,
        JSON.stringify({ backend: "https://remote.test", theme, project: "configured-project" }),
      )
      const prompts: string[] = []
      let release!: () => void
      let shutdowns = 0
      const conversationCreate = (async ({ options, onSession }) => {
        expect(options).toMatchObject({ backend: { serverUrl: "https://remote.test" }, project: "flag-project", theme })
        return createResult({
          sessionId: () => undefined,
          prompt: async (text: string, onText: (delta: string) => void) => {
            prompts.push(text)
            onSession?.("created-session")
            onText("Streaming ")
            await new Promise<void>((resolve) => {
              release = resolve
            })
            onText("reply")
            return createResult(undefined)
          },
          cancel: () => {},
          shutdown: async () => {
            shutdowns++
            return createResult(undefined)
          },
        })
      }) as typeof cliConversationCreate
      fixture.context.conversationCreate = conversationCreate
      const running = fixture.launch(["--project", "flag-project"])
      await tick()
      fixture.terminal.input("First")
      fixture.terminal.input("\r")
      await tick()
      fixture.terminal.input("Second")
      fixture.terminal.input("\r")
      expect(prompts).toEqual(["First"])
      release()
      await tick()
      fixture.terminal.input("\r")
      await tick()
      expect(prompts).toEqual(["First", "Second"])
      release()
      await tick()
      fixture.terminal.input("\x03")
      await running
      expect(fixture.process.exitCode).toBe(130)
      expect(fixture.stderr).toEqual([])
      expect(fixture.stdout).toEqual([])
      expect(shutdowns).toBe(1)
      expect(fixture.terminal.starts).toBe(1)
      expect(fixture.terminal.stops).toBe(1)
      expect(fixture.terminal.output).toContain("Streaming reply")
      expect(fixture.terminal.output).toContain("created-session")
      expect(fixture.handlers.interrupt).toBeUndefined()

      // Explicit chat and --session have the same grammar and override config's project only if absent.
      const second = fixture.launch(["chat", "--session", "existing-session"])
      await second
      expect(fixture.stderr.join("")).toContain("not both")
    } finally {
      await fixture.cleanup()
    }
  })

  test("Ctrl-C cancels an active turn, reports errors without leaking a token, and exits only when idle", async () => {
    const fixture = await fixtureCreate()
    try {
      let cancel!: () => void
      let starts = 0
      let shutdowns = 0
      fixture.context.conversationCreate = (async () =>
        createResult({
          sessionId: () => "existing",
          prompt: async (_text: string, onText: (delta: string) => void) => {
            starts++
            onText("partial ")
            await new Promise<void>((resolve) => {
              cancel = resolve
            })
            return createResultErrorCode("prompt", "secret-cookie provider error", "interrupted")
          },
          cancel: () => cancel?.(),
          shutdown: async () => {
            shutdowns++
            return createResult(undefined)
          },
        })) as typeof cliConversationCreate
      const running = fixture.launch(["chat", "--backend", "https://remote.test", "--session", "existing"])
      await tick()
      fixture.terminal.input("Hello")
      fixture.terminal.input("\r")
      await tick()
      fixture.handlers.interrupt?.()
      await tick()
      expect(starts).toBe(1)
      expect(shutdowns).toBe(0)
      expect(fixture.terminal.output).toContain("You: Hello")
      expect(fixture.terminal.output).toContain("incomplete response; partial output discarded")
      expect(fixture.terminal.output).toContain("[redacted]")
      expect(fixture.terminal.output).not.toContain("secret-cookie")
      fixture.terminal.input("Again")
      fixture.terminal.input("\r")
      await tick()
      expect(starts).toBe(2)
      fixture.terminal.input("\x03")
      await tick()
      fixture.terminal.input("\x03")
      await running
      expect(shutdowns).toBe(1)
      expect(fixture.process.exitCode).toBe(130)
      expect(fixture.terminal.stops).toBe(1)
    } finally {
      await fixture.cleanup()
    }
  })

  test("idle Ctrl-C exits with status 130", async () => {
    const fixture = await fixtureCreate()
    try {
      fixture.context.conversationCreate = (async () =>
        createResult({
          sessionId: () => "existing",
          prompt: async () => createResult(undefined),
          cancel: () => {},
          shutdown: async () => createResult(undefined),
        })) as typeof cliConversationCreate
      const running = fixture.launch(["chat"])
      await tick()
      fixture.handlers.interrupt?.()
      await running
      expect(fixture.process.exitCode).toBe(130)
      expect(fixture.terminal.stops).toBe(1)
    } finally {
      await fixture.cleanup()
    }
  })

  test("SIGTERM during an active turn cancels, waits, restores terminal and exits 143", async () => {
    const fixture = await fixtureCreate()
    try {
      let release!: () => void
      let shutdowns = 0
      fixture.context.conversationCreate = (async () =>
        createResult({
          sessionId: () => undefined,
          prompt: async () => {
            await new Promise<void>((resolve) => {
              release = resolve
            })
            return createResultErrorCode("prompt", "Interrupted", "interrupted")
          },
          cancel: () => release?.(),
          shutdown: async () => {
            shutdowns++
            return createResult(undefined)
          },
        })) as typeof cliConversationCreate
      const running = fixture.launch(["chat"])
      await tick()
      fixture.terminal.input("Hello")
      fixture.terminal.input("\r")
      await tick()
      fixture.handlers.terminate?.()
      await running
      expect(fixture.process.exitCode).toBe(143)
      expect(fixture.terminal.stops).toBe(1)
      expect(shutdowns).toBe(1)
      expect(fixture.handlers.terminate).toBeUndefined()
    } finally {
      await fixture.cleanup()
    }
  })

  test("idle SIGTERM exits with status 143", async () => {
    const fixture = await fixtureCreate()
    try {
      fixture.context.conversationCreate = (async () =>
        createResult({
          sessionId: () => undefined,
          prompt: async () => createResult(undefined),
          cancel: () => {},
          shutdown: async () => createResult(undefined),
        })) as typeof cliConversationCreate
      const running = fixture.launch(["chat"])
      await tick()
      fixture.handlers.terminate?.()
      await running
      expect(fixture.process.exitCode).toBe(143)
      expect(fixture.terminal.stops).toBe(1)
    } finally {
      await fixture.cleanup()
    }
  })

  test("the real conversation controller streams two server turns on one existing session", async () => {
    const fixture = await fixtureCreate()
    try {
      const paths: string[] = []
      let turns = 0
      fixture.context.fetch = async (input, init) => {
        const path = new URL(String(input)).pathname
        paths.push(path)
        if (path.endsWith("/chat")) {
          turns++
          expect(new Headers(init?.headers).get("Cookie")).toBe("__Host-codeline-session=secret-cookie")
          return Response.json({ runId: `run-${turns}`, sessionId: "existing" })
        }
        if (path.endsWith("/snapshot")) return Response.json({ lastSequence: 1, status: "succeeded", partialText: "" })
        if (path.endsWith("/detail")) {
          const runId = path.split("/")[5]
          return Response.json({
            kind: "finalized",
            detail: {
              run: { id: runId, sessionId: "existing", status: "succeeded", cancellationKind: null, failure: null },
              tools: [],
              transcript: {
                activities: [],
                assistantText: `Reply ${turns}`,
                attempts: [],
                cancellation: null,
                failure: null,
                invariantViolations: [],
                terminalOutcome: { status: "completed" },
              },
            },
          })
        }
        throw new Error(`Unexpected request ${path}`)
      }
      const running = fixture.launch(["chat", "--backend", "https://remote.test", "--session", "existing"])
      await tick()
      fixture.terminal.input("First")
      fixture.terminal.input("\r")
      await tick()
      fixture.terminal.input("Second")
      fixture.terminal.input("\r")
      await tick()
      fixture.terminal.input("\x03")
      await running
      expect(fixture.process.exitCode).toBe(130)
      expect(fixture.stderr).toEqual([])
      expect(paths.filter((path) => path.endsWith("/chat"))).toEqual([
        "/api/sessions/existing/chat",
        "/api/sessions/existing/chat",
      ])
      expect(paths.some((path) => path === "/api/sessions")).toBe(false)
      expect(fixture.terminal.output).toContain("Reply 1")
      expect(fixture.terminal.output).toContain("Reply 2")
      expect(fixture.terminal.output).not.toContain("secret-cookie")
    } finally {
      await fixture.cleanup()
    }
  })

  test("missing theme fails before opening backend or terminal", async () => {
    const fixture = await fixtureCreate()
    try {
      await fixture.launch(["chat", "--theme", join(fixture.directory, "missing.json")])
      expect(fixture.stderr.join("")).toContain("Could not read theme file")
      expect(fixture.terminal.starts).toBe(0)
      expect(fixture.process.exitCode).toBe(1)
    } finally {
      await fixture.cleanup()
    }
  })

  test("a failed turn displays a redacted error, allows retry, and leaves exit status clean", async () => {
    const fixture = await fixtureCreate()
    try {
      let turns = 0
      fixture.context.conversationCreate = (async () =>
        createResult({
          sessionId: () => "existing",
          prompt: async (_text: string, onText: (delta: string) => void) => {
            turns++
            if (turns === 1) {
              onText("Unfinished")
              return createResultErrorCode("prompt", "secret-cookie provider failed", "provider_failed")
            }
            onText("Recovered")
            return createResult(undefined)
          },
          cancel: () => {},
          shutdown: async () => createResult(undefined),
        })) as typeof cliConversationCreate
      const running = fixture.launch(["chat", "--backend", "https://remote.test", "--session", "existing"])
      await tick()
      fixture.terminal.input("First")
      fixture.terminal.input("\r")
      await tick()
      expect(fixture.stderr.join("")).toContain("[redacted] provider failed")
      fixture.terminal.input("Retry")
      fixture.terminal.input("\r")
      await tick()
      fixture.terminal.input("\x03")
      await running
      expect(turns).toBe(2)
      expect(fixture.process.exitCode).toBe(130)
      expect(fixture.terminal.output).toContain("Error:")
      expect(fixture.terminal.output).toContain("incomplete response; partial output discarded")
      expect(fixture.terminal.output).toContain("Recovered")
      expect(fixture.terminal.output).not.toContain("secret-cookie")
      expect(fixture.stderr.join("")).not.toContain("secret-cookie")
    } finally {
      await fixture.cleanup()
    }
  })
})
