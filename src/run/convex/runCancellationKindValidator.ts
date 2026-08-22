import { valibotSchemaToConvexValidator } from "../../convex/valibotSchemaToConvexValidator.js"
import { runCancellationKindSchema } from "../schema/runCancellationKindSchema.js"

export const runCancellationKindValidator = valibotSchemaToConvexValidator(runCancellationKindSchema)
