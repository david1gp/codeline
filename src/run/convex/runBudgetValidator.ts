import { valibotSchemaToConvexValidator } from "../../convex/valibotSchemaToConvexValidator.js"
import { runBudgetSchema } from "../schema/runBudgetSchema.js"

export const runBudgetValidator = valibotSchemaToConvexValidator(runBudgetSchema)
