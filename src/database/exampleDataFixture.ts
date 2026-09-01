import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { AgentConfiguration } from "../agents/schema/agentConfigurationSchema.js"
import type { RunBudget } from "../run/schema/runBudgetSchema.js"
import type { RunExecutionSnapshot } from "../run/schema/runExecutionSnapshotSchema.js"
import { simulationScenarioSessionMetadata } from "../simulation/simulationScenarioSessionMetadata.js"
import type { ProjectFolderBootstrapKey } from "../project/projectFolderBootstrapKeySchema.js"

const exampleDataProjectPaths = {
  adaptive: resolve(dirname(fileURLToPath(import.meta.url)), "../../example-projects/adaptive"),
  leo: resolve(dirname(fileURLToPath(import.meta.url)), "../../example-projects/leo"),
  personal: resolve(dirname(fileURLToPath(import.meta.url)), "../../example-projects/personal"),
} satisfies Record<ProjectFolderBootstrapKey, string>

const exampleDataRunBudget = {
  maxAttempts: 1,
  maxChildDepth: 0,
  maxChildRuns: 0,
  maxDurationMs: 300_000,
} satisfies RunBudget

function exampleDataRunSnapshotCreate(agentId: string, serverId: string): RunExecutionSnapshot {
  return {
    configuration: {
      model: "development-default",
      provider: "deterministic",
      tools: { bash: false, webfetch: false },
    },
    configurationRevision: "example-data-v1",
    target: { agentId, serverId },
  }
}

type ExampleDataFixture = {
  user: {
    id: string
    displayName: string
    email: string
    createdAt: string
    updatedAt: string
  }
  organization: {
    id: string
    name: string
    createdAt: string
    updatedAt: string
  }
  organizationMembership: {
    issuer: string
    subject: string
    createdAt: string
    updatedAt: string
  }
  servers: readonly {
    id: string
    organizationId: string
    name: string
    endpoint: string
    metadata: { fixture: string }
    createdAt: string
    updatedAt: string
  }[]
  agents: readonly {
    id: string
    serverId: string
    name: string
    role: string
    configuration: AgentConfiguration
    sortOrder: number
    createdAt: string
    updatedAt: string
  }[]
  projects: readonly {
    id: string
    path: string
    displayName: string
    folderKey: ProjectFolderBootstrapKey
    createdAt: string
    updatedAt: string
  }[]
  sessions: readonly {
    id: string
    serverId: string
    primaryAgentId: string
    projectPath: string
    pinned: boolean
    parentSessionId: string | null
    title: string
    clientRequestId: string
    metadata: { fixture: string }
    archivedAt: string | null
    createdAt: string
    updatedAt: string
    messages: readonly {
      id: string
      role: "user" | "assistant"
      sequence: number
      content: string
      clientRequestId: string
      metadata: { fixture: string }
      finalizedAt: string
      createdAt: string
    }[]
  }[]
  runs: readonly {
    id: string
    sessionId: string
    clientRunId: string
    streamId: string
    outcome: "cancelled" | "completed" | "failed" | "interrupted"
    status: "succeeded" | "failed" | "aborted"
    snapshot: RunExecutionSnapshot
    budget: RunBudget
    deadlineAt: string
    failure: { code: string; message: string } | null
    cancellationKind: "requested" | "ancestor" | null
    cancellationRequestedAt: string | null
    cancellationSourceRunId: string | null
    startedAt: string
    finishedAt: string
    createdAt: string
    updatedAt: string
  }[]
  attempts: readonly {
    id: string
    runId: string
    sessionId: string
    ordinal: number
    streamId: string
    status: "succeeded" | "failed" | "aborted"
    snapshot: RunExecutionSnapshot
    budget: RunBudget
    failure: { code: string; message: string } | null
    startedAt: string
    finishedAt: string
    createdAt: string
    updatedAt: string
  }[]
  tools: readonly {
    runId: string
    toolCallId: string
    toolName: string
    output: string
    result: string
    outcome: "error" | "success"
    workingDirectory: string
  }[]
  delegations: readonly {
    id: string
    parentRunId: string
    parentAttemptId: string
    childRunId: string
    delegationKey: string
    rootOrdinal: number
    depth: number
    task: string
    finalizedResult:
      | { status: "succeeded"; text: string }
      | { failure: { code: string; message: string }; status: "failed"; text: string }
      | { failure: { code: string; message: string }; status: "aborted"; text: string }
  }[]
  sessionViews: readonly {
    sessionId: string
    acknowledgedFinishedAt: string
    createdAt: string
    updatedAt: string
  }[]
}

