export type TransientActivity = {
  agentId?: string
  detail?: string
  id: string
  kind: "thinking" | "tool-call" | "tool-result"
  label: string
  status?: string
  task?: string
  toolCallId?: string
}

type MessagePartLike = {
  content?: unknown
  input?: unknown
  id?: unknown
  arguments?: unknown
  name?: unknown
  output?: unknown
  state?: unknown
  toolCallId?: unknown
  type: string
}

function transientActivityDetail(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === "string") return value.length === 0 ? undefined : value
  return JSON.stringify(value)
}

function transientActivityInputResolve(value: unknown): { agentId?: string; task?: string } {
  let input = value
  if (typeof input === "string") {
    try {
      input = JSON.parse(input)
    } catch (_error: unknown) {
      return {}
    }
  }
  if (typeof input !== "object" || input === null || Array.isArray(input)) return {}
  const record = input as Record<string, unknown>
  return {
    ...(typeof record.agentId === "string" ? { agentId: record.agentId } : {}),
    ...(typeof record.task === "string" ? { task: record.task } : {}),
  }
}

/**
 * Project TanStack AI message parts onto the compact activity entries the
 * in-flight chat view renders. Text parts stay out: they are already collected
 * as the transient message content.
 */
export function transientMessageActivitiesResolve(parts: ReadonlyArray<{ type: string }>): Array<TransientActivity> {
  const activities: Array<TransientActivity> = []
  for (const [index, rawPart] of parts.entries()) {
    const part = rawPart as MessagePartLike
    if (part.type === "thinking") {
      const detail = transientActivityDetail(part.content)
      activities.push({
        ...(detail === undefined ? {} : { detail }),
        id: `thinking-${index}`,
        kind: "thinking",
        label: "Thinking",
      })
      continue
    }
    if (part.type === "tool-call") {
      const detail = transientActivityDetail(part.output)
      const input = transientActivityInputResolve(part.input ?? part.arguments)
      activities.push({
        ...(input.agentId === undefined ? {} : { agentId: input.agentId }),
        ...(detail === undefined ? {} : { detail }),
        id: typeof part.id === "string" ? `tool-call-${part.id}` : `tool-call-${index}`,
        kind: "tool-call",
        label: typeof part.name === "string" ? part.name : "tool",
        ...(typeof part.state === "string" ? { status: part.state } : {}),
        ...(input.task === undefined ? {} : { task: input.task }),
        ...(typeof part.id === "string" ? { toolCallId: part.id } : {}),
      })
      continue
    }
    if (part.type !== "tool-result") continue
    const detail = transientActivityDetail(part.content)
    activities.push({
      ...(detail === undefined ? {} : { detail }),
      id: typeof part.toolCallId === "string" ? `tool-result-${part.toolCallId}` : `tool-result-${index}`,
      kind: "tool-result",
      label: "Result",
      ...(typeof part.state === "string" ? { status: part.state } : {}),
    })
  }
  return activities
}
