import type { SessionCompactRunInputState } from "../../session/api/sessionCompactRunInputStateSchema.js"
import type { SessionLatestAnswer } from "../../session/api/sessionLatestAnswerSchema.js"
import type { SessionSemanticStep } from "../../session/api/sessionSemanticStepSchema.js"
import type { DemoSessionScreenVariant } from "./demoSessionScreenVariant.js"

const completedAnswer = {
  agentId: "demo-agent",
  clientRequestId: "demo-request-completed",
  content:
    "## Session area refreshed\n\nThe redesigned activity view and project file panel now share the same production presentation used by authenticated workspaces.\n\n- Deterministic fixtures only\n- No provider or filesystem requests\n- Responsive main and sidebar regions",
  createdAt: "2026-09-13T09:42:00.000Z",
  finalizedAt: "2026-09-13T09:42:06.000Z",
  id: "demo-answer-completed",
  metadata: {},
  role: "assistant",
  sequence: 4,
  sessionId: "demo-session-workspace",
} as const satisfies NonNullable<SessionLatestAnswer>

const completedSteps = [
  {
    id: "demo-step-request",
    kind: "message",
    role: "user",
    sequence: 1,
    summary: "Refresh the selected session and project files presentation.",
  },
  {
    id: "demo-step-analysis",
    kind: "message",
    role: "assistant",
    sequence: 2,
    summary: "Inspected the production session history and compact project browser.",
  },
  {
    id: "demo-step-result",
    kind: "message",
    role: "assistant",
    sequence: 3,
    summary: "Prepared the completed fixture for review.",
  },
] as const satisfies readonly SessionSemanticStep[]

const generatingSteps = [
  {
    id: "demo-step-generating-request",
    kind: "message",
    role: "user",
    sequence: 1,
    summary: "Compare the session states and check the selected Markdown file.",
  },
  {
    id: "demo-step-generating-progress",
    kind: "message",
    role: "assistant",
    sequence: 2,
    summary: "Reviewing the production layout and preparing the final response…",
  },
] as const satisfies readonly SessionSemanticStep[]

const waitingSteps = [
  {
    id: "demo-step-waiting-request",
    kind: "message",
    role: "user",
    sequence: 1,
    summary: "Prepare the release note after confirming the target audience.",
  },
  {
    id: "demo-step-waiting-input",
    kind: "input",
    sequence: 2,
    summary: "Asked which audience should receive the release note.",
  },
] as const satisfies readonly SessionSemanticStep[]

const waitingCompactState = {
  input: {
    prompt: "Should the release note be written for application users or project maintainers?",
    requestId: "demo-input-request",
  },
  run: null,
} as const satisfies SessionCompactRunInputState

export const demoSessionSemanticFixtures: Record<
  DemoSessionScreenVariant,
  {
    compactState: SessionCompactRunInputState | undefined
    latestAnswer: SessionLatestAnswer
    steps: readonly SessionSemanticStep[]
  }
> = {
  editing: { compactState: undefined, latestAnswer: completedAnswer, steps: completedSteps },
  empty: { compactState: undefined, latestAnswer: null, steps: [] },
  error: { compactState: undefined, latestAnswer: null, steps: [] },
  loading: { compactState: undefined, latestAnswer: null, steps: [] },
  ready: { compactState: undefined, latestAnswer: completedAnswer, steps: completedSteps },
  streaming: { compactState: undefined, latestAnswer: null, steps: generatingSteps },
  waiting: { compactState: waitingCompactState, latestAnswer: null, steps: waitingSteps },
}
