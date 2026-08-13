import * as v from "valibot"

export const sessionSearchQuerySchema = v.pipe(v.string(), v.trim(), v.maxLength(100))
