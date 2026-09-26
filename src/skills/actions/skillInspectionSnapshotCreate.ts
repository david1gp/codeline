import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { type SkillInspectionSnapshot, skillInspectionSnapshotSchema } from "../api/skillInspectionSnapshotSchema.js"
import { skillSnapshotSchema } from "../schema/skillSnapshotSchema.js"

export function skillInspectionSnapshotCreate(input: unknown): Result<SkillInspectionSnapshot> {
  const op = "skillInspectionSnapshotCreate"
  const snapshot = v.safeParse(skillSnapshotSchema, input)
  if (!snapshot.success) return createResultError(op, "The skill snapshot is invalid.")
  const response = v.safeParse(skillInspectionSnapshotSchema, {
    body: snapshot.output.body,
    bundleDigest: snapshot.output.bundleDigest,
    bundlePath: snapshot.output.bundlePath,
    content: snapshot.output.content,
    description: snapshot.output.description,
    digest: snapshot.output.digest,
    name: snapshot.output.name,
    precedence: snapshot.output.precedence,
    resources: snapshot.output.resources.map(({ content, digest, path, size }) => ({ content, digest, path, size })),
    size: snapshot.output.size,
    source: snapshot.output.source,
  })
  if (!response.success) return createResultError(op, "The skill inspection snapshot is invalid.")
  return createResult(response.output)
}
