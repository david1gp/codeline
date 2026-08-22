import { valibotSchemaToConvexValidator } from "../../convex/valibotSchemaToConvexValidator.js"
import { executionStreamEventSchema } from "../schema/executionStreamEventSchema.js"

export const executionStreamEventValidator = valibotSchemaToConvexValidator(executionStreamEventSchema)
