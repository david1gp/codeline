import { valibotSchemaToConvexValidator } from "../../convex/valibotSchemaToConvexValidator.js"
import { agentConfigurationSchema } from "../schema/agentConfigurationSchema.js"

export const agentConfigurationValidator = valibotSchemaToConvexValidator(agentConfigurationSchema)
