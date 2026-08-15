import { boolean, createSchema, enumeration, json, number, relationships, string, table } from "@rocicorp/zero"
import type { AttemptStatus } from "../run/schema/attemptStatusSchema.js"
import type { RunCancellationKind } from "../run/schema/runCancellationKindSchema.js"
import type { RunStatus } from "../run/schema/runStatusSchema.js"

const user = table("user")
  .from("user")
  .columns({
    id: string(),
    displayName: string().from("display_name"),
    createdAt: number().from("created_at"),
    updatedAt: number().from("updated_at"),
  })
  .primaryKey("id")

const server = table("server")
  .columns({
    id: string(),
    ownerUserId: string().from("owner_user_id"),
    name: string(),
    endpoint: string(),
    metadata: json(),
    createdAt: number().from("created_at"),
    updatedAt: number().from("updated_at"),
  })
  .primaryKey("id")
  .unique("ownerUserId", "name")

const agent = table("agent")
  .columns({
    id: string(),
    serverId: string().from("server_id"),
    parentAgentId: string().from("parent_agent_id").optional(),
    name: string(),
    role: enumeration<string>(),
    configuration: json(),
    createdAt: number().from("created_at"),
    updatedAt: number().from("updated_at"),
  })
  .primaryKey("id")
  .unique("serverId", "name")

const session = table("session")
  .columns({
    id: string(),
    userId: string().from("user_id"),
    serverId: string().from("server_id"),
    primaryAgentId: string().from("primary_agent_id"),
    projectPath: string().from("project_path"),
    parentSessionId: string().from("parent_session_id").optional(),
    title: string(),
    clientRequestId: string().from("client_request_id"),
    metadata: json(),
    watched: boolean(),
    archivedAt: number().from("archived_at").optional(),
    createdAt: number().from("created_at"),
    updatedAt: number().from("updated_at"),
  })
  .primaryKey("id")
  .unique("userId", "clientRequestId")

const message = table("message")
  .columns({
    id: string(),
    sessionId: string().from("session_id"),
    agentId: string().from("agent_id"),
    role: enumeration<string>(),
    sequence: number(),
    content: string(),
    clientRequestId: string().from("client_request_id"),
    metadata: json(),
    finalizedAt: number().from("finalized_at"),
    createdAt: number().from("created_at"),
  })
  .primaryKey("id")
  .unique("sessionId", "sequence")
  .unique("sessionId", "clientRequestId")

const note = table("note")
  .columns({
    id: string(),
    userId: string().from("user_id"),
    content: string(),
    projectPath: string().from("project_path").optional(),
    sortOrder: number().from("sort_order").optional(),
    createdAt: number().from("created_at"),
    updatedAt: number().from("updated_at"),
  })
  .primaryKey("id")

const run = table("run")
  .from("run")
  .columns({
    id: string(),
    userId: string().from("user_id"),
    sessionId: string().from("session_id"),
    clientRunId: string().from("client_run_id"),
    streamId: string().from("stream_id"),
    status: enumeration<RunStatus>(),
    snapshot: json(),
    budget: json(),
    deadlineAt: number().from("deadline_at"),
    failure: json().optional(),
    cancellationRequestedAt: number().from("cancellation_requested_at").optional(),
    cancellationKind: enumeration<RunCancellationKind>().from("cancellation_kind").optional(),
    cancellationSourceRunId: string().from("cancellation_source_run_id").optional(),
    startedAt: number().from("started_at").optional(),
    finishedAt: number().from("finished_at").optional(),
    createdAt: number().from("created_at"),
    updatedAt: number().from("updated_at"),
  })
  .primaryKey("id")
  .unique("sessionId", "clientRunId")
  .unique("streamId")

const runDelegation = table("runDelegation")
  .from("run_delegation")
  .columns({
    id: string(),
    userId: string().from("user_id"),
    sessionId: string().from("session_id"),
    childRunId: string().from("child_run_id"),
    rootRunId: string().from("root_run_id"),
    parentRunId: string().from("parent_run_id"),
    parentAttemptId: string().from("parent_attempt_id"),
    delegationKey: string().from("delegation_key"),
    rootOrdinal: number().from("root_ordinal"),
    depth: number(),
    task: string(),
    finalizedResult: json().from("finalized_result").optional(),
    createdAt: number().from("created_at"),
    updatedAt: number().from("updated_at"),
  })
  .primaryKey("id")
  .unique("childRunId")
  .unique("parentRunId", "parentAttemptId", "delegationKey")
  .unique("rootRunId", "rootOrdinal")

const attempt = table("attempt")
  .from("attempt")
  .columns({
    id: string(),
    runId: string().from("run_id"),
    userId: string().from("user_id"),
    sessionId: string().from("session_id"),
    ordinal: number(),
    streamId: string().from("stream_id"),
    status: enumeration<AttemptStatus>(),
    snapshot: json(),
    budget: json(),
    failure: json().optional(),
    startedAt: number().from("started_at").optional(),
    finishedAt: number().from("finished_at").optional(),
    createdAt: number().from("created_at"),
    updatedAt: number().from("updated_at"),
  })
  .primaryKey("id")
  .unique("runId", "ordinal")
  .unique("streamId")

const streamEvent = table("streamEvent")
  .from("stream_event")
  .columns({
    id: string(),
    sessionId: string().from("session_id"),
    streamId: string().from("stream_id"),
    sequence: number(),
    eventType: string().from("event_type"),
    payload: json(),
    idempotencyKey: string().from("idempotency_key"),
    createdAt: number().from("created_at"),
  })
  .primaryKey("id")
  .unique("streamId", "sequence")
  .unique("streamId", "idempotencyKey")

