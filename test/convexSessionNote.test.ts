import { expect, test } from "bun:test"
import { noteCreate } from "../src/note/convex/noteCreate.js"
import { noteDelete } from "../src/note/convex/noteDelete.js"
import { noteList } from "../src/note/convex/noteList.js"
import { noteLoad } from "../src/note/convex/noteLoad.js"
import { noteReorder } from "../src/note/convex/noteReorder.js"
import { noteUpdate } from "../src/note/convex/noteUpdate.js"
import { sessionArchive } from "../src/session/convex/sessionArchive.js"
import { sessionList } from "../src/session/convex/sessionList.js"
import { sessionLoad } from "../src/session/convex/sessionLoad.js"
import { sessionPin } from "../src/session/convex/sessionPin.js"
import { sessionSearch } from "../src/session/convex/sessionSearch.js"
import { sessionUpdate } from "../src/session/convex/sessionUpdate.js"

type StoredDocument = {
  _id: string
  [key: string]: unknown
}

type Predicate = { field: string; operation: "eq" | "lt"; value: unknown }
type Rows = Map<string, StoredDocument[]>

class MemoryQuery {
  private readonly rows: Rows
  private readonly table: string
  private readonly predicates: readonly Predicate[]
  private readonly direction: "asc" | "desc"

  constructor(rows: Rows, table: string, predicates: readonly Predicate[] = [], direction: "asc" | "desc" = "asc") {
    this.rows = rows
    this.table = table
    this.predicates = predicates
    this.direction = direction
  }

  withIndex(
    _name: string,
    apply: (query: {
      eq: (field: string, value: unknown) => unknown
      lt: (field: string, value: unknown) => unknown
    }) => unknown,
  ) {
    const predicates = [...this.predicates]
    const query = {
      eq: (field: string, value: unknown) => {
        predicates.push({ field, operation: "eq", value })
        return query
      },
      lt: (field: string, value: unknown) => {
        predicates.push({ field, operation: "lt", value })
        return query
      },
    }
    apply(query)
    return new MemoryQuery(this.rows, this.table, predicates, this.direction)
  }

  order(direction: "asc" | "desc") {
    return new MemoryQuery(this.rows, this.table, this.predicates, direction)
  }

  async collect(): Promise<StoredDocument[]> {
    const rows = (this.rows.get(this.table) ?? []).filter((row) =>
      this.predicates.every((predicate) => {
        const value = row[predicate.field]
        if (predicate.operation === "eq") return value === predicate.value
        if (typeof value === "number" && typeof predicate.value === "number") return value < predicate.value
        return String(value) < String(predicate.value)
      }),
    )
    return rows.sort((left, right) => {
      const leftUpdatedAt = Number(left.updatedAt ?? 0)
      const rightUpdatedAt = Number(right.updatedAt ?? 0)
      return this.direction === "desc" ? rightUpdatedAt - leftUpdatedAt : leftUpdatedAt - rightUpdatedAt
    })
  }

  async first(): Promise<StoredDocument | null> {
    return (await this.collect())[0] ?? null
  }
}

function memoryContext() {
  const rows: Rows = new Map()
  let nextId = 1
  const db = {
    query: (table: string) => new MemoryQuery(rows, table),
    insert: async (table: string, value: Record<string, unknown>) => {
      const document = { ...value, _id: `${table}:${nextId}` }
      nextId += 1
      rows.set(table, [...(rows.get(table) ?? []), document])
      return document._id
    },
    patch: async (table: string, id: string, value: Record<string, unknown>) => {
      const tableRows = rows.get(table) ?? []
      const index = tableRows.findIndex((row) => row._id === id)
      if (index < 0) throw new Error("document not found")
      const existing = tableRows[index]
      if (existing === undefined) throw new Error("document not found")
      tableRows[index] = { ...existing, ...value }
    },
    replace: async (table: string, id: string, value: Record<string, unknown>) => {
      const tableRows = rows.get(table) ?? []
      const index = tableRows.findIndex((row) => row._id === id)
      if (index < 0) throw new Error("document not found")
      tableRows[index] = { ...value, _id: id } as StoredDocument
    },
    delete: async (table: string, id: string) => {
      rows.set(
        table,
        (rows.get(table) ?? []).filter((row) => row._id !== id),
      )
    },
  }
  return { context: { db } as any, db }
}

