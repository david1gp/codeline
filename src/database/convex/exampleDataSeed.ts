import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericMutationCtx } from "convex/server"
import { type AgentCatalogReconcileInput, agentCatalogReconcile } from "../../agents/convex/agentCatalogReconcile.js"
import type { AgentConfiguration } from "../../agents/schema/agentConfigurationSchema.js"
import { identityExternalIdentityUpsert } from "../../identity/convex/identityExternalIdentityUpsert.js"
import { identityOrganizationMembershipUpsert } from "../../identity/convex/identityOrganizationMembershipUpsert.js"
import { identityUserUpsert } from "../../identity/convex/identityUserUpsert.js"
import { providerAgentCatalogAgentNameCreate } from "../../providers/catalog/providerAgentCatalogAgentNameCreate.js"
import { serverReconcile } from "../../servers/convex/serverReconcile.js"
import { exampleDataFixture } from "../exampleDataFixture.js"
import { exampleDataReset } from "./exampleDataReset.js"

type ExampleDataMutationContext = Pick<GenericMutationCtx<any>, "db">

type ExampleDataCatalogConfiguration = {
  id: string
  configuration: AgentConfiguration
}

type ExampleDataSeedInput = {
  catalogConfigurations: readonly ExampleDataCatalogConfiguration[]
  organizationExternalId: string
  reset?: boolean
}

type ExampleDataSeedCounts = {
  agentCount: number
  catalogAgentCount: number
  messageCount: number
  membershipCount: number
  organizationCount: number
  serverCount: number
  sessionCount: number
  userCount: number
}

function timestamp(value: string): number {
  return Date.parse(value)
}

function catalogAgentMode(configuration: AgentConfiguration): "primary" | "subagent" {
  if (configuration.provider === "deterministic") return "subagent"
  return configuration.catalogAgent?.mode ?? "subagent"
}

function catalogConfigurationsReconcile(
  catalogConfigurations: readonly ExampleDataCatalogConfiguration[],
): Result<ExampleDataCatalogConfiguration[]> {
  const op = "exampleDataSeed"
  const knownAgentIds = new Set(exampleDataFixture.agents.map((agent) => agent.id))
  const catalogAgentIds = new Set<string>()
  for (const catalogAgent of catalogConfigurations) {
    if (catalogAgent.id.trim().length === 0 || knownAgentIds.has(catalogAgent.id)) {
      return createResultError(op, "The provider catalog contains an invalid or conflicting agent ID.")
    }
    if (catalogAgentIds.has(catalogAgent.id)) {
      return createResultError(op, "The provider catalog contains duplicate agent IDs.")
    }
    catalogAgentIds.add(catalogAgent.id)
  }
  return createResult([...catalogConfigurations].sort((left, right) => left.id.localeCompare(right.id)))
}

async function organizationReconcile(
  context: ExampleDataMutationContext,
  organizationExternalId: string,
): Promise<Result<void>> {
  const op = "exampleDataOrganizationReconcile"
  const fixtureOrganization = exampleDataFixture.organization
  const existingOrganization = await context.db
    .query("organizations")
    .withIndex("id", (query: any) => query.eq("id", fixtureOrganization.id))
    .first()

  if (existingOrganization !== null && existingOrganization.externalId !== organizationExternalId) {
    return createResultError(
      op,
      "The configured Contentoren organization external ID conflicts with the existing organization.",
    )
  }

  if (existingOrganization === null) {
    const externalOrganization = await context.db
      .query("organizations")
      .withIndex("externalId", (query: any) => query.eq("externalId", organizationExternalId))
      .first()
    if (externalOrganization !== null) {
      return createResultError(
        op,
        "The configured Contentoren organization external ID belongs to another organization.",
      )
    }
  }

  const fields = {
    externalId: organizationExternalId,
    id: fixtureOrganization.id,
    name: fixtureOrganization.name,
    createdAt: timestamp(fixtureOrganization.createdAt),
    updatedAt: timestamp(fixtureOrganization.updatedAt),
  }
  if (existingOrganization === null) {
    await context.db.insert("organizations", fields)
    return createResult(undefined)
  }
  await context.db.patch("organizations", existingOrganization._id, fields)
  return createResult(undefined)
}

async function serversReconcile(context: ExampleDataMutationContext): Promise<void> {
  for (const server of exampleDataFixture.servers) {
    const reconciled = await serverReconcile(context, {
      endpoint: server.endpoint,
      id: server.id,
      metadata: server.metadata,
      name: server.name,
      organizationId: server.organizationId,
      createdAt: timestamp(server.createdAt),
      updatedAt: timestamp(server.updatedAt),
    })
    if (!reconciled.success) throw new Error(reconciled.errorMessage)
  }
}

