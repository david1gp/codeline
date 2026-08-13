import { expect, test } from "bun:test"
import { getTableName } from "drizzle-orm"
import { databaseSchema } from "../src/database/databaseSchema.js"
import { zeroSchema } from "../src/database/zeroSchema.js"

const expectedTables = [
  "development_user",
  "server",
  "agent",
  "session",
  "message",
  "stream_event",
  "stream_checkpoint",
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
})

test("Zero relationships cover restart-safe session and stream ownership", () => {
  expect(zeroSchema.relationships.session).toHaveProperty("streamEvents")
  expect(zeroSchema.relationships.session).toHaveProperty("streamCheckpoints")
  expect(zeroSchema.relationships.streamEvent.session[0]).toMatchObject({
    sourceField: ["sessionId"],
    destField: ["id"],
    destSchema: "session",
    cardinality: "one",
  })
})
