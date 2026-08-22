import { internalMutationGeneric } from "convex/server"
import { v } from "convex/values"
import type { AgentConfiguration } from "../src/agents/schema/agentConfigurationSchema.js"
import { agentConfigurationValidator } from "../src/agents/convex/agentConfigurationValidator.js"
import { exampleDataReset as reset } from "../src/database/convex/exampleDataReset.js"
import { exampleDataSeed as seed } from "../src/database/convex/exampleDataSeed.js"

const catalogConfigurationValidator = v.object({
  configuration: agentConfigurationValidator,
  id: v.string(),
})

export const exampleDataReset = internalMutationGeneric({
  args: {},
  handler: (context) => reset(context),
})

export const exampleDataSeed = internalMutationGeneric({
  args: {
    catalogConfigurations: v.array(catalogConfigurationValidator),
    organizationExternalId: v.string(),
    reset: v.optional(v.boolean()),
  },
  handler: (context, args) =>
    seed(context, {
      ...args,
      catalogConfigurations: args.catalogConfigurations.map(({ configuration, id }) => ({
        configuration: configuration as AgentConfiguration,
        id,
      })),
    }),
})
