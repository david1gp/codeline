/**
 * Background delegation handle formatting, mirroring OpenCode's `<task>`
 * envelope so foreground and background results share one parsing shape.
 */
export function runDelegationBackgroundHandleCreate(input: { description?: string; sessionId: string }): string {
  const label =
    input.description === undefined || input.description.trim().length === 0
      ? "The task is working in the background. You will be notified automatically when it finishes."
      : `The task "${input.description.trim().slice(0, 200)}" is working in the background. You will be notified automatically when it finishes.`
  return [
    `<task id="${input.sessionId}" state="running">`,
    label,
    "DO NOT sleep, poll for progress, ask the task for status, or duplicate this task's work.",
    "Work on non-overlapping tasks, or briefly tell the user what you launched and end your response.",
    "</task>",
  ].join("\n")
}

export function runDelegationBackgroundResultRender(input: {
  sessionId: string
  state: "completed" | "error"
  summary?: string
  text: string
}): string {
  const tag = input.state === "error" ? "task_error" : "task_result"
  return [
    `<task id="${input.sessionId}" state="${input.state}">`,
    ...(input.summary !== undefined && input.summary.length > 0 ? [`<summary>${input.summary}</summary>`] : []),
    `<${tag}>`,
    input.text,
    `</${tag}>`,
    "</task>",
  ].join("\n")
}
