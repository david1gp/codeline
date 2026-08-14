import * as v from "valibot"
import type { DemoSessionScreenVariant } from "./demoSessionScreenVariant.js"
import type { DemoSpecimen } from "./demoSpecimen.js"

const demoSessionScreenVariantSchema = v.picklist(["editing", "empty", "error", "loading", "ready", "streaming"])

/**
 * Resolve the selected variant from a URL search parameter, falling back to the
 * specimen's first supported variant.
 */
export function demoSessionScreenVariantParse(specimen: DemoSpecimen, value: unknown): DemoSessionScreenVariant {
  const fallback = specimen.variants[0] ?? "ready"
  const parsed = v.safeParse(demoSessionScreenVariantSchema, value)
  if (!parsed.success) return fallback
  return specimen.variants.includes(parsed.output) ? parsed.output : fallback
}
