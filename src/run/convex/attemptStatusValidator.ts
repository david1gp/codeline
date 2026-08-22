import { valibotSchemaToConvexValidator } from "../../convex/valibotSchemaToConvexValidator.js"
import { attemptStatusSchema } from "../schema/attemptStatusSchema.js"

export const attemptStatusValidator = valibotSchemaToConvexValidator(attemptStatusSchema)
