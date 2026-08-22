import type { AgentRecord } from "../../agents/convex/agentRecord.js"
import type { ServerRecord } from "../../servers/convex/serverRecord.js"
import type { SessionRecord } from "./sessionRecord.js"

export type SessionListRow = {
  agent: AgentRecord
  server: ServerRecord
  session: SessionRecord
}
