import { valibotSchemaToConvexValidator } from "../../convex/valibotSchemaToConvexValidator.js"
import { runDelegationResultSchema } from "../schema/runDelegationResultSchema.js"

export const runDelegationResultValidator = valibotSchemaToConvexValidator(runDelegationResultSchema)
