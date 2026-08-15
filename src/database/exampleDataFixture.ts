import type { AgentConfiguration } from "../agents/schema/agentConfigurationSchema.js"
import { simulationScenarioSessionMetadata } from "../simulation/simulationScenarioSessionMetadata.js"

type ExampleDataFixture = {
  user: {
    id: string
    displayName: string
    email: string
    createdAt: string
    updatedAt: string
  }
  servers: readonly {
    id: string
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
  sessions: readonly {
    id: string
    serverId: string
    primaryAgentId: string
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
}

export const exampleDataFixture = {
  user: {
    id: "development:local-development",
    displayName: "Local Development",
    email: "local-development@example.test",
    createdAt: "2026-08-12T08:00:00.000Z",
    updatedAt: "2026-08-12T08:00:00.000Z",
  },
  servers: [
    {
      id: "example-server-local",
      name: "Example Local Server",
      endpoint: "http://example-local-server.test",
      metadata: { fixture: "codeline-example-v1" },
      createdAt: "2026-08-12T08:01:00.000Z",
      updatedAt: "2026-08-12T08:01:00.000Z",
    },
    {
      id: "example-server-remote",
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
      configuration: { model: "development-default", provider: "deterministic" },
      sortOrder: 0,
      createdAt: "2026-08-12T08:02:00.000Z",
      updatedAt: "2026-08-12T08:02:00.000Z",
    },
    {
      id: "example-agent-local-review",
      serverId: "example-server-local",
      name: "Example Review Agent",
      role: "review",
      configuration: { model: "development-default", provider: "deterministic" },
      sortOrder: 1,
      createdAt: "2026-08-12T08:02:20.000Z",
      updatedAt: "2026-08-12T08:02:20.000Z",
    },
    {
      id: "example-agent-remote",
      serverId: "example-server-remote",
      name: "Example Remote Agent",
      role: "coding",
      configuration: { model: "development-default", provider: "deterministic" },
      sortOrder: 0,
      createdAt: "2026-08-12T08:02:40.000Z",
      updatedAt: "2026-08-12T08:02:40.000Z",
    },
    ...Object.values(simulationScenarioSessionMetadata).map((scenario, index) => ({
      id: scenario.agentId,
      serverId: "example-server-local",
      name: `Simulation ${scenario.model} Agent`,
      role: "simulation",
      configuration: { model: scenario.model, provider: "deterministic" as const },
      sortOrder: index + 2,
      createdAt: `2026-08-12T08:${String(20 + index).padStart(2, "0")}:00.000Z`,
      updatedAt: `2026-08-12T08:${String(20 + index).padStart(2, "0")}:00.000Z`,
    })),
  ],
  sessions: [
    {
      id: "example-session-active-1",
      serverId: "example-server-local",
      primaryAgentId: "example-agent-local",
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
} satisfies ExampleDataFixture
