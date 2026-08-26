import type { AgentToolDefaults } from "../../agents/schema/agentToolDefaultsSchema.js"
import type { ToolName } from "../../tools/schema/toolNameSchema.js"

export function runExecutionManifestToolDefaultsResolve(tools: readonly ToolName[]): AgentToolDefaults {
  return {
    bash: tools.includes("bash"),
    webfetch: tools.includes("webfetch"),
  }
}
