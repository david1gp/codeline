import { expect, mock, spyOn, test } from "bun:test"
import { randomBytes } from "node:crypto"
import { createResultError } from "@adaptive-ds/result"
import { journalCursorCodecCreate } from "../../../src/journal/actions/journalCursorCodecCreate.js"
import { serverStart } from "../../../src/server/serverStart.js"

test("server startup does not serve, log or register signals when runtime reconciliation fails", async () => {
  const cursorCodec = journalCursorCodecCreate({ randomBytes, secret: "startup-test-secret" })
  if (!cursorCodec.success) throw new Error(cursorCodec.errorMessage)
  const serve = mock(() => ({ stop: async () => undefined, url: new URL("http://codeline.test") }))
  const signalSource = { once: mock(() => undefined), removeListener: mock(() => undefined) }
  const log = spyOn(console, "log").mockImplementation(() => undefined)
  let closes = 0
  try {
    await expect(
      serverStart({
        configuration: { authMode: "oidc", databaseUrl: "file:./data/db.sqlite", nodeEnv: "test" },
        configurationStore: {} as never,
        database: {
          client: {
            close: () => {
              closes += 1
            },
          },
          db: {},
        } as never,
        journalCursorCodec: cursorCodec.data,
        projectRootDirs: [],
        providerAgentCatalog: { agents: [], providers: [], revision: `sha256-${"0".repeat(64)}` },
        runStartupInterruptionReconcile: async () =>
          createResultError("runStartupInterruptionReconcile", "reconciliation failed"),
        serve,
        signalSource,
      }),
    ).rejects.toThrow("reconciliation failed")
    expect(closes).toBe(1)
    expect(serve).not.toHaveBeenCalled()
    expect(signalSource.once).not.toHaveBeenCalled()
    expect(signalSource.removeListener).not.toHaveBeenCalled()
    expect(log).not.toHaveBeenCalled()
  } finally {
    log.mockRestore()
  }
})
