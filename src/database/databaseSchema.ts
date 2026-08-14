import { agentTable } from "../agents/db/agentTable.js"
import { applicationUserTable } from "../identity/db/applicationUserTable.js"
import { externalIdentityTable } from "../identity/db/externalIdentityTable.js"
import { identitySessionTable } from "../identity/db/identitySessionTable.js"
import { oidcLoginTransactionTable } from "../identity/db/oidcLoginTransactionTable.js"
import { messageTable } from "../message/db/messageTable.js"
import { noteTable } from "../note/db/noteTable.js"
import { attemptTable } from "../run/db/attemptTable.js"
import { runDelegationTable } from "../run/db/runDelegationTable.js"
import { runTable } from "../run/db/runTable.js"
import { serverTable } from "../servers/db/serverTable.js"
import { sessionTable } from "../session/db/sessionTable.js"
import { streamCheckpointTable } from "../stream/db/streamCheckpointTable.js"
import { streamEventTable } from "../stream/db/streamEventTable.js"

export const databaseSchema = {
  agentTable,
  attemptTable,
  applicationUserTable,
  externalIdentityTable,
  identitySessionTable,
  messageTable,
  noteTable,
  runDelegationTable,
  runTable,
  serverTable,
  sessionTable,
  streamCheckpointTable,
  streamEventTable,
  oidcLoginTransactionTable,
}