const streamCheckpoint = table("streamCheckpoint")
  .from("stream_checkpoint")
  .columns({
    id: string(),
    sessionId: string().from("session_id"),
    streamId: string().from("stream_id"),
    lastSequence: number().from("last_sequence"),
    updatedAt: number().from("updated_at"),
  })
  .primaryKey("id")
  .unique("sessionId", "streamId")

const userRelationships = relationships(user, ({ many }) => ({
  servers: many({ sourceField: ["id"], destField: ["ownerUserId"], destSchema: server }),
  sessions: many({ sourceField: ["id"], destField: ["userId"], destSchema: session }),
  notes: many({ sourceField: ["id"], destField: ["userId"], destSchema: note }),
  runs: many({ sourceField: ["id"], destField: ["userId"], destSchema: run }),
  attempts: many({ sourceField: ["id"], destField: ["userId"], destSchema: attempt }),
  delegations: many({ sourceField: ["id"], destField: ["userId"], destSchema: runDelegation }),
}))

const serverRelationships = relationships(server, ({ many, one }) => ({
  owner: one({ sourceField: ["ownerUserId"], destField: ["id"], destSchema: user }),
  agents: many({ sourceField: ["id"], destField: ["serverId"], destSchema: agent }),
  sessions: many({ sourceField: ["id"], destField: ["serverId"], destSchema: session }),
}))

const agentRelationships = relationships(agent, ({ many, one }) => ({
  server: one({ sourceField: ["serverId"], destField: ["id"], destSchema: server }),
  sessions: many({ sourceField: ["id"], destField: ["primaryAgentId"], destSchema: session }),
  messages: many({ sourceField: ["id"], destField: ["agentId"], destSchema: message }),
}))

const sessionRelationships = relationships(session, ({ many, one }) => ({
  user: one({ sourceField: ["userId"], destField: ["id"], destSchema: user }),
  server: one({ sourceField: ["serverId"], destField: ["id"], destSchema: server }),
  primaryAgent: one({ sourceField: ["primaryAgentId"], destField: ["id"], destSchema: agent }),
  parent: one({ sourceField: ["parentSessionId"], destField: ["id"], destSchema: session }),
  children: many({ sourceField: ["id"], destField: ["parentSessionId"], destSchema: session }),
  messages: many({ sourceField: ["id"], destField: ["sessionId"], destSchema: message }),
  streamEvents: many({ sourceField: ["id"], destField: ["sessionId"], destSchema: streamEvent }),
  streamCheckpoints: many({ sourceField: ["id"], destField: ["sessionId"], destSchema: streamCheckpoint }),
  runs: many({ sourceField: ["id"], destField: ["sessionId"], destSchema: run }),
  attempts: many({ sourceField: ["id"], destField: ["sessionId"], destSchema: attempt }),
  delegations: many({ sourceField: ["id"], destField: ["sessionId"], destSchema: runDelegation }),
}))

const messageRelationships = relationships(message, ({ one }) => ({
  session: one({ sourceField: ["sessionId"], destField: ["id"], destSchema: session }),
  agent: one({ sourceField: ["agentId"], destField: ["id"], destSchema: agent }),
}))

const streamEventRelationships = relationships(streamEvent, ({ one }) => ({
  session: one({ sourceField: ["sessionId"], destField: ["id"], destSchema: session }),
}))

const streamCheckpointRelationships = relationships(streamCheckpoint, ({ one }) => ({
  session: one({ sourceField: ["sessionId"], destField: ["id"], destSchema: session }),
}))

const noteRelationships = relationships(note, ({ one }) => ({
  user: one({ sourceField: ["userId"], destField: ["id"], destSchema: user }),
}))

const runRelationships = relationships(run, ({ many, one }) => ({
  user: one({ sourceField: ["userId"], destField: ["id"], destSchema: user }),
  session: one({ sourceField: ["sessionId"], destField: ["id"], destSchema: session }),
  attempts: many({ sourceField: ["id"], destField: ["runId"], destSchema: attempt }),
  childDelegations: many({ sourceField: ["id"], destField: ["childRunId"], destSchema: runDelegation }),
  rootDelegations: many({ sourceField: ["id"], destField: ["rootRunId"], destSchema: runDelegation }),
  parentDelegations: many({ sourceField: ["id"], destField: ["parentRunId"], destSchema: runDelegation }),
}))

const attemptRelationships = relationships(attempt, ({ one }) => ({
  user: one({ sourceField: ["userId"], destField: ["id"], destSchema: user }),
  session: one({ sourceField: ["sessionId"], destField: ["id"], destSchema: session }),
  run: one({ sourceField: ["runId"], destField: ["id"], destSchema: run }),
}))

const runDelegationRelationships = relationships(runDelegation, ({ one }) => ({
  user: one({ sourceField: ["userId"], destField: ["id"], destSchema: user }),
  session: one({ sourceField: ["sessionId"], destField: ["id"], destSchema: session }),
  childRun: one({ sourceField: ["childRunId"], destField: ["id"], destSchema: run }),
  rootRun: one({ sourceField: ["rootRunId"], destField: ["id"], destSchema: run }),
  parentRun: one({ sourceField: ["parentRunId"], destField: ["id"], destSchema: run }),
  parentAttempt: one({ sourceField: ["parentAttemptId"], destField: ["id"], destSchema: attempt }),
}))

export const zeroSchema = createSchema({
  tables: [user, server, agent, session, message, note, run, attempt, runDelegation, streamEvent, streamCheckpoint],
  relationships: [
    userRelationships,
    serverRelationships,
    agentRelationships,
    sessionRelationships,
    messageRelationships,
    noteRelationships,
    runRelationships,
    attemptRelationships,
    runDelegationRelationships,
    streamEventRelationships,
    streamCheckpointRelationships,
  ],
  enableLegacyMutators: false,
  enableLegacyQueries: false,
})
