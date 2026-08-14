export type TransientActivity = {
  detail?: string
  id: string
  kind: "thinking" | "tool-call" | "tool-result"
  label: string
  status?: string
}

type MessagePartLike = {
  content?: unknown
  id?: unknown
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
      activities.push({
        ...(detail === undefined ? {} : { detail }),
        id: typeof part.id === "string" ? `tool-call-${part.id}` : `tool-call-${index}`,
        kind: "tool-call",
        label: typeof part.name === "string" ? part.name : "tool",
        ...(typeof part.state === "string" ? { status: part.state } : {}),
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
