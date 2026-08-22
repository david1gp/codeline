import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { ConvexHttpClient } from "convex/browser"
import { anyApi, type FunctionReference } from "convex/server"
import { convexServerEnvironmentResult } from "../src/convex/env/convexServerEnvironmentResult.js"
import { providerAgentCatalogConfigurationCompile } from "../src/providers/catalog/providerAgentCatalogConfigurationCompile.js"
import { providerAgentCatalogLoad } from "../src/providers/catalog/providerAgentCatalogLoad.js"

const argumentsList = Bun.argv.slice(2)
const resetOnly = argumentsList.includes("--reset-only")
const reset = argumentsList.includes("--reset")
const supportedArguments = new Set(["--reset", "--reset-only"])
if (argumentsList.some((argument) => !supportedArguments.has(argument)) || (resetOnly && reset)) {
  console.error("Usage: bun scripts/convexSeed.ts [--reset|--reset-only]")
  process.exit(2)
}

const environment = convexServerEnvironmentResult()
if (!environment.success) {
  console.error(environment.errorMessage)
  process.exit(1)
}

const client = new ConvexHttpClient(environment.data.CONVEX_SELF_HOSTED_URL, {
  skipConvexDeploymentUrlCheck: true,
})
const adminClient = client as ConvexHttpClient & { setAdminAuth: (key: string) => void }
adminClient.setAdminAuth(environment.data.CONVEX_SELF_HOSTED_ADMIN_KEY)
const seedApi = anyApi.seed as unknown as {
  exampleDataReset: FunctionReference<"mutation">
  exampleDataSeed: FunctionReference<"mutation">
}

if (resetOnly) {
  const result = await client.mutation(seedApi.exampleDataReset, {})
  if (!result.success) {
    console.error(result.errorMessage)
    process.exit(1)
  }
  console.log(`Reset ${result.data.messageCount} example-data messages.`)
  process.exit(0)
}

const organizationExternalId = Bun.env.ZITADEL_ORGANIZATION_ID
if (organizationExternalId === undefined || organizationExternalId.trim().length === 0) {
  console.error("ZITADEL_ORGANIZATION_ID is required to seed the Contentoren organization.")
  process.exit(1)
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const catalog = await providerAgentCatalogLoad(repositoryRoot)
if (!catalog.success) {
  console.error(catalog.errorMessage)
  process.exit(1)
}
const configurations = providerAgentCatalogConfigurationCompile(catalog.data)
if (!configurations.success) {
  console.error(configurations.errorMessage)
  process.exit(1)
}

const result = await client.mutation(seedApi.exampleDataSeed, {
  catalogConfigurations: configurations.data.map(({ agent, configuration }) => ({ id: agent.id, configuration })),
  organizationExternalId,
  ...(reset ? { reset: true } : {}),
})
if (!result.success) {
  console.error(result.errorMessage)
  process.exit(1)
}

console.log(
  `${reset ? "Reset and seeded" : "Seeded"} ${result.data.userCount} users, ${result.data.serverCount} servers, ${result.data.agentCount} agents, ${result.data.sessionCount} sessions, and ${result.data.messageCount} messages.`,
)
