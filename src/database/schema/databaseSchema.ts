import { agentTable } from "./agentTable.js"
import { developmentUserTable } from "./developmentUserTable.js"
import { messageTable } from "./messageTable.js"
import { serverTable } from "./serverTable.js"
import { sessionTable } from "./sessionTable.js"
import { streamCheckpointTable } from "./streamCheckpointTable.js"
import { streamEventTable } from "./streamEventTable.js"

export const databaseSchema = {
  agentTable,
  developmentUserTable,
  messageTable,
  serverTable,
  sessionTable,
  streamCheckpointTable,
  streamEventTable,
}
