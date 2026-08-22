import { valibotSchemaToConvexValidator } from "../../convex/valibotSchemaToConvexValidator.js"
import { runExecutionSnapshotSchema } from "../schema/runExecutionSnapshotSchema.js"

export const runExecutionSnapshotValidator = valibotSchemaToConvexValidator(runExecutionSnapshotSchema)
