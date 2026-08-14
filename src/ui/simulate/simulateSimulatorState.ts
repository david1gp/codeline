import type { AttemptStatus } from "../../run/schema/attemptStatusSchema.js"
import type { RunFailureMetadata } from "../../run/schema/runFailureMetadataSchema.js"
import type { RunRetryAdmission } from "../../run/schema/runRetryAdmissionSchema.js"
import type { RunStatus } from "../../run/schema/runStatusSchema.js"
import type { ExecutionStreamEvent } from "../../stream/schema/executionStreamEventSchema.js"

export type SimulateSimulatorPhase =
  | "idle"
  | "running"
  | "paused"
  | "retrying"
  | "succeeded"
  | "failed"
  | "unexpected_end"
  | "aborted"

export type SimulateSimulatorTermination = "none" | "completed" | "error" | "unexpected_end" | "aborted"

export interface SimulateSimulatorAttempt {
  ordinal: number
  status: AttemptStatus
  events: readonly ExecutionStreamEvent[]
  failure: RunFailureMetadata | null
  retryAdmission: RunRetryAdmission | null
}

export interface SimulateSimulatorEmittedEvent {
  attemptOrdinal: number
  elapsedMs: number
  event: ExecutionStreamEvent
  sequence: number
}

export interface SimulateSimulatorSnapshot {
  attempts: readonly SimulateSimulatorAttempt[]
  currentAttemptOrdinal: number | null
  elapsedMs: number
  events: readonly SimulateSimulatorEmittedEvent[]
  lastFailure: RunFailureMetadata | null
  lastTermination: SimulateSimulatorTermination
  phase: SimulateSimulatorPhase
  runStatus: RunStatus
}
