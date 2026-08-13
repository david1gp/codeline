import { createSchema, enumeration, json, number, relationships, string, table } from "@rocicorp/zero"

const developmentUser = table("developmentUser")
  .from("development_user")
  .columns({
    id: string(),
    identityKey: string().from("identity_key"),
    displayName: string().from("display_name"),
    email: string().from("email").optional(),
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
    sortOrder: number().from("sort_order"),
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
    title: string(),
    clientRequestId: string().from("client_request_id"),
    metadata: json(),
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
    idempotencyKey: string().from("idempotency_key"),
    metadata: json(),
    finalizedAt: number().from("finalized_at"),
    createdAt: number().from("created_at"),
  })
  .primaryKey("id")
  .unique("sessionId", "sequence")

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

const developmentUserRelationships = relationships(developmentUser, ({ many }) => ({
  servers: many({ sourceField: ["id"], destField: ["ownerUserId"], destSchema: server }),
  sessions: many({ sourceField: ["id"], destField: ["userId"], destSchema: session }),
}))

const serverRelationships = relationships(server, ({ many, one }) => ({
  owner: one({ sourceField: ["ownerUserId"], destField: ["id"], destSchema: developmentUser }),
  agents: many({ sourceField: ["id"], destField: ["serverId"], destSchema: agent }),
  sessions: many({ sourceField: ["id"], destField: ["serverId"], destSchema: session }),
}))

const agentRelationships = relationships(agent, ({ many, one }) => ({
  server: one({ sourceField: ["serverId"], destField: ["id"], destSchema: server }),
  sessions: many({ sourceField: ["id"], destField: ["primaryAgentId"], destSchema: session }),
  messages: many({ sourceField: ["id"], destField: ["agentId"], destSchema: message }),
}))

const sessionRelationships = relationships(session, ({ many, one }) => ({
  user: one({ sourceField: ["userId"], destField: ["id"], destSchema: developmentUser }),
  server: one({ sourceField: ["serverId"], destField: ["id"], destSchema: server }),
  primaryAgent: one({ sourceField: ["primaryAgentId"], destField: ["id"], destSchema: agent }),
  messages: many({ sourceField: ["id"], destField: ["sessionId"], destSchema: message }),
  streamEvents: many({ sourceField: ["id"], destField: ["sessionId"], destSchema: streamEvent }),
  streamCheckpoints: many({ sourceField: ["id"], destField: ["sessionId"], destSchema: streamCheckpoint }),
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

export const zeroSchema = createSchema({
  tables: [developmentUser, server, agent, session, message, streamEvent, streamCheckpoint],
  relationships: [
    developmentUserRelationships,
    serverRelationships,
    agentRelationships,
    sessionRelationships,
    messageRelationships,
    streamEventRelationships,
    streamCheckpointRelationships,
  ],
  enableLegacyMutators: false,
  enableLegacyQueries: false,
})
