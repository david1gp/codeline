import { agentTable } from "../agents/db/agentTable.js"
import { mutationIdempotencyTable } from "../api/db/mutationIdempotencyTable.js"
import { sessionCompactionTable } from "../compaction/db/sessionCompactionTable.js"
import { applicationUserTable } from "../identity/db/applicationUserTable.js"
import { externalIdentityTable } from "../identity/db/externalIdentityTable.js"
import { identitySessionTable } from "../identity/db/identitySessionTable.js"
import { oidcLoginTransactionTable } from "../identity/db/oidcLoginTransactionTable.js"
import { organizationMemberTable } from "../identity/db/organizationMemberTable.js"
import { organizationTable } from "../identity/db/organizationTable.js"
import { journalEventTable } from "../journal/db/journalEventTable.js"
import { journalReplayBoundaryTable } from "../journal/db/journalReplayBoundaryTable.js"
import { journalSequenceCounterTable } from "../journal/db/journalSequenceCounterTable.js"
import { messageTable } from "../message/db/messageTable.js"
import { noteTable } from "../note/db/noteTable.js"
import { projectFolderAssignmentBackfillTable } from "../project/db/projectFolderAssignmentBackfillTable.js"
import { projectFolderTable } from "../project/db/projectFolderTable.js"
import { projectTable } from "../project/db/projectTable.js"
import { projectRegistrySessionPathBackfillTable } from "../project/db/projectRegistrySessionPathBackfillTable.js"
import { attemptTable } from "../run/db/attemptTable.js"
import { runDelegationTable } from "../run/db/runDelegationTable.js"
import { runTable } from "../run/db/runTable.js"
import { serverTable } from "../servers/db/serverTable.js"
import { sessionExecutionSelectionDefaultTable } from "../session/db/sessionExecutionSelectionDefaultTable.js"
import { sessionTable } from "../session/db/sessionTable.js"
import { sessionViewTable } from "../session/db/sessionViewTable.js"
import { skillSelectionDefaultTable } from "../skills/db/skillSelectionDefaultTable.js"

export const databaseSchema = {
  agentTable,
  attemptTable,
  applicationUserTable,
  externalIdentityTable,
  identitySessionTable,
  journalEventTable,
  journalReplayBoundaryTable,
  journalSequenceCounterTable,
  messageTable,
  mutationIdempotencyTable,
  noteTable,
  projectFolderAssignmentBackfillTable,
  projectFolderTable,
  projectTable,
  projectRegistrySessionPathBackfillTable,
  runDelegationTable,
  runTable,
  serverTable,
  sessionCompactionTable,
  sessionViewTable,
  sessionTable,
  sessionExecutionSelectionDefaultTable,
  skillSelectionDefaultTable,
  oidcLoginTransactionTable,
  organizationMemberTable,
  organizationTable,
}