async function agentsReconcile(
  context: ExampleDataMutationContext,
  catalogConfigurations: readonly ExampleDataCatalogConfiguration[],
): Promise<void> {
  const fixtureAgents: AgentCatalogReconcileInput[] = exampleDataFixture.agents.map((agent) => ({
    configuration: agent.configuration,
    createdAt: timestamp(agent.createdAt),
    id: agent.id,
    name: agent.name,
    role: agent.role,
    serverId: agent.serverId,
    sortOrder: agent.sortOrder,
    updatedAt: timestamp(agent.updatedAt),
  }))
  const catalogAgents: AgentCatalogReconcileInput[] = catalogConfigurations.map(({ configuration, id }, sortOrder) => ({
    configuration,
    createdAt: timestamp(`2026-08-12T09:${String(sortOrder).padStart(2, "0")}:00.000Z`),
    id,
    name: providerAgentCatalogAgentNameCreate(id),
    ...(catalogAgentMode(configuration) === "subagent" ? { parentAgentId: "delegate" } : {}),
    role: catalogAgentMode(configuration),
    serverId: "example-server-local",
    sortOrder,
    updatedAt: timestamp(`2026-08-12T09:${String(sortOrder).padStart(2, "0")}:00.000Z`),
  }))
  const reconciled = await agentCatalogReconcile(context, exampleDataFixture.organization.id, [
    ...fixtureAgents,
    ...catalogAgents,
  ])
  if (!reconciled.success) throw new Error(reconciled.errorMessage)
}

async function sessionsAndMessagesReconcile(context: ExampleDataMutationContext): Promise<void> {
  for (const fixtureSession of exampleDataFixture.sessions) {
    const existingSession = await context.db
      .query("sessions")
      .withIndex("id", (query: any) => query.eq("id", fixtureSession.id))
      .first()
    const session = {
      id: fixtureSession.id,
      userId: exampleDataFixture.user.id,
      serverId: fixtureSession.serverId,
      primaryAgentId: fixtureSession.primaryAgentId,
      projectPath: fixtureSession.projectPath,
      ...(fixtureSession.parentSessionId === null ? {} : { parentSessionId: fixtureSession.parentSessionId }),
      title: fixtureSession.title,
      clientRequestId: fixtureSession.clientRequestId,
      metadata: fixtureSession.metadata,
      pinned: fixtureSession.pinned,
      ...(fixtureSession.archivedAt === null ? {} : { archivedAt: timestamp(fixtureSession.archivedAt) }),
      createdAt: timestamp(fixtureSession.createdAt),
      updatedAt: timestamp(fixtureSession.updatedAt),
    }
    if (existingSession === null) await context.db.insert("sessions", session)
    else await context.db.replace("sessions", existingSession._id, session)

    for (const fixtureMessage of fixtureSession.messages) {
      const existingMessage = await context.db
        .query("messages")
        .withIndex("id", (query: any) => query.eq("id", fixtureMessage.id))
        .first()
      const message = {
        id: fixtureMessage.id,
        sessionId: fixtureSession.id,
        agentId: fixtureSession.primaryAgentId,
        role: fixtureMessage.role,
        sequence: fixtureMessage.sequence,
        content: fixtureMessage.content,
        clientRequestId: fixtureMessage.clientRequestId,
        metadata: fixtureMessage.metadata,
        finalizedAt: timestamp(fixtureMessage.finalizedAt),
        createdAt: timestamp(fixtureMessage.createdAt),
      }
      if (existingMessage === null) await context.db.insert("messages", message)
      else await context.db.replace("messages", existingMessage._id, message)
    }
  }
}

export async function exampleDataSeed(
  context: ExampleDataMutationContext,
  input: ExampleDataSeedInput,
): Promise<Result<ExampleDataSeedCounts>> {
  const op = "exampleDataSeed"
  if (input.organizationExternalId.trim().length === 0) {
    return createResultError(op, "The Contentoren organization external ID is required.")
  }
  const catalogConfigurations = catalogConfigurationsReconcile(input.catalogConfigurations)
  if (!catalogConfigurations.success) return catalogConfigurations

  try {
    const organization = await organizationReconcile(context, input.organizationExternalId)
    if (!organization.success) return createResultError(op, organization.errorMessage)

    if (input.reset === true) {
      const reset = await exampleDataReset(context)
      if (!reset.success) return createResultError(op, reset.errorMessage)
    }

    const user = exampleDataFixture.user
    const seededUser = await identityUserUpsert(context, {
      displayName: user.displayName,
      email: user.email,
      id: user.id,
      now: timestamp(user.updatedAt),
    })
    if (!seededUser.success) return createResultError(op, seededUser.errorMessage)

    const externalIdentity = await identityExternalIdentityUpsert(context, {
      issuer: exampleDataFixture.organizationMembership.issuer,
      now: timestamp(exampleDataFixture.organizationMembership.updatedAt),
      subject: exampleDataFixture.organizationMembership.subject,
      userId: user.id,
    })
    if (!externalIdentity.success) return createResultError(op, externalIdentity.errorMessage)

    const membership = await identityOrganizationMembershipUpsert(context, {
      issuer: exampleDataFixture.organizationMembership.issuer,
      organizationExternalId: input.organizationExternalId,
      now: timestamp(exampleDataFixture.organizationMembership.updatedAt),
      subject: exampleDataFixture.organizationMembership.subject,
      userId: user.id,
    })
    if (!membership.success) return createResultError(op, membership.errorMessage)

    await serversReconcile(context)
    await agentsReconcile(context, catalogConfigurations.data)
    await sessionsAndMessagesReconcile(context)

    return createResult({
      agentCount: exampleDataFixture.agents.length + catalogConfigurations.data.length,
      catalogAgentCount: catalogConfigurations.data.length,
      messageCount: exampleDataFixture.sessions.reduce((count, session) => count + session.messages.length, 0),
      membershipCount: 1,
      organizationCount: 1,
      serverCount: exampleDataFixture.servers.length,
      sessionCount: exampleDataFixture.sessions.length,
      userCount: 1,
    })
  } catch (_error) {
    return createResultError(op, "The example data could not be reconciled.")
  }
}
