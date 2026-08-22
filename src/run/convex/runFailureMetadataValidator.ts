import { valibotSchemaToConvexValidator } from "../../convex/valibotSchemaToConvexValidator.js"
import { runFailureMetadataSchema } from "../schema/runFailureMetadataSchema.js"

export const runFailureMetadataValidator = valibotSchemaToConvexValidator(runFailureMetadataSchema)
