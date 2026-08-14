import { expect, test } from "bun:test"
import { getTableName } from "drizzle-orm"
import { getTableConfig } from "drizzle-orm/pg-core"
import { databaseSchema } from "../src/database/databaseSchema.js"
import { zeroSchema } from "../src/database/zeroSchema.js"

const expectedTables = [
  "development_user",
  "server",
  "agent",
  "session",
  "message",
  "note",
  "stream_event",
  "stream_checkpoint",
  "run",
  "attempt",
  "run_delegation",
] as const

test("Zero exposes the durable application tables with matching PostgreSQL names", () => {
  const zeroTables = Object.values(zeroSchema.tables) as readonly { name: string; serverName?: string }[]
  const zeroTableNames = zeroTables.map((table) => table.serverName ?? table.name).sort()
  const databaseTableNames = Object.values(databaseSchema)
    .map((table) => getTableName(table))
    .sort()

  expect(Object.keys(databaseSchema).length).toBe(expectedTables.length)
  expect(zeroTableNames).toEqual([...expectedTables].sort())
  expect(databaseTableNames).toEqual([...expectedTables].sort())
  expect(zeroSchema.tables.streamEvent.primaryKey).toEqual(["id"])
  expect(zeroSchema.tables.streamEvent.columns.sequence.type).toBe("number")
  expect(zeroSchema.tables.streamCheckpoint.columns.lastSequence.type).toBe("number")
  expect(zeroSchema.tables.note.columns.projectPath.optional).toBe(true)
  expect(zeroSchema.tables.session.columns.parentSessionId.optional).toBe(true)
  expect(zeroSchema.tables.run.columns.snapshot.type).toBe("json")
  expect(zeroSchema.tables.run.columns.deadlineAt.type).toBe("number")
  expect(zeroSchema.tables.run.columns.cancellationRequestedAt.type).toBe("number")
  expect(zeroSchema.tables.run.columns.cancellationKind.type).toBe("string")
  expect(zeroSchema.tables.attempt.columns.ordinal.type).toBe("number")
  expect(zeroSchema.tables.runDelegation.columns.finalizedResult.optional).toBe(true)
  expect(zeroSchema.tables.runDelegation.columns.finalizedResult.serverName).toBe("finalized_result")
  expect(zeroSchema.tables.runDelegation.columns.depth.type).toBe("number")
  expect(zeroSchema.tables.run.uniqueKeys).toEqual([["sessionId", "clientRunId"], ["streamId"]])
  expect(zeroSchema.tables.attempt.uniqueKeys).toEqual([["runId", "ordinal"], ["streamId"]])
  expect(zeroSchema.tables.runDelegation.uniqueKeys).toEqual([
    ["childRunId"],
    ["parentRunId", "parentAttemptId", "delegationKey"],
    ["rootRunId", "rootOrdinal"],
  ])
})

test("Drizzle keeps run and attempt stream IDs and ownership unique", () => {
  const runConfig = getTableConfig(databaseSchema.runTable)
  const attemptConfig = getTableConfig(databaseSchema.attemptTable)
  const sessionConfig = getTableConfig(databaseSchema.sessionTable)

  expect(runConfig.uniqueConstraints.map((constraint) => constraint.name)).toEqual([
    "run_session_client_run_unique",
    "run_stream_id_unique",
    "run_user_session_id_unique",
  ])
  expect(attemptConfig.uniqueConstraints.map((constraint) => constraint.name)).toEqual([
    "attempt_run_ordinal_unique",
    "attempt_stream_id_unique",
    "attempt_user_session_run_id_unique",
  ])
  const delegationConfig = getTableConfig(databaseSchema.runDelegationTable)
  expect(sessionConfig.uniqueConstraints.map((constraint) => constraint.name)).toContain("session_user_id_unique")
  const runOwnershipForeignKey = runConfig.foreignKeys.find(
    (foreignKey) => foreignKey.getName() === "run_user_session_consistency_fk",
  )
  const attemptOwnershipForeignKey = attemptConfig.foreignKeys.find(
    (foreignKey) => foreignKey.getName() === "attempt_run_ownership_consistency_fk",
  )
  expect(runOwnershipForeignKey?.onDelete).toBe("cascade")
  expect(attemptOwnershipForeignKey?.onDelete).toBe("cascade")
  expect(runConfig.checks.map((checkConstraint) => checkConstraint.name)).toContain("run_cancellation_fields_allowed")
  expect(runConfig.foreignKeys.map((foreignKey) => foreignKey.getName())).toContain(
    "run_cancellation_source_ownership_fk",
  )
  expect(delegationConfig.uniqueConstraints.map((constraint) => constraint.name)).toEqual([
    "run_delegation_child_run_unique",
    "run_delegation_parent_key_unique",
    "run_delegation_root_ordinal_unique",
  ])
  expect(delegationConfig.checks.map((checkConstraint) => checkConstraint.name)).toEqual([
    "run_delegation_key_bounded",
    "run_delegation_root_ordinal_positive",
    "run_delegation_depth_bounded",
    "run_delegation_task_bounded",
  ])
  expect(delegationConfig.foreignKeys.map((foreignKey) => foreignKey.getName()).sort()).toEqual([
    "run_delegation_child_ownership_consistency_fk",
    "run_delegation_parent_attempt_consistency_fk",
    "run_delegation_parent_ownership_consistency_fk",
    "run_delegation_root_ownership_consistency_fk",
    "run_delegation_user_id_development_user_id_fk",
  ])
})

test("Zero relationships cover restart-safe session and stream ownership", () => {
  expect(zeroSchema.relationships.session).toHaveProperty("streamEvents")
  expect(zeroSchema.relationships.session).toHaveProperty("streamCheckpoints")
  expect(zeroSchema.relationships.session).toHaveProperty("parent")
  expect(zeroSchema.relationships.session).toHaveProperty("children")
  expect(zeroSchema.relationships.session.parent[0]).toMatchObject({
    sourceField: ["parentSessionId"],
    destField: ["id"],
    destSchema: "session",
    cardinality: "one",
  })
  expect(zeroSchema.relationships.streamEvent.session[0]).toMatchObject({
    sourceField: ["sessionId"],
    destField: ["id"],
    destSchema: "session",
    cardinality: "one",
  })
  expect(zeroSchema.relationships.developmentUser).toHaveProperty("notes")
  expect(zeroSchema.relationships.session).toHaveProperty("runs")
  expect(zeroSchema.relationships.run).toHaveProperty("attempts")
  expect(zeroSchema.relationships.run).toHaveProperty("user")
  expect(zeroSchema.relationships.run).toHaveProperty("session")
  expect(zeroSchema.relationships.attempt).toHaveProperty("run")
  expect(zeroSchema.relationships.developmentUser).toHaveProperty("delegations")
  expect(zeroSchema.relationships.session).toHaveProperty("delegations")
  expect(zeroSchema.relationships.run).toHaveProperty("childDelegations")
  expect(zeroSchema.relationships.run).toHaveProperty("rootDelegations")
  expect(zeroSchema.relationships.run).toHaveProperty("parentDelegations")
  expect(zeroSchema.relationships.runDelegation).toHaveProperty("parentAttempt")
  expect(zeroSchema.relationships.note.user[0]).toMatchObject({
    sourceField: ["userId"],
    destField: ["id"],
    destSchema: "developmentUser",
    cardinality: "one",
  })
})
