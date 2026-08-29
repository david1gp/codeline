import type { AgentToolDefaults } from "../../agents/schema/agentToolDefaultsSchema.js"
import type { ToolName } from "../../tools/schema/toolNameSchema.js"

export function runExecutionManifestToolDefaultsResolve(tools: readonly ToolName[]): AgentToolDefaults {
  const fileToolsEnabled = tools.some((tool) => tool === "read" || tool === "write" || tool === "edit")
  return {
    bash: tools.includes("bash"),
    webfetch: tools.includes("webfetch"),
    ...(fileToolsEnabled
      ? { read: tools.includes("read"), write: tools.includes("write"), edit: tools.includes("edit") }
      : {}),
  }
}
