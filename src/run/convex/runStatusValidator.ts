import { valibotSchemaToConvexValidator } from "../../convex/valibotSchemaToConvexValidator.js"
import { runStatusSchema } from "../schema/runStatusSchema.js"

export const runStatusValidator = valibotSchemaToConvexValidator(runStatusSchema)