export const exampleDataFixture = {
  user: {
    id: "development:local-development",
    displayName: "Local Development",
    email: "local-development@example.test",
    createdAt: "2026-08-12T08:00:00.000Z",
    updatedAt: "2026-08-12T08:00:00.000Z",
  },
  organization: {
    id: "contentoren",
    name: "Contentoren",
    createdAt: "2026-08-12T07:59:00.000Z",
    updatedAt: "2026-08-12T07:59:00.000Z",
  },
  organizationMembership: {
    issuer: "urn:codeline:development",
    subject: "local-development",
    createdAt: "2026-08-12T08:00:30.000Z",
    updatedAt: "2026-08-12T08:00:30.000Z",
  },
  servers: [
    {
      id: "example-server-local",
      organizationId: "contentoren",
      name: "Example Local Server",
      endpoint: "http://example-local-server.test",
      metadata: { fixture: "codeline-example-v1" },
      createdAt: "2026-08-12T08:01:00.000Z",
      updatedAt: "2026-08-12T08:01:00.000Z",
    },
    {
      id: "example-server-remote",
      organizationId: "contentoren",
      name: "Example Remote Server",
      endpoint: "http://example-remote-server.test",
      metadata: { fixture: "codeline-example-v1" },
      createdAt: "2026-08-12T08:01:30.000Z",
      updatedAt: "2026-08-12T08:01:30.000Z",
    },
  ],
  agents: [
    {
      id: "example-agent-local",
      serverId: "example-server-local",
      name: "Example Coding Agent",
      role: "coding",
      configuration: {
        model: "development-default",
        provider: "deterministic",
        tools: { bash: false, webfetch: false },
      },
      sortOrder: 0,
      createdAt: "2026-08-12T08:02:00.000Z",
      updatedAt: "2026-08-12T08:02:00.000Z",
    },
    {
      id: "example-agent-local-review",
      serverId: "example-server-local",
      name: "Example Review Agent",
      role: "review",
      configuration: {
        model: "development-default",
        provider: "deterministic",
        tools: { bash: false, webfetch: false },
      },
      sortOrder: 1,
      createdAt: "2026-08-12T08:02:20.000Z",
      updatedAt: "2026-08-12T08:02:20.000Z",
    },
    {
      id: "example-agent-remote",
      serverId: "example-server-remote",
      name: "Example Remote Agent",
      role: "coding",
      configuration: {
        model: "development-default",
        provider: "deterministic",
        tools: { bash: false, webfetch: false },
      },
      sortOrder: 0,
      createdAt: "2026-08-12T08:02:40.000Z",
      updatedAt: "2026-08-12T08:02:40.000Z",
    },
    ...Object.values(simulationScenarioSessionMetadata).map((scenario, index) => ({
      id: scenario.agentId,
      serverId: "example-server-local",
      name: `Simulation ${scenario.model} Agent`,
      role: "simulation",
      configuration: {
        model: scenario.model,
        provider: "deterministic" as const,
        tools: { bash: false, webfetch: false },
        ...("agentConfiguration" in scenario ? scenario.agentConfiguration : {}),
      },
      sortOrder: index + 2,
      createdAt: `2026-08-12T08:${String(20 + index).padStart(2, "0")}:00.000Z`,
      updatedAt: `2026-08-12T08:${String(20 + index).padStart(2, "0")}:00.000Z`,
    })),
  ],
  projects: [
    {
      id: "11111111-1111-7111-8111-111111111111",
      path: exampleDataProjectPaths.adaptive,
      displayName: "Adaptive example project",
      folderKey: "adaptive",
      createdAt: "2026-08-12T08:02:50.000Z",
      updatedAt: "2026-08-12T08:02:50.000Z",
    },
    {
      id: "22222222-2222-7222-8222-222222222222",
      path: exampleDataProjectPaths.leo,
      displayName: "Leo example project",
      folderKey: "leo",
      createdAt: "2026-08-12T08:02:55.000Z",
      updatedAt: "2026-08-12T08:02:55.000Z",
    },
    {
      id: "33333333-3333-7333-8333-333333333333",
      path: exampleDataProjectPaths.personal,
      displayName: "Personal example project",
      folderKey: "personal",
      createdAt: "2026-08-12T08:02:59.000Z",
      updatedAt: "2026-08-12T08:02:59.000Z",
    },
  ],
  sessions: [
    {
      id: "example-session-active-1",
      serverId: "example-server-local",
      primaryAgentId: "example-agent-local",
      projectPath: exampleDataProjectPaths.adaptive,
      pinned: true,
      parentSessionId: null,
      title: "Build the workspace shell",
      clientRequestId: "example-session-request-active-1",
      metadata: { fixture: "codeline-example-v1" },
      archivedAt: null,
      createdAt: "2026-08-12T08:03:00.000Z",
      updatedAt: "2026-08-12T08:05:00.000Z",
      messages: [
        {
          id: "example-message-active-1-user",
          role: "user",
          sequence: 1,
          content: "Create a focused workspace shell for local development.",
          clientRequestId: "example-message-request-active-1-user",
          metadata: { fixture: "codeline-example-v1" },
          finalizedAt: "2026-08-12T08:04:00.000Z",
          createdAt: "2026-08-12T08:04:00.000Z",
        },
        {
          id: "example-message-active-1-assistant",
          role: "assistant",
          sequence: 2,
          content: "The workspace shell is ready for local sessions.",
          clientRequestId: "example-message-request-active-1-assistant",
          metadata: { fixture: "codeline-example-v1" },
          finalizedAt: "2026-08-12T08:05:00.000Z",
          createdAt: "2026-08-12T08:05:00.000Z",
        },
      ],
    },
    {
      id: "example-session-active-2",
      serverId: "example-server-local",
      primaryAgentId: "example-agent-local",
      projectPath: exampleDataProjectPaths.leo,
      pinned: false,
      parentSessionId: "example-session-active-1",
      title: "Verify synchronized messages",
      clientRequestId: "example-session-request-active-2",
      metadata: { fixture: "codeline-example-v1" },
      archivedAt: null,
      createdAt: "2026-08-12T08:06:00.000Z",
      updatedAt: "2026-08-12T08:08:00.000Z",
      messages: [
        {
          id: "example-message-active-2-user",
          role: "user",
          sequence: 1,
          content: "Confirm that finalized messages synchronize into the browser.",
          clientRequestId: "example-message-request-active-2-user",
          metadata: { fixture: "codeline-example-v1" },
          finalizedAt: "2026-08-12T08:07:00.000Z",
          createdAt: "2026-08-12T08:07:00.000Z",
        },
        {
          id: "example-message-active-2-assistant",
          role: "assistant",
          sequence: 2,
          content: "The synchronized message view is available.",
          clientRequestId: "example-message-request-active-2-assistant",
          metadata: { fixture: "codeline-example-v1" },
          finalizedAt: "2026-08-12T08:08:00.000Z",
          createdAt: "2026-08-12T08:08:00.000Z",
        },
      ],
    },
    {
      id: "example-session-archived-1",
      serverId: "example-server-local",
      primaryAgentId: "example-agent-local",
      projectPath: exampleDataProjectPaths.personal,
      pinned: true,
      parentSessionId: "example-session-active-2",
      title: "Archive the completed walkthrough",
      clientRequestId: "example-session-request-archived-1",
      metadata: { fixture: "codeline-example-v1" },
      archivedAt: "2026-08-12T08:11:00.000Z",
      createdAt: "2026-08-12T08:09:00.000Z",
      updatedAt: "2026-08-12T08:11:00.000Z",
      messages: [
        {
          id: "example-message-archived-1-user",
          role: "user",
          sequence: 1,
          content: "Keep this completed walkthrough available as history.",
          clientRequestId: "example-message-request-archived-1-user",
          metadata: { fixture: "codeline-example-v1" },
          finalizedAt: "2026-08-12T08:10:00.000Z",
          createdAt: "2026-08-12T08:10:00.000Z",
        },
        {
          id: "example-message-archived-1-assistant",
          role: "assistant",
          sequence: 2,
          content: "The completed walkthrough is archived without losing its messages.",
          clientRequestId: "example-message-request-archived-1-assistant",
          metadata: { fixture: "codeline-example-v1" },
          finalizedAt: "2026-08-12T08:11:00.000Z",
          createdAt: "2026-08-12T08:11:00.000Z",
        },
      ],
    },
    {
      id: "example-session-remote-1",
      serverId: "example-server-remote",
      primaryAgentId: "example-agent-remote",
      projectPath: exampleDataProjectPaths.personal,
      pinned: true,
      parentSessionId: null,
      title: "Switch to the remote server",
      clientRequestId: "example-session-request-remote-1",
      metadata: { fixture: "codeline-example-v1" },
      archivedAt: null,
      createdAt: "2026-08-12T08:12:00.000Z",
      updatedAt: "2026-08-12T08:13:00.000Z",
      messages: [
        {
          id: "example-message-remote-1-user",
          role: "user",
          sequence: 1,
          content: "Start a conversation on the remote example server.",
          clientRequestId: "example-message-request-remote-1-user",
          metadata: { fixture: "codeline-example-v1" },
          finalizedAt: "2026-08-12T08:12:30.000Z",
          createdAt: "2026-08-12T08:12:30.000Z",
        },
        {
          id: "example-message-remote-1-assistant",
          role: "assistant",
          sequence: 2,
          content: "The remote example server is handling this session.",
          clientRequestId: "example-message-request-remote-1-assistant",
          metadata: { fixture: "codeline-example-v1" },
          finalizedAt: "2026-08-12T08:13:00.000Z",
          createdAt: "2026-08-12T08:13:00.000Z",
        },
      ],
    },
    ...Object.values(simulationScenarioSessionMetadata).map((scenario, index) => ({
      id: scenario.sessionId,
      serverId: "example-server-local",
      primaryAgentId: scenario.agentId,
      projectPath:
        [exampleDataProjectPaths.adaptive, exampleDataProjectPaths.leo, exampleDataProjectPaths.personal][index % 3] ??
        exampleDataProjectPaths.personal,
      pinned: index % 2 === 0,
      parentSessionId: null,
      title: `Simulation ${scenario.model} session`,
      clientRequestId: `${scenario.sessionId}-request`,
      metadata: { fixture: "codeline-example-v1" },
      archivedAt: null,
      createdAt: `2026-08-12T08:${String(30 + index).padStart(2, "0")}:00.000Z`,
      updatedAt: `2026-08-12T08:${String(30 + index).padStart(2, "0")}:00.000Z`,
      messages: [],
    })),
  ],
  runs: [
    {
      id: "example-run-ended-1",
      sessionId: "example-session-active-2",
      clientRunId: "example-client-run-ended-1",
      streamId: "example-stream-ended-1",
      outcome: "completed",
      status: "succeeded",
      snapshot: exampleDataRunSnapshotCreate("example-agent-local", "example-server-local"),
      budget: exampleDataRunBudget,
      deadlineAt: "2026-08-12T08:11:30.000Z",
      failure: null,
      cancellationKind: null,
      cancellationRequestedAt: null,
      cancellationSourceRunId: null,
      startedAt: "2026-08-12T08:07:00.000Z",
      finishedAt: "2026-08-12T08:08:30.000Z",
      createdAt: "2026-08-12T08:06:30.000Z",
      updatedAt: "2026-08-12T08:08:30.000Z",
    },
    {
      id: "example-run-completed-2",
      sessionId: "example-session-active-1",
      clientRunId: "example-client-run-completed-2",
      streamId: "example-stream-completed-2",
      outcome: "completed",
      status: "succeeded",
      snapshot: exampleDataRunSnapshotCreate("example-agent-local", "example-server-local"),
      budget: exampleDataRunBudget,
      deadlineAt: "2026-08-12T08:19:00.000Z",
      failure: null,
      cancellationKind: null,
      cancellationRequestedAt: null,
      cancellationSourceRunId: null,
      startedAt: "2026-08-12T08:14:00.000Z",
      finishedAt: "2026-08-12T08:15:30.000Z",
      createdAt: "2026-08-12T08:13:30.000Z",
      updatedAt: "2026-08-12T08:15:30.000Z",
    },
    {
      id: "example-run-failed-1",
      sessionId: "example-session-archived-1",
      clientRunId: "example-client-run-failed-1",
      streamId: "example-stream-failed-1",
      outcome: "failed",
      status: "failed",
      snapshot: exampleDataRunSnapshotCreate("example-agent-local", "example-server-local"),
      budget: exampleDataRunBudget,
      deadlineAt: "2026-08-12T08:21:30.000Z",
      failure: { code: "example_provider_failed", message: "The deterministic example provider failed." },
      cancellationKind: null,
      cancellationRequestedAt: null,
      cancellationSourceRunId: null,
      startedAt: "2026-08-12T08:16:00.000Z",
      finishedAt: "2026-08-12T08:17:00.000Z",
      createdAt: "2026-08-12T08:15:30.000Z",
      updatedAt: "2026-08-12T08:17:00.000Z",
    },
    {
      id: "example-run-cancelled-1",
      sessionId: "example-session-remote-1",
      clientRunId: "example-client-run-cancelled-1",
      streamId: "example-stream-cancelled-1",
      outcome: "cancelled",
      status: "aborted",
      snapshot: exampleDataRunSnapshotCreate("example-agent-remote", "example-server-remote"),
      budget: exampleDataRunBudget,
      deadlineAt: "2026-08-12T08:23:30.000Z",
      failure: null,
      cancellationKind: "requested",
      cancellationRequestedAt: "2026-08-12T08:19:30.000Z",
      cancellationSourceRunId: null,
      startedAt: "2026-08-12T08:18:00.000Z",
      finishedAt: "2026-08-12T08:19:00.000Z",
      createdAt: "2026-08-12T08:17:30.000Z",
      updatedAt: "2026-08-12T08:19:00.000Z",
    },
    {
      id: "example-run-interrupted-1",
      sessionId: "example-session-active-1",
      clientRunId: "example-client-run-interrupted-1",
      streamId: "example-stream-interrupted-1",
      outcome: "interrupted",
      status: "aborted",
      snapshot: exampleDataRunSnapshotCreate("example-agent-local", "example-server-local"),
      budget: exampleDataRunBudget,
      deadlineAt: "2026-08-12T08:25:30.000Z",
      failure: { code: "chat_interrupted", message: "The API process stopped while the run was active." },
      cancellationKind: null,
      cancellationRequestedAt: null,
      cancellationSourceRunId: null,
      startedAt: "2026-08-12T08:20:00.000Z",
      finishedAt: "2026-08-12T08:21:00.000Z",
      createdAt: "2026-08-12T08:19:30.000Z",
      updatedAt: "2026-08-12T08:21:00.000Z",
    },
    {
      id: "example-run-delegating-1",
      sessionId: "example-session-active-1",
      clientRunId: "example-client-run-delegating-1",
      streamId: "example-stream-delegating-1",
      outcome: "completed",
      status: "succeeded",
      snapshot: exampleDataRunSnapshotCreate("example-agent-local", "example-server-local"),
      budget: { ...exampleDataRunBudget, maxChildDepth: 1, maxChildRuns: 2 },
      deadlineAt: "2026-08-12T08:27:30.000Z",
      failure: null,
      cancellationKind: null,
      cancellationRequestedAt: null,
      cancellationSourceRunId: null,
      startedAt: "2026-08-12T08:22:00.000Z",
      finishedAt: "2026-08-12T08:24:00.000Z",
      createdAt: "2026-08-12T08:21:30.000Z",
      updatedAt: "2026-08-12T08:24:00.000Z",
    },
    {
      id: "example-run-child-1",
      sessionId: "example-session-active-1",
      clientRunId: "child-run:example-run-child-1",
      streamId: "run-child:example-run-child-1",
      outcome: "completed",
      status: "succeeded",
      snapshot: exampleDataRunSnapshotCreate("example-agent-local-review", "example-server-local"),
      budget: { ...exampleDataRunBudget, maxChildDepth: 1, maxChildRuns: 2 },
      deadlineAt: "2026-08-12T08:27:30.000Z",
      failure: null,
      cancellationKind: null,
      cancellationRequestedAt: null,
      cancellationSourceRunId: null,
      startedAt: "2026-08-12T08:22:30.000Z",
      finishedAt: "2026-08-12T08:23:30.000Z",
      createdAt: "2026-08-12T08:22:30.000Z",
      updatedAt: "2026-08-12T08:23:30.000Z",
    },
  ],
  attempts: [
    {
      id: "example-attempt-ended-1",
      runId: "example-run-ended-1",
      sessionId: "example-session-active-2",
      ordinal: 1,
      streamId: "example-stream-ended-1",
      status: "succeeded",
      snapshot: exampleDataRunSnapshotCreate("example-agent-local", "example-server-local"),
      budget: exampleDataRunBudget,
      failure: null,
      startedAt: "2026-08-12T08:07:00.000Z",
      finishedAt: "2026-08-12T08:08:30.000Z",
      createdAt: "2026-08-12T08:06:30.000Z",
      updatedAt: "2026-08-12T08:08:30.000Z",
    },
    {
      id: "example-attempt-completed-2",
      runId: "example-run-completed-2",
      sessionId: "example-session-active-1",
      ordinal: 1,
      streamId: "example-stream-completed-2",
      status: "succeeded",
      snapshot: exampleDataRunSnapshotCreate("example-agent-local", "example-server-local"),
      budget: exampleDataRunBudget,
      failure: null,
      startedAt: "2026-08-12T08:14:00.000Z",
      finishedAt: "2026-08-12T08:15:30.000Z",
      createdAt: "2026-08-12T08:13:30.000Z",
      updatedAt: "2026-08-12T08:15:30.000Z",
    },
    {
      id: "example-attempt-failed-1",
      runId: "example-run-failed-1",
      sessionId: "example-session-archived-1",
      ordinal: 1,
      streamId: "example-stream-failed-1",
      status: "failed",
      snapshot: exampleDataRunSnapshotCreate("example-agent-local", "example-server-local"),
      budget: exampleDataRunBudget,
      failure: { code: "example_provider_failed", message: "The deterministic example provider failed." },
      startedAt: "2026-08-12T08:16:00.000Z",
      finishedAt: "2026-08-12T08:17:00.000Z",
      createdAt: "2026-08-12T08:15:30.000Z",
      updatedAt: "2026-08-12T08:17:00.000Z",
    },
    {
      id: "example-attempt-cancelled-1",
      runId: "example-run-cancelled-1",
      sessionId: "example-session-remote-1",
      ordinal: 1,
      streamId: "example-stream-cancelled-1",
      status: "aborted",
      snapshot: exampleDataRunSnapshotCreate("example-agent-remote", "example-server-remote"),
      budget: exampleDataRunBudget,
      failure: null,
      startedAt: "2026-08-12T08:18:00.000Z",
      finishedAt: "2026-08-12T08:19:00.000Z",
      createdAt: "2026-08-12T08:17:30.000Z",
      updatedAt: "2026-08-12T08:19:00.000Z",
    },
    {
      id: "example-attempt-interrupted-1",
      runId: "example-run-interrupted-1",
      sessionId: "example-session-active-1",
      ordinal: 1,
      streamId: "example-stream-interrupted-1",
      status: "aborted",
      snapshot: exampleDataRunSnapshotCreate("example-agent-local", "example-server-local"),
      budget: exampleDataRunBudget,
      failure: { code: "chat_interrupted", message: "The API process stopped while the run was active." },
      startedAt: "2026-08-12T08:20:00.000Z",
      finishedAt: "2026-08-12T08:21:00.000Z",
      createdAt: "2026-08-12T08:19:30.000Z",
      updatedAt: "2026-08-12T08:21:00.000Z",
    },
    {
      id: "example-attempt-delegating-1",
      runId: "example-run-delegating-1",
      sessionId: "example-session-active-1",
      ordinal: 1,
      streamId: "example-stream-delegating-1",
      status: "succeeded",
      snapshot: exampleDataRunSnapshotCreate("example-agent-local", "example-server-local"),
      budget: { ...exampleDataRunBudget, maxChildDepth: 1, maxChildRuns: 2 },
      failure: null,
      startedAt: "2026-08-12T08:22:00.000Z",
      finishedAt: "2026-08-12T08:24:00.000Z",
      createdAt: "2026-08-12T08:21:30.000Z",
      updatedAt: "2026-08-12T08:24:00.000Z",
    },
    {
      id: "example-attempt-child-1",
      runId: "example-run-child-1",
      sessionId: "example-session-active-1",
      ordinal: 1,
      streamId: "run-child:example-run-child-1",
      status: "succeeded",
      snapshot: exampleDataRunSnapshotCreate("example-agent-local-review", "example-server-local"),
      budget: { ...exampleDataRunBudget, maxChildDepth: 1, maxChildRuns: 2 },
      failure: null,
      startedAt: "2026-08-12T08:22:30.000Z",
      finishedAt: "2026-08-12T08:23:30.000Z",
      createdAt: "2026-08-12T08:22:30.000Z",
      updatedAt: "2026-08-12T08:23:30.000Z",
    },
  ],
  tools: [
    {
      runId: "example-run-ended-1",
      toolCallId: "example-tool-ended-read",
      toolName: "read",
      output: "Read the workspace shell configuration.",
      result: "The workspace shell configuration is valid.",
      outcome: "success",
      workingDirectory: "/workspace/adaptive",
    },
    {
      runId: "example-run-ended-1",
      toolCallId: "example-tool-ended-write",
      toolName: "write",
      output: "Prepared the shell update.",
      result: "The shell update was written.",
      outcome: "success",
      workingDirectory: "/workspace/adaptive",
    },
    {
      runId: "example-run-completed-2",
      toolCallId: "example-tool-completed-search",
      toolName: "search",
      output: "Searched the synchronized message records.",
      result: "Found the expected message records.",
      outcome: "success",
      workingDirectory: "/workspace/leo",
    },
    {
      runId: "example-run-completed-2",
      toolCallId: "example-tool-completed-test",
      toolName: "test",
      output: "Ran the synchronization checks.",
      result: "All synchronization checks passed.",
      outcome: "success",
      workingDirectory: "/workspace/leo",
    },
    {
      runId: "example-run-failed-1",
      toolCallId: "example-tool-failed-lint",
      toolName: "lint",
      output: "Checked the archived walkthrough.",
      result: "The archived walkthrough contains a deterministic lint failure.",
      outcome: "error",
      workingDirectory: "/workspace/personal",
    },
    {
      runId: "example-run-failed-1",
      toolCallId: "example-tool-failed-log",
      toolName: "log",
      output: "Collected the provider failure log.",
      result: "The provider returned example_provider_failed.",
      outcome: "error",
      workingDirectory: "/workspace/personal",
    },
    {
      runId: "example-run-cancelled-1",
      toolCallId: "example-tool-cancelled-inspect",
      toolName: "inspect",
      output: "Inspected the remote project state.",
      result: "The remote project was ready for the requested change.",
      outcome: "success",
      workingDirectory: "/workspace/personal",
    },
    {
      runId: "example-run-cancelled-1",
      toolCallId: "example-tool-cancelled-patch",
      toolName: "patch",
      output: "Prepared the remote project patch.",
      result: "The patch was not applied because the run was cancelled.",
      outcome: "error",
      workingDirectory: "/workspace/personal",
    },
    {
      runId: "example-run-interrupted-1",
      toolCallId: "example-tool-interrupted-read",
      toolName: "read",
      output: "Read the active interrupted run state.",
      result: "The active state was retained before interruption.",
      outcome: "success",
      workingDirectory: "/workspace/adaptive",
    },
    {
      runId: "example-run-interrupted-1",
      toolCallId: "example-tool-interrupted-status",
      toolName: "status",
      output: "Checked the active provider status.",
      result: "The provider stopped before completion.",
      outcome: "error",
      workingDirectory: "/workspace/adaptive",
    },
    {
      runId: "example-run-delegating-1",
      toolCallId: "example-tool-delegating-read",
      toolName: "read",
      output: "Read the parent task context.",
      result: "The parent task is ready for delegation.",
      outcome: "success",
      workingDirectory: "/workspace/adaptive",
    },
    {
      runId: "example-run-delegating-1",
      toolCallId: "example-tool-delegating-plan",
      toolName: "plan",
      output: "Prepared the delegated task plan.",
      result: "The child task plan was accepted.",
      outcome: "success",
      workingDirectory: "/workspace/adaptive",
    },
    {
      runId: "example-run-child-1",
      toolCallId: "example-tool-child-write",
      toolName: "write",
      output: "Prepared the child implementation.",
      result: "The child implementation was written.",
      outcome: "success",
      workingDirectory: "/workspace/adaptive",
    },
    {
      runId: "example-run-child-1",
      toolCallId: "example-tool-child-test",
      toolName: "test",
      output: "Ran the child verification suite.",
      result: "The child verification suite passed.",
      outcome: "success",
      workingDirectory: "/workspace/adaptive",
    },
    {
      runId: "example-run-child-1",
      toolCallId: "example-tool-child-verify",
      toolName: "verify",
      output: "Checked the child output.",
      result: "The child output is ready for the parent.",
      outcome: "success",
      workingDirectory: "/workspace/adaptive",
    },
  ],
  delegations: [
    {
      id: "example-delegation-1",
      parentRunId: "example-run-delegating-1",
      parentAttemptId: "example-attempt-delegating-1",
      childRunId: "example-run-child-1",
      delegationKey: "example-delegation-tool",
      rootOrdinal: 1,
      depth: 1,
      task: "Implement and verify the delegated example task.",
      finalizedResult: {
        status: "succeeded",
        text: "The delegated example task is complete.",
      },
    },
  ],
  sessionViews: [
    {
      sessionId: "example-session-active-2",
      acknowledgedFinishedAt: "2026-08-12T08:08:00.000Z",
      createdAt: "2026-08-12T08:08:00.000Z",
      updatedAt: "2026-08-12T08:08:00.000Z",
    },
  ],
} satisfies ExampleDataFixture
