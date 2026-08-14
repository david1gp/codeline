import type { ExecutionStreamEvent } from "../../stream/schema/executionStreamEventSchema.js"

export interface SimulateEventPresentation {
  detail: string
  label: string
  tone: "text" | "thinking" | "tool" | "file" | "success" | "error" | "aborted"
}

export function simulateEventPresentation(event: ExecutionStreamEvent): SimulateEventPresentation {
  if (event.eventType === "text_delta") return { detail: event.payload.delta, label: "text", tone: "text" }

  if (event.eventType === "thinking_status")
    return {
      detail: event.payload.status === "started" ? "Thinking started" : "Thinking finished",
      label: "thinking",
      tone: "thinking",
    }

  if (event.eventType === "tool_start")
    return { detail: `${event.payload.toolName} (${event.payload.toolCallId})`, label: "tool start", tone: "tool" }

  if (event.eventType === "tool_output")
    return {
      detail: event.payload.truncated ? `${event.payload.output} …truncated` : event.payload.output,
      label: "tool output",
      tone: "tool",
    }

  if (event.eventType === "tool_result")
    return {
      detail: `${event.payload.outcome}: ${event.payload.result}`,
      label: "tool result",
      tone: event.payload.outcome === "error" ? "error" : "tool",
    }

  if (event.eventType === "written_file") return { detail: event.payload.path, label: "written file", tone: "file" }

  const message = event.payload.message ?? "No terminal message."
  const code = event.payload.code === undefined ? "" : ` [${event.payload.code}]`
  if (event.payload.status === "completed") return { detail: `Completed${code}`, label: "terminal", tone: "success" }
  if (event.payload.status === "aborted") return { detail: `${message}${code}`, label: "terminal", tone: "aborted" }
  return { detail: `${message}${code}`, label: "terminal", tone: "error" }
}
