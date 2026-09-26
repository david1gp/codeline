import * as v from "valibot"
import { runChildAdmissionReasonSchema } from "./runChildAdmissionReasonSchema.js"

export const runChildAdmissionSchema = v.strictObject({
  decision: v.picklist(["admit", "reject"]),
  reason: runChildAdmissionReasonSchema,
})

export type RunChildAdmission = v.InferOutput<typeof runChildAdmissionSchema>
