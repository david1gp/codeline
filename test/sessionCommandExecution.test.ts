import { afterAll, afterEach, beforeAll, expect, test } from "bun:test"
import { randomBytes } from "node:crypto"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { createResult } from "@adaptive-ds/result"
import { eq } from "drizzle-orm"
import { agentTable } from "../src/agents/db/agentTable.js"
import { appCreate } from "../src/app/appCreate.js"
import type { ConfigurationStore } from "../src/configuration/configurationStore.js"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { databaseReadyCheck } from "../src/database/databaseReadyCheck.js"
import { databaseUrl } from "../src/database/databaseUrl.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { developmentIdentityUpsert } from "../src/identity/db/developmentIdentityUpsert.js"
import { organizationMemberTable } from "../src/identity/db/organizationMemberTable.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { journalCursorCodecCreate } from "../src/journal/actions/journalCursorCodecCreate.js"
import { messageTable } from "../src/message/db/messageTable.js"
import { projectRegistryRepositoryUpsert } from "../src/project/db/projectRegistryRepositoryUpsert.js"
import { attemptTable } from "../src/run/db/attemptTable.js"
import { runTable } from "../src/run/db/runTable.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { sessionChatAdapterCreate } from "../src/session/actions/sessionChatAdapterCreate.js"
import { sessionTable } from "../src/session/db/sessionTable.js"
import { uuidv7 } from "../src/uuid/uuidv7.js"
import { appSseTestDependenciesCreate } from "./appSseTestDependenciesCreate.js"
import { databaseTestConnectionCreate } from "./databaseTestConnectionCreate.js"

const connection = databaseTestConnectionCreate()
const database = connection.db
const databaseAvailable = await databaseReadyCheck(database).then((result) => result.success)
const identityKey = `command-exec-user-${uuidv7()}`
const userId = `development:${identityKey}`
const serverId = `command-exec-server-${uuidv7()}`
const agentId = `command-exec-agent-${uuidv7()}`
const subagentId = `command-exec-subagent-${uuidv7()}`
const otherServerAgentId = `command-exec-foreign-agent-${uuidv7()}`

const rootDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "codeline-command-exec-"))
const projectRoot = path.join(rootDirectory, "project")
const projectCommandsPath = path.join(projectRoot, ".agents", "commands")
const globalCommandsPath = path.join(rootDirectory, "global", "commands")
let projectId: string

const configuration = {
  authMode: "development" as const,
  databaseUrl,
  developmentIdentity: { displayName: "Command Exec User", identityKey },
  nodeEnv: "development" as const,
  oidcOrganizationId: userId,
}
const journalCursorCodec = journalCursorCodecCreate({ randomBytes, secret: `command-exec-${uuidv7()}` })
if (!journalCursorCodec.success) throw new Error(journalCursorCodec.errorMessage)
const testDevelopmentIdentityUpsert = async () =>
  createResult({ displayName: configuration.developmentIdentity.displayName, id: userId } as never)

const configurationStore = {
  gitStore: {} as never,
  snapshot: {
    configuration: {
      agentConfigurations: [
        {
          configuration: { model: "command-exec-deterministic", provider: "deterministic" },
          target: { agentId, serverId },
        },
        {
          configuration: { model: "command-exec-deterministic", provider: "deterministic" },
          target: { agentId: subagentId, serverId },
        },
      ],
      version: 1,
    },
    revision: "command-exec-configuration-revision",
  },
} satisfies ConfigurationStore

const appOptions = {
  ...appSseTestDependenciesCreate(journalCursorCodec.data),
  configuration,
  database,
  developmentIdentityUpsert: testDevelopmentIdentityUpsert,
  globalCommandsPath,
  journalCursorCodec: journalCursorCodec.data,
  projectRootDirs: [rootDirectory],
}
const app = appCreate({ ...appOptions, sessionChatAdapter: sessionChatAdapterCreate })
const runApp = appCreate({ ...appOptions, configurationStore })

async function commandWrite(relativePath: string, frontmatter: readonly string[], body: string): Promise<void> {
  const filePath = path.join(projectCommandsPath, relativePath)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, ["---", ...frontmatter, "---", body].join("\n"), "utf8")
}

