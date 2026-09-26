import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { eq, inArray } from "drizzle-orm"
import { agentTable } from "../../agents/db/agentTable.js"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { exampleDataFixture } from "../../database/exampleDataFixture.js"
import { messageTable } from "../../message/db/messageTable.js"
import { projectFolderTable } from "../../project/db/projectFolderTable.js"
import { projectTable } from "../../project/db/projectTable.js"
import { attemptTable } from "../../run/db/attemptTable.js"
import { runDelegationTable } from "../../run/db/runDelegationTable.js"
import { runFinalizedDetailTable } from "../../run/db/runFinalizedDetailTable.js"
import { runHistoryEntryPayloadCreate } from "../../run/db/runHistoryEntryPayloadCreate.js"
import { runTable } from "../../run/db/runTable.js"
import { serverTable } from "../../servers/db/serverTable.js"
import { sessionHistoryEntryRepositoryUpsert } from "../../session/db/sessionHistoryEntryRepositoryUpsert.js"
import { sessionHistoryEntryTable } from "../../session/db/sessionHistoryEntryTable.js"
import { sessionTable } from "../../session/db/sessionTable.js"
import { sessionViewTable } from "../../session/db/sessionViewTable.js"
import { uuidv7 } from "../../uuid/uuidv7.js"
import { e2eFixtureRunTable } from "../db/e2eFixtureRunTable.js"
import { e2eSampleSessionsTable } from "../db/e2eSampleSessionsTable.js"
import { e2eSampleProjectPathsOperate } from "./e2eSampleProjectPathsOperate.js"

type Run = typeof e2eFixtureRunTable.$inferSelect
type Mapping = Record<string, string>
type Operation = "issue" | "status" | "purge-status" | "remove"

const date = (value: string) => new Date(value)
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
  stream: [
    ...new Set([
      ...exampleDataFixture.runs.map((item) => item.streamId),
      ...exampleDataFixture.attempts.map((item) => item.streamId),
    ]),
  ],
  attempt: exampleDataFixture.attempts.map((item) => item.id),
  delegation: exampleDataFixture.delegations.map((item) => item.id),
  tool: [
    ...exampleDataFixture.tools.map((item) => item.toolCallId),
    ...exampleDataFixture.delegations.map((item) => item.delegationKey),
  ],
} as const

function manifestCreate(runId: string): Mapping {
  const mapping: Mapping = {}
  for (const [kind, ids] of Object.entries(sources)) {
    for (const source of ids) {
      const key = `${kind}:${source}`
      mapping[key] =
        kind === "project" || kind === "folder"
          ? uuidv7()
          : kind === "path"
            ? `${source}/.e2e-${runId}`
            : `e2e-${runId}-${source}`
    }
  }
  return mapping
}

function manifestValid(runId: string, mapping: Mapping): boolean {
  const expected = manifestCreate(runId)
  const keys = Object.keys(expected)
  if (Object.keys(mapping).length !== keys.length || new Set(Object.values(mapping)).size !== keys.length) return false
  return keys.every((key) => {
    const value = mapping[key]
    if (key.startsWith("project:") || key.startsWith("folder:"))
      return (
        typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)
      )
    return value === expected[key]
  })
}

