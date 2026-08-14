import type { SimulateScenario, SimulateScenarioSlug } from "./simulateScenario.js"

export const simulateScenarioFixtures = {
  streaming: {
    description: "Incremental assistant text that ends successfully.",
    label: "Streaming",
    maxAttempts: 1,
    prompt: "Summarize the local workspace checks in three concise points.",
    slug: "streaming",
    attempts: [
      {
        ordinal: 1,
        steps: [
          {
            delayMs: 120,
            event: { eventType: "text_delta", payload: { delta: "I checked the workspace boundaries first. " } },
          },
          {
            delayMs: 180,
            event: { eventType: "text_delta", payload: { delta: "The session remains local and deterministic. " } },
          },
          {
            delayMs: 180,
            event: {
              eventType: "text_delta",
              payload: { delta: "No provider connection is needed for this simulation." },
            },
          },
          {
            delayMs: 140,
            event: { eventType: "terminal", payload: { status: "completed" } },
          },
        ],
      },
    ],
  },
  "thinking-tools": {
    description: "A step starts with thinking, discovery tools inspect a safe fixture, and the turn completes.",
    label: "Thinking and tools",
    maxAttempts: 1,
    prompt: "Inspect the source layout and explain where the simulation harness belongs.",
    slug: "thinking-tools",
    attempts: [
      {
        ordinal: 1,
        steps: [
          {
            delayMs: 140,
            event: { eventType: "thinking_status", payload: { status: "started" } },
          },
          {
            delayMs: 260,
            event: {
              eventType: "tool_start",
              payload: { toolCallId: "tool_codeline_read_001", toolName: "read" },
            },
          },
          {
            delayMs: 180,
            event: {
              eventType: "tool_output",
              payload: {
                output: "export function simulateSimulatorStateCreate() { /* deterministic state */ }",
                toolCallId: "tool_codeline_read_001",
                truncated: false,
              },
            },
          },
          {
            delayMs: 180,
            event: {
              eventType: "tool_result",
              payload: {
                outcome: "success",
                result: "Read the local simulator fixture without accessing the filesystem.",
                toolCallId: "tool_codeline_read_001",
                truncated: false,
              },
            },
          },
          {
            delayMs: 140,
            event: {
              eventType: "tool_start",
              payload: { toolCallId: "tool_codeline_glob_001", toolName: "glob" },
            },
          },
          {
            delayMs: 160,
            event: {
              eventType: "tool_output",
              payload: {
                output: '["src/ui/simulate/simulateScenario.ts","src/ui/simulate/simulateSimulatorState.ts"]',
                toolCallId: "tool_codeline_glob_001",
                truncated: false,
              },
            },
          },
          {
            delayMs: 160,
            event: {
              eventType: "tool_result",
              payload: {
                outcome: "success",
                result: "Found two typed simulation-core files under the local UI simulation context.",
                toolCallId: "tool_codeline_glob_001",
                truncated: false,
              },
            },
          },
          {
            delayMs: 140,
            event: {
              eventType: "tool_start",
              payload: { toolCallId: "tool_codeline_grep_001", toolName: "grep" },
            },
          },
          {
            delayMs: 160,
            event: {
              eventType: "tool_output",
              payload: {
                output: "simulateSimulatorStateCreate\nsimulateScenarioRegistry",
                toolCallId: "tool_codeline_grep_001",
                truncated: false,
              },
            },
          },
          {
            delayMs: 160,
            event: {
              eventType: "tool_result",
              payload: {
                outcome: "success",
                result: "Matched the deterministic simulator and scenario registry symbols.",
                toolCallId: "tool_codeline_grep_001",
                truncated: false,
              },
            },
          },
          {
            delayMs: 140,
            event: {
              eventType: "tool_start",
              payload: { toolCallId: "tool_codeline_bash_001", toolName: "bash" },
            },
          },
          {
            delayMs: 160,
            event: {
              eventType: "tool_output",
              payload: {
                output: "fixture-check: deterministic; network: disabled",
                toolCallId: "tool_codeline_bash_001",
                truncated: false,
              },
            },
          },
          {
            delayMs: 160,
            event: {
              eventType: "tool_result",
              payload: {
                outcome: "success",
                result: "The synthetic check completed without invoking a command or provider.",
                toolCallId: "tool_codeline_bash_001",
                truncated: false,
              },
            },
          },
          {
            delayMs: 140,
            event: {
              eventType: "tool_start",
              payload: { toolCallId: "tool_codeline_edit_001", toolName: "edit" },
            },
          },
          {
            delayMs: 160,
            event: {
              eventType: "tool_output",
              payload: {
                output: '{"path":"src/ui/simulate/simulateScenarioFixtures.ts","change":"preview"}',
                toolCallId: "tool_codeline_edit_001",
                truncated: false,
              },
            },
          },
          {
            delayMs: 160,
            event: {
              eventType: "tool_result",
              payload: {
                outcome: "success",
                result: "Prepared a local fixture edit preview; no file was changed.",
                toolCallId: "tool_codeline_edit_001",
                truncated: false,
              },
            },
          },
          {
            delayMs: 180,
            event: { eventType: "thinking_status", payload: { status: "finished" } },
          },
          {
            delayMs: 160,
            event: {
              eventType: "text_delta",
              payload: {
                delta: "The harness belongs under src/ui/simulate so it stays client-local and provider-free.",
              },
            },
          },
          {
            delayMs: 140,
            event: { eventType: "terminal", payload: { status: "completed" } },
          },
        ],
      },
    ],
  },
  "retry-success": {
    description: "A retryable provider timeout is recovered on the next attempt.",
    label: "Retry success",
    maxAttempts: 3,
    prompt: "Review the deterministic execution path and report whether it is ready.",
    slug: "retry-success",
    attempts: [
      {
        ordinal: 1,
        steps: [
          {
            delayMs: 130,
            event: {
              eventType: "text_delta",
              payload: { delta: "I started the execution review, but the connection " },
            },
          },
          {
            delayMs: 220,
            event: {
              eventType: "terminal",
              payload: {
                code: "provider_timeout",
                message: "The provider timed out before the response completed.",
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
            delayMs: 220,
            event: {
              eventType: "text_delta",
              payload: { delta: "The retry completed the execution review successfully. " },
            },
          },
          {
            delayMs: 180,
            event: {
              eventType: "text_delta",
              payload: { delta: "The normalized event path is ready for UI validation." },
            },
          },
          {
            delayMs: 140,
            event: { eventType: "terminal", payload: { status: "completed" } },
          },
        ],
      },
    ],
  },
  "retry-exhausted": {
    description: "Retryable failures continue until the attempt budget is exhausted.",
    label: "Retry exhausted",
    maxAttempts: 2,
    prompt: "Run the workspace check even if the upstream connection remains unavailable.",
    slug: "retry-exhausted",
    attempts: [
      {
        ordinal: 1,
        steps: [
          {
            delayMs: 140,
            event: { eventType: "text_delta", payload: { delta: "Starting the workspace check now. " } },
          },
          {
            delayMs: 220,
            event: {
              eventType: "terminal",
              payload: {
                code: "provider_unavailable",
                message: "The configured upstream is unavailable.",
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
            delayMs: 220,
            event: {
              eventType: "text_delta",
              payload: { delta: "The final allowed attempt also reached the unavailable upstream. " },
            },
          },
          {
            delayMs: 220,
            event: {
              eventType: "terminal",
              payload: {
                code: "provider_unavailable",
                message: "The configured upstream is still unavailable.",
                status: "error",
              },
            },
          },
        ],
      },
    ],
  },
  "terminal-error": {
    description: "A non-retryable execution error ends the run immediately.",
    label: "Terminal error",
    maxAttempts: 3,
    prompt: "Return a response for an invalid execution request.",
    slug: "terminal-error",
    attempts: [
      {
        ordinal: 1,
        steps: [
          {
            delayMs: 160,
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
  },
  "unexpected-end": {
    description: "Text ends without a terminal event and is classified as a disconnected stream.",
    label: "Unexpected end",
    maxAttempts: 1,
    prompt: "Summarize the files changed during the interrupted workspace check.",
    slug: "unexpected-end",
    attempts: [
      {
        ordinal: 1,
        steps: [
          {
            delayMs: 150,
            event: {
              eventType: "text_delta",
              payload: { delta: "The workspace check found two changed files, but the stream " },
            },
          },
          {
            delayMs: 220,
            event: { eventType: "text_delta", payload: { delta: "ended before the final summary was delivered." } },
          },
        ],
      },
    ],
  },
  cancellation: {
    description: "A running turn can be stopped and finishes with an aborted terminal event.",
    label: "Cancellation",
    maxAttempts: 1,
    prompt: "Inspect the workspace and keep the response running until it is cancelled.",
    slug: "cancellation",
    attempts: [
      {
        ordinal: 1,
        steps: [
          {
            delayMs: 140,
            event: { eventType: "thinking_status", payload: { status: "started" } },
          },
          {
            delayMs: 260,
            event: { eventType: "text_delta", payload: { delta: "I am inspecting the workspace structure now. " } },
          },
          {
            delayMs: 260,
            event: { eventType: "text_delta", payload: { delta: "The next step would compare the changed files." } },
          },
          {
            delayMs: 260,
            event: { eventType: "terminal", payload: { status: "completed" } },
          },
        ],
      },
    ],
  },
} as const satisfies Record<SimulateScenarioSlug, SimulateScenario>