async function sessionCreateRequest(
  target: typeof app,
  body: Record<string, unknown>,
): Promise<{ body: unknown; status: number }> {
  const response = await target.request("http://codeline.test/api/sessions", {
    body: JSON.stringify({
      clientRequestId: `command-exec-${uuidv7()}`,
      metadata: {},
      primaryAgentId: agentId,
      projectId,
      projectPath: projectRoot,
      serverId,
      title: "Command execution session",
      ...body,
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  return { body: await response.json(), status: response.status }
}

async function chatRequest(
  target: typeof app,
  sessionId: string,
  body: Record<string, unknown>,
): Promise<{ body: unknown; status: number }> {
  const runId = `command-exec-run-${uuidv7()}`
  const response = await target.request(`http://codeline.test/api/sessions/${sessionId}/chat`, {
    body: JSON.stringify({ runId, threadId: sessionId, ...body }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  return { body: await response.json(), status: response.status }
}

async function messagesAwait(sessionId: string, minimum: number) {
  let messages = await database.select().from(messageTable).where(eq(messageTable.sessionId, sessionId))
  for (let attempt = 0; attempt < 200 && messages.length < minimum; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5))
    messages = await database.select().from(messageTable).where(eq(messageTable.sessionId, sessionId))
  }
  return messages
}

beforeAll(async () => {
  await fs.mkdir(projectCommandsPath, { recursive: true })
  await fs.mkdir(globalCommandsPath, { recursive: true })
  await commandWrite("review.md", ["description: Review a change"], "Review $1 and $2 carefully.")
  await commandWrite("audit.md", ["description: Audit"], "Run the audit.")
  await commandWrite("shell.md", ["description: Shell"], "Value is !`printf interpolated`.")
  await commandWrite("modelled.md", ["description: Modelled", "model: command-exec-override-model"], "Modelled body.")
  await commandWrite("badmodel.md", ["description: Bad model", "model: unknown-provider/thing"], "Bad model body.")
  await commandWrite("delegated.md", ["description: Delegated", "subtask: true"], "Delegate this work.")
  await commandWrite(
    "delegated-agent.md",
    ["description: Delegated to another agent", "subtask: true", `agent: ${subagentId}`],
    "Delegate to the subagent.",
  )
  await commandWrite(
    "foreign-agent.md",
    ["description: Foreign", "subtask: true", `agent: ${otherServerAgentId}`],
    "Delegate to an unselectable agent.",
  )

  if (!databaseAvailable) return
  const user = await developmentIdentityUpsert(database, { displayName: "Command Exec User", identityKey })
  if (!user.success) throw new Error(user.errorMessage)
  await database.insert(organizationTable).values({ externalId: userId, id: userId, name: "Command Exec Organization" })
  await database.insert(organizationMemberTable).values({
    issuer: "urn:codeline:development",
    organizationId: userId,
    subject: identityKey,
    userId,
  })
  await database.insert(serverTable).values({
    endpoint: "http://command-exec.test",
    id: serverId,
    name: "Command Exec Server",
    organizationId: userId,
  })
  await database.insert(agentTable).values([
    {
      configuration: { model: "command-exec-deterministic", provider: "deterministic" },
      id: agentId,
      name: "Command Exec Agent",
      role: "coding",
      serverId,
    },
    {
      configuration: { model: "command-exec-deterministic", provider: "deterministic" },
      id: subagentId,
      name: "Command Exec Subagent",
      role: "review",
      serverId,
    },
  ])

  const registered = await projectRegistryRepositoryUpsert(database, userId, { path: projectRoot })
  if (!registered.success) throw new Error(registered.errorMessage)
  projectId = registered.data.id
})

afterAll(async () => {
  if (databaseAvailable) await database.delete(applicationUserTable).where(eq(applicationUserTable.id, userId))
  await databaseConnectionClose(connection)
  await fs.rm(rootDirectory, { force: true, recursive: true })
})

afterEach(async () => {
  if (databaseAvailable) await database.delete(sessionTable).where(eq(sessionTable.userId, userId))
})

test.skipIf(!databaseAvailable)(
  "a pre-session command is expanded, persisted in session metadata, and captured in the immutable manifest",
  async () => {
    const created = await sessionCreateRequest(app, {
      command: { arguments: 'alpha "beta gamma"', name: "review" },
    })
    expect(created.status).toBe(201)
    const sessionId = (created.body as { session: { id: string } }).session.id

    const [session] = await database.select().from(sessionTable).where(eq(sessionTable.id, sessionId))
    expect(session?.metadata).toMatchObject({
      command: {
        argumentsText: 'alpha "beta gamma"',
        expandedUserText: "Review alpha and beta gamma carefully.",
        name: "review",
        overrides: {},
        version: 1,
      },
    })
    const metadata = session?.metadata as { command: { catalogDigest: string; templateDigest: string } }
    expect(metadata.command.catalogDigest).toMatch(/^sha256-[a-f0-9]{64}$/)
    expect(metadata.command.templateDigest).toMatch(/^sha256-[a-f0-9]{64}$/)

    // The manifest captures command identity and the catalog digest, not a template reference alone.
    expect(session?.executionManifest?.command).toMatchObject({
      name: "review",
      templateDigest: metadata.command.templateDigest,
      version: 1,
    })
    expect(session?.executionManifest?.commandCatalog.digest).toBe(metadata.command.catalogDigest)
  },
)

test.skipIf(!databaseAvailable)(
  "an unknown pre-session command is rejected before the session is inserted",
  async () => {
    const clientRequestId = `command-exec-missing-${uuidv7()}`
    const created = await sessionCreateRequest(app, {
      clientRequestId,
      command: { arguments: "", name: "does-not-exist" },
    })

    expect(created.status).toBe(400)
    expect(
      await database.select().from(sessionTable).where(eq(sessionTable.clientRequestId, clientRequestId)),
    ).toHaveLength(0)
  },
)

test.skipIf(!databaseAvailable)(
  "an invalid pre-session model override is rejected before the session is inserted",
  async () => {
    const clientRequestId = `command-exec-badmodel-${uuidv7()}`
    const created = await sessionCreateRequest(app, {
      clientRequestId,
      command: { arguments: "", name: "badmodel" },
    })

    expect(created.status).toBe(400)
    expect(
      await database.select().from(sessionTable).where(eq(sessionTable.clientRequestId, clientRequestId)),
    ).toHaveLength(0)
  },
)

test.skipIf(!databaseAvailable)(
  "a pre-session model override is validated and captured in the session manifest",
  async () => {
    const created = await sessionCreateRequest(app, { command: { arguments: "", name: "modelled" } })
    expect(created.status).toBe(201)
    const sessionId = (created.body as { session: { id: string } }).session.id

    const [session] = await database.select().from(sessionTable).where(eq(sessionTable.id, sessionId))
    expect(session?.metadata).toMatchObject({
      command: {
        execution: { agentId, model: "command-exec-override-model", provider: "deterministic" },
        name: "modelled",
        overrides: { model: "command-exec-override-model" },
      },
    })
    expect(session?.executionManifest?.command).toMatchObject({
      model: "command-exec-override-model",
      name: "modelled",
    })
  },
)

test.skipIf(!databaseAvailable)("a pre-session subtask command whose agent is not selectable is rejected", async () => {
  const clientRequestId = `command-exec-foreign-${uuidv7()}`
  const created = await sessionCreateRequest(app, {
    clientRequestId,
    command: { arguments: "", name: "foreign-agent" },
  })

  expect(created.status).toBe(400)
  expect(
    await database.select().from(sessionTable).where(eq(sessionTable.clientRequestId, clientRequestId)),
  ).toHaveLength(0)
})

test.skipIf(!databaseAvailable)(
  "a pre-session subtask command with a selectable subagent is accepted and keeps the primary agent",
  async () => {
    const created = await sessionCreateRequest(app, {
      command: { arguments: "", name: "delegated-agent" },
      executionSelection: {
        tools: {
          primary: { agentId, tools: { bash: false, webfetch: false } },
          selectableSubagents: [{ agentId: subagentId, tools: { bash: false, webfetch: false } }],
        },
        version: 1,
      },
    })
    expect(created.status).toBe(201)
    const sessionId = (created.body as { session: { id: string } }).session.id

    const [session] = await database.select().from(sessionTable).where(eq(sessionTable.id, sessionId))
    // A subtask override delegates without changing the session's primary agent.
    expect(session?.primaryAgentId).toBe(agentId)
    expect(session?.executionSelection?.tools.primary.agentId).toBe(agentId)
    expect(session?.executionManifest?.command).toMatchObject({
      agent: subagentId,
      name: "delegated-agent",
      subtask: true,
    })
  },
)

test.skipIf(!databaseAvailable)(
  "pre-session shell interpolation runs through the enabled bash tool and persists the resolved text",
  async () => {
    const created = await sessionCreateRequest(app, {
      command: { arguments: "", name: "shell" },
      executionSelection: {
        tools: { primary: { agentId, tools: { bash: true, webfetch: false } }, selectableSubagents: [] },
        version: 1,
      },
    })
    expect(created.status).toBe(201)
    const sessionId = (created.body as { session: { id: string } }).session.id

    const [session] = await database.select().from(sessionTable).where(eq(sessionTable.id, sessionId))
    expect(session?.metadata).toMatchObject({
      command: { expandedUserText: "Value is interpolated.", name: "shell" },
    })
  },
)

test.skipIf(!databaseAvailable)("pre-session shell interpolation is rejected when bash is disabled", async () => {
  const clientRequestId = `command-exec-shell-disabled-${uuidv7()}`
  const created = await sessionCreateRequest(app, {
    clientRequestId,
    command: { arguments: "", name: "shell" },
    executionSelection: {
      tools: { primary: { agentId, tools: { bash: false, webfetch: false } }, selectableSubagents: [] },
      version: 1,
    },
  })

  expect(created.status).toBe(400)
  expect(
    await database.select().from(sessionTable).where(eq(sessionTable.clientRequestId, clientRequestId)),
  ).toHaveLength(0)
})

test.skipIf(!databaseAvailable)(
  "an existing-session command turn persists the expansion and command metadata on the user message",
  async () => {
    const created = await sessionCreateRequest(app, {})
    expect(created.status).toBe(201)
    const sessionId = (created.body as { session: { id: string } }).session.id

    const chat = await chatRequest(app, sessionId, {
      command: { arguments: 'alpha "beta gamma"', name: "review" },
      messages: [{ content: '/review alpha "beta gamma"', id: `prompt-${uuidv7()}`, role: "user" }],
    })
    expect(chat.status).toBe(200)

    const messages = await messagesAwait(sessionId, 2)
    // The expanded text is persisted, not the raw slash invocation.
    expect(messages[0]).toMatchObject({ content: "Review alpha and beta gamma carefully.", role: "user" })
    expect(messages[0]?.metadata).toMatchObject({
      command: {
        argumentsText: 'alpha "beta gamma"',
        expandedUserText: "Review alpha and beta gamma carefully.",
        name: "review",
        version: 1,
      },
    })
    expect(messages[1]).toMatchObject({
      content: "Deterministic response: Review alpha and beta gamma carefully.",
      role: "assistant",
    })
  },
)

test.skipIf(!databaseAvailable)(
  "a slash invocation typed as plain prose is parsed, expanded, and implicitly appends its arguments",
  async () => {
    const created = await sessionCreateRequest(app, {})
    const sessionId = (created.body as { session: { id: string } }).session.id

    const chat = await chatRequest(app, sessionId, {
      messages: [{ content: "/audit the parser", id: `prompt-${uuidv7()}`, role: "user" }],
    })
    expect(chat.status).toBe(200)

    const messages = await messagesAwait(sessionId, 2)
    expect(messages[0]).toMatchObject({ content: "Run the audit.\n\nthe parser", role: "user" })
    expect(messages[0]?.metadata).toMatchObject({ command: { argumentsText: "the parser", name: "audit" } })
  },
)

test.skipIf(!databaseAvailable)("an unknown command in an existing session is rejected without a run", async () => {
  const created = await sessionCreateRequest(app, {})
  const sessionId = (created.body as { session: { id: string } }).session.id

  const chat = await chatRequest(app, sessionId, {
    messages: [{ content: "/does-not-exist", id: `prompt-${uuidv7()}`, role: "user" }],
  })

  expect(chat.status).toBe(400)
  expect(chat.body).toMatchObject({ error: { message: "The requested command could not be found." } })
  expect(await database.select().from(messageTable).where(eq(messageTable.sessionId, sessionId))).toHaveLength(0)
})

test.skipIf(!databaseAvailable)(
  "an existing-session interpolation command is rejected when bash is disabled for the session",
  async () => {
    const created = await sessionCreateRequest(app, {
      executionSelection: {
        tools: { primary: { agentId, tools: { bash: false, webfetch: false } }, selectableSubagents: [] },
        version: 1,
      },
    })
    const sessionId = (created.body as { session: { id: string } }).session.id

    const chat = await chatRequest(app, sessionId, {
      messages: [{ content: "/shell", id: `prompt-${uuidv7()}`, role: "user" }],
    })

    expect(chat.status).toBe(400)
    expect(chat.body).toMatchObject({ error: { message: expect.stringContaining("bash") } })
    expect(await database.select().from(messageTable).where(eq(messageTable.sessionId, sessionId))).toHaveLength(0)
  },
)

test.skipIf(!databaseAvailable)(
  "a command catalog change after session creation is refused as a conflict",
  async () => {
    const created = await sessionCreateRequest(app, {})
    const sessionId = (created.body as { session: { id: string } }).session.id

    await commandWrite("audit.md", ["description: Audit"], "Run the CHANGED audit.")
    try {
      const chat = await chatRequest(app, sessionId, {
        messages: [{ content: "/audit now", id: `prompt-${uuidv7()}`, role: "user" }],
      })
      expect(chat.status).toBe(409)
      expect(chat.body).toMatchObject({ error: { message: expect.stringContaining("catalog changed") } })
    } finally {
      await commandWrite("audit.md", ["description: Audit"], "Run the audit.")
    }
  },
)

test.skipIf(!databaseAvailable)(
  "an existing-session model override is forwarded into the durable run snapshot",
  async () => {
    const created = await sessionCreateRequest(runApp, {})
    const sessionId = (created.body as { session: { id: string } }).session.id

    const chat = await chatRequest(runApp, sessionId, {
      messages: [{ content: "/modelled", id: `prompt-${uuidv7()}`, role: "user" }],
    })
    expect(chat.status).toBe(200)

    const [run] = await database.select().from(runTable).where(eq(runTable.sessionId, sessionId))
    expect(run?.snapshot.configuration.model).toBe("command-exec-override-model")
    const attempts = await database
      .select()
      .from(attemptTable)
      .where(eq(attemptTable.runId, run?.id ?? ""))
    expect(attempts[0]?.snapshot.configuration.model).toBe("command-exec-override-model")
  },
)

test.skipIf(!databaseAvailable)(
  "an existing-session subtask command with an unselectable agent is rejected without a run",
  async () => {
    const created = await sessionCreateRequest(runApp, {
      executionSelection: {
        tools: { primary: { agentId, tools: { bash: false, webfetch: false } }, selectableSubagents: [] },
        version: 1,
      },
    })
    const sessionId = (created.body as { session: { id: string } }).session.id

    const chat = await chatRequest(runApp, sessionId, {
      messages: [{ content: "/delegated-agent", id: `prompt-${uuidv7()}`, role: "user" }],
    })

    expect(chat.status).toBe(400)
    expect(await database.select().from(runTable).where(eq(runTable.sessionId, sessionId))).toHaveLength(0)
  },
)

test.skipIf(!databaseAvailable)(
  "a chat request rejects a malformed slash invocation before touching the catalog",
  async () => {
    const created = await sessionCreateRequest(app, {})
    const sessionId = (created.body as { session: { id: string } }).session.id

    const chat = await chatRequest(app, sessionId, {
      messages: [{ content: "/Review", id: `prompt-${uuidv7()}`, role: "user" }],
    })

    expect(chat.status).toBe(400)
    expect(await database.select().from(messageTable).where(eq(messageTable.sessionId, sessionId))).toHaveLength(0)
  },
)
