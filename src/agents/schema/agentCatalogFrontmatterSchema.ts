import * as v from "valibot"
import { providerGenerationSchema } from "../../providers/schema/providerGenerationSchema.js"
import { agentCatalogPermissionSchema } from "./agentCatalogPermissionSchema.js"

export const agentCatalogFrontmatterSchema = v.strictObject({
  description: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(2_000))),
  enabled: v.optional(v.boolean()),
  effort: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(80))),
  generation: v.optional(providerGenerationSchema),
  mode: v.optional(v.picklist(["primary", "subagent"])),
  model: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))),
  permission: v.optional(agentCatalogPermissionSchema),
  provider: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))),
  variant: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(80))),
})

export type AgentCatalogFrontmatter = v.InferOutput<typeof agentCatalogFrontmatterSchema>