function sessionDocument(id: string, updatedAt: number, overrides: Record<string, unknown> = {}) {
  return {
    clientRequestId: `request-${id}`,
    createdAt: updatedAt,
    id,
    metadata: {},
    pinned: false,
    primaryAgentId: "agent-1",
    projectPath: "~",
    serverId: "server-1",
    title: id,
    updatedAt,
    userId: "user-1",
    ...overrides,
  }
}

function noteInput(id: string, updatedAt: number, projectPath: string | null) {
  return { content: id, createdAt: updatedAt, id, projectPath, updatedAt }
}

test("Convex sessions enforce organization ownership and stable cursor search", async () => {
  const { context, db } = memoryContext()
  await db.insert("servers", {
    createdAt: 1,
    endpoint: "https://server.test",
    id: "server-1",
    metadata: {},
    name: "Target server",
    organizationId: "organization-1",
    updatedAt: 1,
  })
  await db.insert("agents", {
    configuration: { model: "test", provider: "deterministic" },
    createdAt: 1,
    id: "agent-1",
    name: "Target agent",
    role: "primary",
    serverId: "server-1",
    sortOrder: 0,
    updatedAt: 1,
  })
  await db.insert("sessions", sessionDocument("session-1", 10))
  await db.insert("sessions", sessionDocument("session-2", 10))
  await db.insert("sessions", sessionDocument("session-archived", 20, { archivedAt: 20 }))

  const first = await sessionList(context, "user-1", "organization-1", { includeArchived: false, limit: 1 })
  expect(first).toMatchObject({ success: true, data: { rows: [{ session: { id: "session-2" } }] } })
  if (!first.success) return
  const second = await sessionList(context, "user-1", "organization-1", {
    cursor: first.data.nextCursor ?? undefined,
    includeArchived: false,
    limit: 1,
  })
  expect(second).toMatchObject({ success: true, data: { rows: [{ session: { id: "session-1" } }] } })

  const searched = await sessionSearch(context, "user-1", "organization-1", "session-1", {
    includeArchived: false,
    limit: 10,
  })
  expect(searched).toMatchObject({ success: true, data: { rows: [{ session: { id: "session-1" } }] } })
  const foreignOrganization = await sessionLoad(context, "user-1", "organization-2", "session-1")
  expect(foreignOrganization.success).toBe(false)
})

test("Convex session mutations preserve authorization and note grouping compaction", async () => {
  const { context, db } = memoryContext()
  await db.insert("servers", {
    createdAt: 1,
    endpoint: "https://server.test",
    id: "server-1",
    metadata: {},
    name: "Target server",
    organizationId: "organization-1",
    updatedAt: 1,
  })
  await db.insert("agents", {
    configuration: { model: "test", provider: "deterministic" },
    createdAt: 1,
    id: "agent-1",
    name: "Target agent",
    role: "primary",
    serverId: "server-1",
    sortOrder: 0,
    updatedAt: 1,
  })
  await db.insert("sessions", sessionDocument("session-1", 1))

  expect((await sessionUpdate(context, "user-1", "session-1", { title: "Renamed" }, "organization-1")).success).toBe(
    true,
  )
  expect((await sessionPin(context, "user-1", "session-1", true, "organization-1")).success).toBe(true)
  expect((await sessionArchive(context, "user-1", "session-1", "organization-1")).success).toBe(true)

  expect((await noteCreate(context, "user-1", noteInput("note-1", 1, "project-a"))).success).toBe(true)
  expect((await noteCreate(context, "user-1", noteInput("note-2", 2, "project-a"))).success).toBe(true)
  expect((await noteCreate(context, "user-1", noteInput("note-3", 3, "project-b"))).success).toBe(true)
  const moved = await noteUpdate(context, "user-1", noteInput("note-1", 4, "project-b"))
  expect(moved).toMatchObject({ success: true, data: { projectPath: "project-b", sortOrder: 1 } })
  await noteReorder(context, "user-1", { direction: "up", id: "note-1", projectPath: "project-b" })
  await noteDelete(context, "user-1", "note-3")
  expect(await noteLoad(context, "user-2", "note-1")).toEqual({ success: true, data: undefined })
  expect(await noteList(context, "user-1")).toMatchObject({
    success: true,
    data: [
      { id: "note-1", projectPath: "project-b", sortOrder: 0 },
      { id: "note-2", projectPath: "project-a", sortOrder: 0 },
    ],
  })
})
