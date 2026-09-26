import * as v from "valibot"

export const projectRegistryOpenCodeImportResponseSchema = v.strictObject({
  importedCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
})

export type ProjectRegistryOpenCodeImportResponse = v.InferOutput<typeof projectRegistryOpenCodeImportResponseSchema>
