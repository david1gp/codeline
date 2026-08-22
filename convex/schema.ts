import { defineSchema } from "convex/server"
import { agentTables } from "../src/agents/convex/agentTables.js"
import { identityTables } from "../src/identity/convex/identityTables.js"
import { messageTables } from "../src/message/convex/messageTables.js"
import { noteTables } from "../src/note/convex/noteTables.js"
import { runTables } from "../src/run/convex/runTables.js"
import { serverTables } from "../src/servers/convex/serverTables.js"
import { sessionTables } from "../src/session/convex/sessionTables.js"
import { streamTables } from "../src/stream/convex/streamTables.js"

const schema = defineSchema({
  ...identityTables,
  ...serverTables,
  ...agentTables,
  ...sessionTables,
  ...messageTables,
  ...noteTables,
  ...runTables,
  ...streamTables,
})

export default schema
