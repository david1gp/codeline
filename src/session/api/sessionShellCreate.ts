import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import type { SessionExecutionSelection } from "../schema/sessionExecutionSelectionSchema.js"
import { sessionExecutionResourceSummaryCreate } from "./sessionExecutionResourceSummaryCreate.js"
import { type SessionShell, sessionShellSchema } from "./sessionShellSchema.js"

type SessionShellSource = {
  agentPrompt?: string | null
  archivedAt: Date | string | null
  createdAt: Date | string
  executionManifest?: unknown
  executionSelection?: SessionExecutionSelection | null
  id: string
  metadata: unknown
  parentSessionId: string | null
  pinned: boolean
  primaryAgentId: string
  projectPath: string
  revision: number
  serverId: string
  title: string
  updatedAt: Date | string
}

export function sessionShellCreate(session: SessionShellSource): Result<SessionShell> {
  const op = "sessionShellCreate"
  const archivedAt = sessionTimestampSerialize(session.archivedAt)
  const createdAt = sessionTimestampSerialize(session.createdAt)
  const updatedAt = sessionTimestampSerialize(session.updatedAt)
  if (createdAt === undefined || updatedAt === undefined || (session.archivedAt !== null && archivedAt === undefined))
    return createResultError(op, "The session representation timestamp is invalid.")

  const executionResources = sessionExecutionResourceSummaryCreate({
    executionManifest: session.executionManifest,
    projectPath: session.projectPath,
  })
  if (!executionResources.success) return createResultError(op, "The session execution resource summary is invalid.")

  const parsed = v.safeParse(sessionShellSchema, {
    archivedAt: archivedAt ?? null,
    agentPrompt: session.agentPrompt ?? null,
    createdAt,
    executionResources: executionResources.data,
    executionSelection: session.executionSelection ?? null,
    id: session.id,
    metadata: session.metadata,
    parentSessionId: session.parentSessionId,
    pinned: session.pinned,
    primaryAgentId: session.primaryAgentId,
    projectPath: session.projectPath,
    revision: session.revision,
    serverId: session.serverId,
    title: session.title,
    updatedAt,
  })
  if (!parsed.success) return createResultError(op, "The session representation is invalid.")
  return createResult(parsed.output)
}

function sessionTimestampSerialize(value: Date | string | null): string | null | undefined {
  if (value === null) return null
  if (typeof value === "string") return value
  if (Number.isNaN(value.getTime())) return undefined
  return value.toISOString()
}
