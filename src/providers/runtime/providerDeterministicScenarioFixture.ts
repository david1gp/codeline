import type { ExecutionStreamEvent } from "../../stream/schema/executionStreamEventSchema.js"

type DeterministicScenarioStep = {
  delayMs: number
  event: ExecutionStreamEvent
}

type DeterministicScenario = {
  attempts: readonly {
    ordinal: number
    steps: readonly DeterministicScenarioStep[]
  }[]
  delegation?: {
    continuationSteps: readonly DeterministicScenarioStep[]
    promptPrefix: string
  }
  maxAttempts: number
}

export const providerDeterministicScenarioFixture = {
  "compaction-summary": {
    attempts: [
      {
        ordinal: 1,
        steps: [
          {
            delayMs: 0,
            event: {
              eventType: "text_delta",
              payload: {
                delta:
                  "## Goals\n- Preserve the actionable workspace context.\n\n## Constraints\n- No tools are required.\n\n## Decisions\n",
              },
            },
          },
          {
            delayMs: 0,
            event: {
              eventType: "text_delta",
              payload: {
                delta:
                  "- Keep the recent tail available for the next request.\n\n## Progress\n- Summary generation completed.\n\n## Errors\n- none known\n\n## Next step\n- Continue with the retained context.",
              },
            },
          },
          { delayMs: 0, event: { eventType: "terminal", payload: { status: "completed" } } },
        ],
      },
    ],
    maxAttempts: 1,
  },
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
    delegation: {
      continuationSteps: [
        { delayMs: 20, event: { eventType: "text_delta", payload: { delta: "ok" } } },
        { delayMs: 20, event: { eventType: "terminal", payload: { status: "completed" } } },
      ],
      promptPrefix: "delegate:",
    },
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
  "bash-webfetch": {
    attempts: [
      {
        ordinal: 1,
        steps: [
          { delayMs: 0, event: { eventType: "thinking_status", payload: { status: "started" } } },
          {
            delayMs: 0,
            event: { eventType: "tool_start", payload: { toolCallId: "bash-1", toolName: "bash" } },
          },
          {
            delayMs: 0,
            event: {
              eventType: "tool_output",
              payload: {
                output: JSON.stringify({ command: "printf workspace-ok", workingDirectory: "src" }),
                toolCallId: "bash-1",
                truncated: false,
              },
            },
          },
          {
            delayMs: 0,
            event: {
              eventType: "tool_result",
              payload: {
                outcome: "success",
                result: JSON.stringify({
                  exitCode: 0,
                  stderr: "",
                  stdout: "workspace-ok\n",
                  truncated: false,
                  workingDirectory: "src",
                }),
                toolCallId: "bash-1",
                truncated: false,
                workingDirectory: "src",
              },
            },
          },
          {
            delayMs: 0,
            event: { eventType: "tool_start", payload: { toolCallId: "webfetch-1", toolName: "webfetch" } },
          },
          {
            delayMs: 0,
            event: {
              eventType: "tool_output",
              payload: {
                output: JSON.stringify({ format: "markdown", url: "https://example.test/docs" }),
                toolCallId: "webfetch-1",
                truncated: false,
              },
            },
          },
          {
            delayMs: 0,
            event: {
              eventType: "tool_result",
              payload: {
                outcome: "success",
                result: JSON.stringify({
                  contentType: "text/html",
                  format: "markdown",
                  output: "# Deterministic docs\n\nFetched content.",
                  truncated: false,
                  url: "https://example.test/docs",
                }),
                toolCallId: "webfetch-1",
                truncated: false,
              },
            },
          },
          { delayMs: 0, event: { eventType: "thinking_status", payload: { status: "finished" } } },
          {
            delayMs: 0,
            event: { eventType: "text_delta", payload: { delta: "The command tools returned deterministic results." } },
          },
          { delayMs: 0, event: { eventType: "terminal", payload: { status: "completed" } } },
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
  "abort-before-event": {
    attempts: [
      {
        ordinal: 1,
        steps: [
          {
            delayMs: 20,
            event: { eventType: "text_delta", payload: { delta: "This event should be aborted before delivery." } },
          },
          { delayMs: 20, event: { eventType: "terminal", payload: { status: "completed" } } },
        ],
      },
    ],
    maxAttempts: 1,
  },
  "abort-event-race": {
    attempts: [
      {
        ordinal: 1,
        steps: [
          { delayMs: 0, event: { eventType: "text_delta", payload: { delta: "This event races with abort." } } },
          { delayMs: 0, event: { eventType: "terminal", payload: { status: "completed" } } },
        ],
      },
    ],
    maxAttempts: 1,
  },
  "abort-after-terminal": {
    attempts: [
      {
        ordinal: 1,
        steps: [
          {
            delayMs: 0,
            event: { eventType: "text_delta", payload: { delta: "The terminal event wins before abort." } },
          },
          { delayMs: 0, event: { eventType: "terminal", payload: { status: "completed" } } },
        ],
      },
    ],
    maxAttempts: 1,
  },
  "retry-stream-replacement": {
    attempts: [
      {
        ordinal: 1,
        steps: [
          {
            delayMs: 0,
            event: { eventType: "text_delta", payload: { delta: "Failed attempt output must be replaced." } },
          },
          {
            delayMs: 0,
            event: {
              eventType: "terminal",
              payload: { code: "provider_retryable", message: "Replace this failed stream.", status: "error" },
            },
          },
        ],
      },
      {
        ordinal: 2,
        steps: [
          { delayMs: 0, event: { eventType: "text_delta", payload: { delta: "Authoritative retry output." } } },
          { delayMs: 0, event: { eventType: "terminal", payload: { status: "completed" } } },
        ],
      },
    ],
    maxAttempts: 2,
  },
  "incomplete-tool-lifecycle": {
    attempts: [
      {
        ordinal: 1,
        steps: [
          {
            delayMs: 0,
            event: { eventType: "tool_start", payload: { toolCallId: "incomplete-tool-1", toolName: "read" } },
          },
          {
            delayMs: 0,
            event: {
              eventType: "tool_output",
              payload: { output: "Partial tool output.", toolCallId: "incomplete-tool-1", truncated: false },
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
  "duplicate-terminal": {
    attempts: [
      {
        ordinal: 1,
        steps: [
          { delayMs: 0, event: { eventType: "terminal", payload: { status: "completed" } } },
          { delayMs: 0, event: { eventType: "terminal", payload: { status: "completed" } } },
        ],
      },
    ],
    maxAttempts: 1,
  },
  "out-of-order-terminal": {
    attempts: [
      {
        ordinal: 1,
        steps: [
          { delayMs: 0, event: { eventType: "terminal", payload: { status: "completed" } } },
          { delayMs: 0, event: { eventType: "text_delta", payload: { delta: "Late text must be ignored." } } },
          {
            delayMs: 0,
            event: {
              eventType: "terminal",
              payload: { code: "late_error", message: "Late terminal must be ignored.", status: "error" },
            },
          },
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
  /**
   * A retryable first attempt whose replacement attempt stays open long enough for
   * a browser reload. The reloaded tab must reattach to the same durable run and
   * observe only the authoritative second attempt's output.
   */
  "retry-reload": {
    attempts: [
      {
        ordinal: 1,
        steps: [
          {
            delayMs: 20,
            event: { eventType: "text_delta", payload: { delta: "The discarded first attempt started. " } },
          },
          {
            delayMs: 20,
            event: {
              eventType: "terminal",
              payload: {
                code: "provider_timeout",
                message: "The deterministic provider timed out before the retry.",
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
            event: { eventType: "text_delta", payload: { delta: "The retried attempt started. " } },
          },
          {
            delayMs: 8_000,
            event: {
              eventType: "text_delta",
              payload: { delta: "The retried attempt finished after the reload." },
            },
          },
          { delayMs: 20, event: { eventType: "terminal", payload: { status: "completed" } } },
        ],
      },
    ],
    maxAttempts: 2,
  },
  /**
   * Tool activity that provably spans a browser reload: the tool starts and emits
   * output immediately, the tool result only arrives seconds later, and assistant
   * text exists on both sides of that gap. A reload therefore happens while the
   * tool call is still open, and the reattached tab observes its completion.
   */
  "tool-activity-reload": {
    attempts: [
      {
        ordinal: 1,
        steps: [
          { delayMs: 20, event: { eventType: "thinking_status", payload: { status: "started" } } },
          {
            delayMs: 20,
            event: { eventType: "tool_start", payload: { toolCallId: "tool-activity-reload-1", toolName: "bash" } },
          },
          {
            delayMs: 20,
            event: {
              eventType: "tool_output",
              payload: {
                output: JSON.stringify({ command: "printf tool-activity", workingDirectory: "." }),
                toolCallId: "tool-activity-reload-1",
                truncated: false,
              },
            },
          },
          {
            delayMs: 20,
            event: { eventType: "text_delta", payload: { delta: "The tool activity run started. " } },
          },
          {
            delayMs: 8_000,
            event: {
              eventType: "tool_result",
              payload: {
                outcome: "success",
                result: "The deterministic tool call finished after the reload.",
                toolCallId: "tool-activity-reload-1",
                truncated: false,
              },
            },
          },
          { delayMs: 20, event: { eventType: "thinking_status", payload: { status: "finished" } } },
          // The completed tool call stays durably observable for several seconds
          // before finalization deletes this run's deltas, so the reattached tab
          // can render the closed lifecycle rather than racing the deletion.
          {
            delayMs: 5_000,
            event: {
              eventType: "text_delta",
              payload: { delta: "The tool activity run finished after the reload." },
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
