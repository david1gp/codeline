import type { ExecutionStreamEvent } from "../../stream/schema/executionStreamEventSchema.js"

export type SimulateScenarioSlug =
  | "streaming"
  | "thinking-tools"
  | "retry-success"
  | "retry-exhausted"
  | "terminal-error"
  | "unexpected-end"
  | "cancellation"

export interface SimulateScenarioStep {
  delayMs: number
  event: ExecutionStreamEvent
}

export interface SimulateScenarioAttemptPlan {
  ordinal: number
  steps: readonly SimulateScenarioStep[]
}

export interface SimulateScenario {
  description: string
  label: string
  maxAttempts: number
  prompt: string
  slug: SimulateScenarioSlug
  attempts: readonly SimulateScenarioAttemptPlan[]
}
