import type { SessionListRow } from "./sessionListRow.js"

export type SessionListResult = {
  nextCursor: string | null
  rows: SessionListRow[]
}
