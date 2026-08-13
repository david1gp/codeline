import { agentTable } from "../agents/db/agentTable.js"
import { developmentUserTable } from "../identity/db/developmentUserTable.js"
import { messageTable } from "../message/db/messageTable.js"
import { serverTable } from "../servers/db/serverTable.js"
import { sessionTable } from "../session/db/sessionTable.js"
import { streamCheckpointTable } from "../stream/db/streamCheckpointTable.js"
import { streamEventTable } from "../stream/db/streamEventTable.js"

export const databaseSchema = {
  agentTable,
  developmentUserTable,
  messageTable,
  serverTable,
  sessionTable,
  streamCheckpointTable,
  streamEventTable,
}