/** Operates only on an already verified run marker, inside the caller's transaction. */
export async function e2eSampleSessionsOperate(
  database: DatabaseExecutor,
  run: Run,
  operation: Operation,
  now = new Date(),
  createdPaths: string[] = [],
): Promise<Result<{ exists: boolean; createdAt?: string; userId?: string; mapping?: Mapping }>> {
  const op = "e2eSampleSessionsOperate"
  try {
    const [stored] = await database
      .select()
      .from(e2eSampleSessionsTable)
      .where(eq(e2eSampleSessionsTable.runId, run.runId))
    if (operation === "remove") {
      if (stored === undefined) return createResult({ exists: false })
      // The caller has verified the entire manifest before deleting the owning user.
      const mapping = stored.mapping
      const paths = await e2eSampleProjectPathsOperate(run.runId, mapping, "remove")
      if (!paths.success) return paths
      await database.delete(agentTable).where(
        inArray(
          agentTable.id,
          sources.agent.map((id) => mapping[`agent:${id}`]!),
        ),
      )
      await database.delete(serverTable).where(
        inArray(
          serverTable.id,
          sources.server.map((id) => mapping[`server:${id}`]!),
        ),
      )
      await database.delete(e2eSampleSessionsTable).where(eq(e2eSampleSessionsTable.runId, run.runId))
      const remaining = await database
        .select()
        .from(serverTable)
        .where(
          inArray(
            serverTable.id,
            sources.server.map((id) => mapping[`server:${id}`]!),
          ),
        )
      if (remaining.length !== 0) return createResultError(op, "The sample servers were not removed.")
      return createResult({ exists: false })
    }
    if (operation === "issue" && stored === undefined) {
      const mapping = manifestCreate(run.runId)
      const paths = await e2eSampleProjectPathsOperate(run.runId, mapping, "issue", createdPaths)
      if (!paths.success) return paths
      const id = (kind: keyof typeof sources, source: string): string => mapping[`${kind}:${source}`]!
      for (const server of exampleDataFixture.servers) {
        await database.insert(serverTable).values({
          ...server,
          id: id("server", server.id),
          organizationId: run.organizationId,
          name: `${server.name} E2E ${run.runId}`,
          createdAt: date(server.createdAt),
          updatedAt: date(server.updatedAt),
        })
      }
      for (const agent of exampleDataFixture.agents) {
        await database.insert(agentTable).values({
          ...agent,
          id: id("agent", agent.id),
          serverId: id("server", agent.serverId),
          createdAt: date(agent.createdAt),
          updatedAt: date(agent.updatedAt),
        })
      }
      // Identity issuance bootstraps these folders for the newly issued member.
      const existingFolders = await database
        .select()
        .from(projectFolderTable)
        .where(eq(projectFolderTable.userId, run.firstUserId))
      if (
        existingFolders.length !== sources.folder.length ||
        existingFolders.some(
          (row) =>
            row.bootstrapKey === null ||
            row.name !== row.bootstrapKey ||
            !sources.folder.includes(row.bootstrapKey) ||
            row.createdAt.getTime() < run.createdAt.getTime() - 1000,
        )
      )
        return createResultError(op, "The sample member's bootstrap folders could not be verified.")
      for (const folder of existingFolders) mapping[`folder:${folder.bootstrapKey}`] = folder.id
      for (const project of exampleDataFixture.projects) {
        await database.insert(projectTable).values({
          id: id("project", project.id),
          userId: run.firstUserId,
          path: id("path", project.path),
          displayName: project.displayName,
          parentFolderId: id("folder", project.folderKey),
          createdAt: date(project.createdAt),
          updatedAt: date(project.updatedAt),
        })
      }
      for (const session of exampleDataFixture.sessions) {
        await database.insert(sessionTable).values({
          id: id("session", session.id),
          userId: run.firstUserId,
          serverId: id("server", session.serverId),
          primaryAgentId: id("agent", session.primaryAgentId),
          projectPath: id("path", session.projectPath),
          parentSessionId: session.parentSessionId === null ? null : id("session", session.parentSessionId),
          title: session.title,
          pinned: session.pinned,
          metadata: session.metadata,
          clientRequestId: id("sessionRequest", session.clientRequestId),
          archivedAt: session.archivedAt === null ? null : date(session.archivedAt),
          createdAt: date(session.createdAt),
          updatedAt: date(session.updatedAt),
        })
        for (const message of session.messages) {
          const messageId = id("message", message.id)
          await database.insert(messageTable).values({
            ...message,
            id: messageId,
            sessionId: id("session", session.id),
            agentId: id("agent", session.primaryAgentId),
            clientRequestId: id("messageRequest", message.clientRequestId),
            finalizedAt: date(message.finalizedAt),
            createdAt: date(message.createdAt),
          })
          const history = await sessionHistoryEntryRepositoryUpsert(
            database,
            run.firstUserId,
            id("session", session.id),
            {
              id: messageId,
              kind: "message",
              sourceType: "message",
              sourceId: messageId,
              payload: {
                id: messageId,
                sessionId: id("session", session.id),
                agentId: id("agent", session.primaryAgentId),
                role: message.role,
                sequence: message.sequence,
                content: message.content,
                clientRequestId: id("messageRequest", message.clientRequestId),
                metadata: message.metadata,
                finalizedAt: message.finalizedAt,
                createdAt: message.createdAt,
              },
            },
          )
          if (!history.success) return history
        }
      }
      for (const sample of exampleDataFixture.runs) {
        const runId = id("run", sample.id)
        const sessionId = id("session", sample.sessionId)
        const snapshot = {
          ...sample.snapshot,
          target: {
            agentId: id("agent", sample.snapshot.target.agentId),
            serverId: id("server", sample.snapshot.target.serverId),
          },
        }
        await database.insert(runTable).values({
          id: runId,
          userId: run.firstUserId,
          sessionId,
          clientRunId: id("runClient", sample.clientRunId),
          streamId: id("stream", sample.streamId),
          status: sample.status,
          snapshot,
          budget: sample.budget,
          deadlineAt: date(sample.deadlineAt),
          failure: sample.failure,
          cancellationKind: sample.cancellationKind,
          cancellationRequestedAt:
            sample.cancellationRequestedAt === null ? null : date(sample.cancellationRequestedAt),
          cancellationSourceRunId:
            sample.cancellationSourceRunId === null ? null : id("run", sample.cancellationSourceRunId),
          startedAt: date(sample.startedAt),
          finishedAt: date(sample.finishedAt),
          createdAt: date(sample.createdAt),
          updatedAt: date(sample.updatedAt),
        })
        const history = await sessionHistoryEntryRepositoryUpsert(database, run.firstUserId, sessionId, {
          kind: "run",
          sourceType: "run",
          sourceId: runId,
          payload: runHistoryEntryPayloadCreate({ id: runId, status: sample.status, terminalKind: sample.outcome }),
        })
        if (!history.success) return history
      }
      for (const sample of exampleDataFixture.attempts) {
        await database.insert(attemptTable).values({
          id: id("attempt", sample.id),
          userId: run.firstUserId,
          runId: id("run", sample.runId),
          sessionId: id("session", sample.sessionId),
          ordinal: sample.ordinal,
          streamId: id("stream", sample.streamId),
          status: sample.status,
          snapshot: {
            ...sample.snapshot,
            target: {
              agentId: id("agent", sample.snapshot.target.agentId),
              serverId: id("server", sample.snapshot.target.serverId),
            },
          },
          budget: sample.budget,
          failure: sample.failure,
          startedAt: date(sample.startedAt),
          finishedAt: date(sample.finishedAt),
          createdAt: date(sample.createdAt),
          updatedAt: date(sample.updatedAt),
        })
      }
      for (const delegation of exampleDataFixture.delegations) {
        const parent = exampleDataFixture.runs.find((item) => item.id === delegation.parentRunId)!
        await database.insert(runDelegationTable).values({
          ...delegation,
          id: id("delegation", delegation.id),
          userId: run.firstUserId,
          sessionId: id("session", parent.sessionId),
          childRunId: id("run", delegation.childRunId),
          rootRunId: id("run", delegation.parentRunId),
          parentRunId: id("run", delegation.parentRunId),
          parentAttemptId: id("attempt", delegation.parentAttemptId),
          delegationKey: id("tool", delegation.delegationKey),
          createdAt: date(parent.createdAt),
          updatedAt: date(parent.updatedAt),
        })
      }
      for (const sample of exampleDataFixture.runs) {
        const runId = id("run", sample.id)
        const sessionId = id("session", sample.sessionId)
        const tools = exampleDataFixture.tools
          .filter((tool) => tool.runId === sample.id)
          .map((tool, index) => ({
            detailId: `tool:${runId}:${id("tool", tool.toolCallId)}`,
            toolCallId: id("tool", tool.toolCallId),
            toolName: tool.toolName,
            sequence: index * 3 + 1,
            outcome: tool.outcome,
            output: tool.output,
            result: tool.result,
            workingDirectory: id(
              "path",
              exampleDataFixture.projects.find((project) =>
                project.path.endsWith(tool.workingDirectory.split("/").at(-1)!),
              )!.path,
            ),
          }))
        await database.insert(runFinalizedDetailTable).values({
          runId,
          userId: run.firstUserId,
          sessionId,
          transcript: {
            activities: tools.flatMap((tool) => [
              {
                kind: "tool" as const,
                phase: "started" as const,
                name: tool.toolName,
                toolCallId: tool.toolCallId,
                sequence: tool.sequence,
              },
              {
                kind: "tool" as const,
                phase: "output" as const,
                name: tool.toolName,
                toolCallId: tool.toolCallId,
                sequence: tool.sequence + 1,
                content: tool.output,
                truncated: false,
              },
              {
                kind: "tool" as const,
                phase: "result" as const,
                name: tool.toolName,
                toolCallId: tool.toolCallId,
                sequence: tool.sequence + 2,
                content: tool.result,
                outcome: tool.outcome,
                truncated: false,
                workingDirectory: tool.workingDirectory,
              },
            ]),
            assistantText:
              exampleDataFixture.delegations.find((delegation) => delegation.childRunId === sample.id)?.finalizedResult
                .text ?? "",
            attempts: [{ ordinal: 1, status: sample.status }],
            cancellation: sample.cancellationKind === null ? null : { kind: sample.cancellationKind },
            failure: sample.failure,
            invariantViolations: [],
            terminalOutcome:
              sample.status === "succeeded"
                ? { status: "completed" }
                : sample.status === "failed"
                  ? { status: "failed", failure: sample.failure ?? undefined }
                  : { status: "aborted" },
          },
          tools,
          createdAt: date(sample.finishedAt),
        })
        for (const tool of tools) {
          const history = await sessionHistoryEntryRepositoryUpsert(database, run.firstUserId, sessionId, {
            kind: "tool",
            sourceType: "tool",
            sourceId: runId,
            sourceDetailId: tool.toolCallId,
            payload: {
              id: `history:${tool.detailId}`,
              kind: "tool",
              runId,
              detailId: tool.detailId,
              toolCallId: tool.toolCallId,
              toolName: tool.toolName,
              outcome: tool.outcome,
              outputAvailable: true,
              resultAvailable: true,
              sequence: tool.sequence,
              summary: `${tool.toolName} · ${tool.outcome}`,
              workingDirectory: tool.workingDirectory,
            },
          })
          if (!history.success) return history
        }
      }
      for (const delegation of exampleDataFixture.delegations) {
        const parent = exampleDataFixture.runs.find((item) => item.id === delegation.parentRunId)!
        const parentRunId = id("run", parent.id)
        const key = id("tool", delegation.delegationKey)
        const history = await sessionHistoryEntryRepositoryUpsert(
          database,
          run.firstUserId,
          id("session", parent.sessionId),
          {
            kind: "tool",
            sourceType: "tool",
            sourceId: parentRunId,
            sourceDetailId: key,
            payload: {
              id: `history:${parentRunId}:${key}`,
              kind: "tool",
              runId: parentRunId,
              detailId: `tool:${parentRunId}:${key}`,
              toolCallId: key,
              toolName: "delegate_task",
              childRunId: id("run", delegation.childRunId),
              delegationId: id("delegation", delegation.id),
              delegationStatus: delegation.finalizedResult.status,
              parentSessionId: id("session", parent.sessionId),
              summary: "delegate_task · success",
            },
          },
        )
        if (!history.success) return history
      }
      for (const view of exampleDataFixture.sessionViews) {
        await database.insert(sessionViewTable).values({
          userId: run.firstUserId,
          sessionId: id("session", view.sessionId),
          acknowledgedFinishedAt: date(view.acknowledgedFinishedAt),
          createdAt: date(view.createdAt),
          updatedAt: date(view.updatedAt),
        })
      }
      await database.insert(e2eSampleSessionsTable).values({
        runId: run.runId,
        userId: run.firstUserId,
        issuer: run.issuer,
        organizationId: run.organizationId,
        createdAt: now,
        mapping,
      })
      return createResult({ exists: true, createdAt: now.toISOString(), userId: run.firstUserId, mapping })
    }
    if (stored === undefined) return createResult({ exists: false })
    const map = stored.mapping
    if (
      stored.userId !== run.firstUserId ||
      stored.issuer !== run.issuer ||
      stored.organizationId !== run.organizationId ||
      !manifestValid(run.runId, map)
    )
      return createResultError(op, "Sample ownership manifest is invalid.")
    const checks = await Promise.all([
      database
        .select()
        .from(serverTable)
        .where(
          inArray(
            serverTable.id,
            sources.server.map((id) => map[`server:${id}`]!),
          ),
        ),
      database
        .select()
        .from(agentTable)
        .where(
          inArray(
            agentTable.id,
            sources.agent.map((id) => map[`agent:${id}`]!),
          ),
        ),
      database
        .select()
        .from(projectTable)
        .where(
          inArray(
            projectTable.id,
            sources.project.map((id) => map[`project:${id}`]!),
          ),
        ),
      database
        .select()
        .from(projectFolderTable)
        .where(
          inArray(
            projectFolderTable.id,
            sources.folder.map((id) => map[`folder:${id}`]!),
          ),
        ),
      database
        .select()
        .from(sessionTable)
        .where(
          inArray(
            sessionTable.id,
            sources.session.map((id) => map[`session:${id}`]!),
          ),
        ),
      database
        .select()
        .from(messageTable)
        .where(
          inArray(
            messageTable.id,
            sources.message.map((id) => map[`message:${id}`]!),
          ),
        ),
      database
        .select()
        .from(runTable)
        .where(
          inArray(
            runTable.id,
            sources.run.map((id) => map[`run:${id}`]!),
          ),
        ),
      database
        .select()
        .from(attemptTable)
        .where(
          inArray(
            attemptTable.id,
            sources.attempt.map((id) => map[`attempt:${id}`]!),
          ),
        ),
      database
        .select()
        .from(runDelegationTable)
        .where(
          inArray(
            runDelegationTable.id,
            sources.delegation.map((id) => map[`delegation:${id}`]!),
          ),
        ),
    ])
    if (
      checks.some(
        (rows, index) =>
          rows.length !==
          [
            sources.server.length,
            sources.agent.length,
            sources.project.length,
            sources.folder.length,
            sources.session.length,
            sources.message.length,
            sources.run.length,
            sources.attempt.length,
            sources.delegation.length,
          ][index],
      )
    )
      return createResultError(op, "Sample rows are missing.")
    const [servers, agents, projects, folders, sessions, messages, runs, attempts, delegations] = checks
    const id = (kind: keyof typeof sources, source: string) => map[`${kind}:${source}`]!
    if (
      exampleDataFixture.servers.some((source) => {
        const row = servers!.find((item) => item.id === id("server", source.id))
        return row?.organizationId !== run.organizationId || row.name !== `${source.name} E2E ${run.runId}`
      }) ||
      exampleDataFixture.agents.some((source) => {
        const row = agents!.find((item) => item.id === id("agent", source.id))
        return row?.serverId !== id("server", source.serverId) || row.name !== source.name
      }) ||
      exampleDataFixture.projects.some((source) => {
        const row = projects!.find((item) => item.id === id("project", source.id))
        return (
          row?.userId !== run.firstUserId ||
          row.path !== id("path", source.path) ||
          row.parentFolderId !== id("folder", source.folderKey)
        )
      }) ||
      exampleDataFixture.projects.some((source) => {
        const row = folders!.find((item) => item.id === id("folder", source.folderKey))
        return row?.userId !== run.firstUserId || row.bootstrapKey !== source.folderKey
      }) ||
      exampleDataFixture.sessions.some((source) => {
        const row = sessions!.find((item) => item.id === id("session", source.id))
        return (
          row?.userId !== run.firstUserId ||
          row.serverId !== id("server", source.serverId) ||
          row.primaryAgentId !== id("agent", source.primaryAgentId) ||
          row.projectPath !== id("path", source.projectPath) ||
          row.parentSessionId !== (source.parentSessionId === null ? null : id("session", source.parentSessionId))
        )
      }) ||
      exampleDataFixture.sessions.some((source) =>
        source.messages.some((message) => {
          const row = messages!.find((item) => item.id === id("message", message.id))
          return row?.sessionId !== id("session", source.id) || row.agentId !== id("agent", source.primaryAgentId)
        }),
      ) ||
      exampleDataFixture.runs.some((source) => {
        const row = runs!.find((item) => item.id === id("run", source.id))
        return (
          row?.userId !== run.firstUserId ||
          row.sessionId !== id("session", source.sessionId) ||
          row.snapshot.target.agentId !== id("agent", source.snapshot.target.agentId) ||
          row.snapshot.target.serverId !== id("server", source.snapshot.target.serverId)
        )
      }) ||
      exampleDataFixture.attempts.some((source) => {
        const row = attempts!.find((item) => item.id === id("attempt", source.id))
        return (
          row?.userId !== run.firstUserId ||
          row.runId !== id("run", source.runId) ||
          row.sessionId !== id("session", source.sessionId)
        )
      }) ||
      exampleDataFixture.delegations.some((source) => {
        const row = delegations!.find((item) => item.id === id("delegation", source.id))
        return (
          row?.userId !== run.firstUserId ||
          row.childRunId !== id("run", source.childRunId) ||
          row.parentRunId !== id("run", source.parentRunId) ||
          row.parentAttemptId !== id("attempt", source.parentAttemptId) ||
          row.delegationKey !== id("tool", source.delegationKey)
        )
      })
    )
      return createResultError(op, "Sample ownership could not be verified.")
    const [details, histories, views] = await Promise.all([
      database
        .select()
        .from(runFinalizedDetailTable)
        .where(
          inArray(
            runFinalizedDetailTable.runId,
            runs!.map((row) => row.id),
          ),
        ),
      database
        .select()
        .from(sessionHistoryEntryTable)
        .where(
          inArray(
            sessionHistoryEntryTable.sessionId,
            sessions!.map((row) => row.id),
          ),
        ),
      database
        .select()
        .from(sessionViewTable)
        .where(
          inArray(
            sessionViewTable.sessionId,
            sessions!.map((row) => row.id),
          ),
        ),
    ])
    const attachedAgents = await database
      .select()
      .from(agentTable)
      .where(
        inArray(
          agentTable.serverId,
          servers!.map((row) => row.id),
        ),
      )
    const attachedSessions = await database
      .select()
      .from(sessionTable)
      .where(
        inArray(
          sessionTable.serverId,
          servers!.map((row) => row.id),
        ),
      )
    const historyCount = sources.message.length + sources.run.length + sources.tool.length
    if (
      details.length !== sources.run.length ||
      exampleDataFixture.runs.some((source) => {
        const row = details.find((item) => item.runId === id("run", source.id))
        return (
          row?.userId !== run.firstUserId ||
          row.sessionId !== id("session", source.sessionId) ||
          row.tools.length !== exampleDataFixture.tools.filter((tool) => tool.runId === source.id).length
        )
      }) ||
      histories.length < historyCount ||
      histories.some((row) => row.userId !== run.firstUserId) ||
      exampleDataFixture.sessions.some((source) =>
        source.messages.some(
          (message) =>
            !histories.some(
              (row) =>
                row.sessionId === id("session", source.id) &&
                row.sourceType === "message" &&
                row.sourceId === id("message", message.id),
            ),
        ),
      ) ||
      exampleDataFixture.runs.some(
        (source) =>
          !histories.some(
            (row) =>
              row.sessionId === id("session", source.sessionId) &&
              row.sourceType === "run" &&
              row.sourceId === id("run", source.id),
          ),
      ) ||
      exampleDataFixture.tools.some(
        (tool) =>
          !histories.some(
            (row) =>
              row.sourceType === "tool" &&
              row.sourceId === id("run", tool.runId) &&
              row.sourceDetailId === id("tool", tool.toolCallId),
          ),
      ) ||
      exampleDataFixture.delegations.some(
        (delegation) =>
          !histories.some(
            (row) =>
              row.sourceType === "tool" &&
              row.sourceId === id("run", delegation.parentRunId) &&
              row.sourceDetailId === id("tool", delegation.delegationKey),
          ),
      ) ||
      views.length < exampleDataFixture.sessionViews.length ||
      views.some((row) => row.userId !== run.firstUserId) ||
      exampleDataFixture.sessionViews.some(
        (source) =>
          !views.some((row) => row.userId === run.firstUserId && row.sessionId === id("session", source.sessionId)),
      ) ||
      attachedAgents.length !== sources.agent.length ||
      attachedSessions.some((row) => row.userId !== run.firstUserId)
    )
      return createResultError(op, "Sample derived rows could not be verified.")
    // Missing directories are safe to tolerate only for purge, after the complete
    // run-bound manifest and database graph have been verified.
    const paths = await e2eSampleProjectPathsOperate(
      run.runId,
      map,
      operation === "purge-status" ? "purge-status" : "status",
    )
    if (!paths.success) return paths
    return createResult({
      exists: true,
      createdAt: stored.createdAt.toISOString(),
      userId: stored.userId,
      mapping: map,
    })
  } catch (_error) {
    return createResultError(op, "The sample fixture operation failed.")
  }
}
