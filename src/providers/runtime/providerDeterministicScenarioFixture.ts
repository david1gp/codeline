import type { ExecutionStreamEvent } from "../../stream/schema/executionStreamEventSchema.js"

type DeterministicScenario = {
  attempts: readonly {
    ordinal: number
    steps: readonly {
      delayMs: number
      event: ExecutionStreamEvent
    }[]
  }[]
  maxAttempts: number
}

export const providerDeterministicScenarioFixture = {
  streaming: {
    attempts: [
      {
        ordinal: 1,
        steps: [
          {
            delayMs: 20,
            event: { eventType: "text_delta", payload: { delta: "The deterministic workspace check is streaming. " } },
          },
          {
            delayMs: 30,
            event: { eventType: "text_delta", payload: { delta: "No provider connection is required." } },
          },
          { delayMs: 20, event: { eventType: "terminal", payload: { status: "completed" } } },
        ],
      },
    ],
    maxAttempts: 1,
  },
  "thinking-tools": {
    attempts: [
      {
        ordinal: 1,
        steps: [
          { delayMs: 20, event: { eventType: "thinking_status", payload: { status: "started" } } },
          {
            delayMs: 25,
            event: { eventType: "tool_start", payload: { toolCallId: "discovery-read-1", toolName: "read" } },
          },
          {
            delayMs: 20,
            event: {
              eventType: "tool_output",
              payload: {
                output: "src/providers/runtime/providerRuntimeAdapterCreate.ts",
                toolCallId: "discovery-read-1",
                truncated: false,
              },
            },
          },
          {
            delayMs: 20,
            event: {
              eventType: "tool_result",
              payload: {
                outcome: "success",
                result: "Read a checked-in runtime path.",
                toolCallId: "discovery-read-1",
                truncated: false,
              },
            },
          },
          {
            delayMs: 25,
            event: { eventType: "tool_start", payload: { toolCallId: "discovery-glob-1", toolName: "glob" } },
          },
          {
            delayMs: 20,
            event: {
              eventType: "tool_output",
              payload: {
                output: "src/providers/runtime/*Scenario*",
                toolCallId: "discovery-glob-1",
                truncated: false,
              },
            },
          },
          {
            delayMs: 20,
            event: {
              eventType: "tool_result",
              payload: {
                outcome: "success",
                result: "Found the provider-owned deterministic scenario fixture.",
                toolCallId: "discovery-glob-1",
                truncated: false,
              },
            },
          },
          { delayMs: 20, event: { eventType: "thinking_status", payload: { status: "finished" } } },
          {
            delayMs: 20,
            event: { eventType: "text_delta", payload: { delta: "Discovery stayed synthetic and provider-free." } },
          },
          { delayMs: 20, event: { eventType: "terminal", payload: { status: "completed" } } },
        ],
      },
    ],
    maxAttempts: 1,
  },
  "retry-success": {
    attempts: [
      {
        ordinal: 1,
        steps: [
          {
            delayMs: 20,
            event: { eventType: "text_delta", payload: { delta: "The first execution attempt started. " } },
          },
          {
            delayMs: 30,
            event: {
              eventType: "terminal",
              payload: {
                code: "provider_timeout",
                message: "The deterministic provider timed out once.",
                status: "error",
              },
            },
          },
        ],
      },
      {
        ordinal: 2,
        steps: [
          { delayMs: 20, event: { eventType: "text_delta", payload: { delta: "The retry completed successfully." } } },
          { delayMs: 20, event: { eventType: "terminal", payload: { status: "completed" } } },
        ],
      },
    ],
    maxAttempts: 2,
  },
  "retry-exhausted": {
    attempts: [
      {
        ordinal: 1,
        steps: [
          {
            delayMs: 20,
            event: { eventType: "text_delta", payload: { delta: "The first unavailable attempt started. " } },
          },
          {
            delayMs: 30,
            event: {
              eventType: "terminal",
              payload: {
                code: "provider_unavailable",
                message: "The deterministic provider is unavailable.",
                status: "error",
              },
            },
          },
        ],
      },
      {
        ordinal: 2,
        steps: [
          {
            delayMs: 20,
            event: { eventType: "text_delta", payload: { delta: "The final allowed attempt is unavailable too." } },
          },
          {
            delayMs: 30,
            event: {
              eventType: "terminal",
              payload: {
                code: "provider_unavailable",
                message: "The deterministic provider remains unavailable.",
                status: "error",
              },
            },
          },
        ],
      },
    ],
    maxAttempts: 2,
  },
  "terminal-error": {
    attempts: [
      {
        ordinal: 1,
        steps: [
          {
            delayMs: 20,
            event: {
              eventType: "terminal",
              payload: {
                code: "assistant_empty",
                message: "No assistant text was returned for the execution request.",
                status: "error",
              },
            },
          },
        ],
      },
    ],
    maxAttempts: 1,
  },
  "unexpected-end": {
    attempts: [
      {
        ordinal: 1,
        steps: [
          {
            delayMs: 20,
            event: {
              eventType: "text_delta",
              payload: { delta: "The deterministic stream started but ended early. " },
            },
          },
          { delayMs: 30, event: { eventType: "text_delta", payload: { delta: "No completion marker was emitted." } } },
        ],
      },
    ],
    maxAttempts: 1,
  },
  /**
   * Long enough for a browser reload to happen mid-run, so reload reattachment
   * observes a still-active detached run and then its authoritative completion.
   * The first fragment flushes immediately, so partial output is persisted and
   * readable through the run-specific active snapshot before the reload.
   */
  "detached-reload": {
    attempts: [
      {
        ordinal: 1,
        steps: [
          {
            delayMs: 20,
            event: { eventType: "text_delta", payload: { delta: "The detached deterministic run started. " } },
          },
          {
            delayMs: 8_000,
            event: {
              eventType: "text_delta",
              payload: { delta: "The detached deterministic run finished after the reload." },
            },
          },
          { delayMs: 20, event: { eventType: "terminal", payload: { status: "completed" } } },
        ],
      },
    ],
    maxAttempts: 1,
  },
  cancellation: {
    attempts: [
      {
        ordinal: 1,
        steps: [
          { delayMs: 20, event: { eventType: "thinking_status", payload: { status: "started" } } },
          {
            delayMs: 20,
            event: { eventType: "text_delta", payload: { delta: "The cancellable deterministic run is active. " } },
          },
          {
            delayMs: 5_000,
            event: {
              eventType: "text_delta",
              payload: { delta: "This delayed step observes abort before continuing." },
            },
          },
          { delayMs: 20, event: { eventType: "terminal", payload: { status: "completed" } } },
        ],
      },
    ],
    maxAttempts: 1,
  },
} as const satisfies Record<string, DeterministicScenario>
