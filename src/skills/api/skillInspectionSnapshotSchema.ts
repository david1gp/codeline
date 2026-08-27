import * as v from "valibot"

const skillInspectionResourceSchema = v.strictObject({
  content: v.string(),
  digest: v.pipe(v.string(), v.regex(/^sha256-[a-f0-9]{64}$/)),
  path: v.pipe(v.string(), v.minLength(1), v.maxLength(4_096)),
  size: v.pipe(v.number(), v.integer(), v.minValue(0)),
})

export const skillInspectionSnapshotSchema = v.strictObject({
  body: v.string(),
  bundleDigest: v.pipe(v.string(), v.regex(/^sha256-[a-f0-9]{64}$/)),
  bundlePath: v.pipe(v.string(), v.minLength(1), v.maxLength(4_096)),
  content: v.string(),
  description: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(2_000)),
  digest: v.pipe(v.string(), v.regex(/^sha256-[a-f0-9]{64}$/)),
  name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
  precedence: v.pipe(v.number(), v.integer(), v.minValue(0)),
  resources: v.array(skillInspectionResourceSchema),
  size: v.pipe(v.number(), v.integer(), v.minValue(0)),
  source: v.picklist(["global", "project"]),
})

export type SkillInspectionSnapshot = v.InferOutput<typeof skillInspectionSnapshotSchema>
