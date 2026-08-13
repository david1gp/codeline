import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { projectDefaultLimits } from "./projectDefaultLimits.js"
import type { ProjectLimits } from "./projectLimitsSchema.js"
import { projectMetadataRead } from "./projectMetadataRead.js"
import { projectPreviewPolicyResolve } from "./projectPreviewPolicy.js"
import { projectPreviewPrepare } from "./projectPreviewPrepare.js"
import { projectTextRead } from "./projectTextRead.js"

export type ProjectPreviewReadResult =
  | { path: string; kind: "text"; mimeType: string; content: string; size: number }
  | { path: string; kind: "image" | "pdf"; mimeType: string; size: number }
  | { path: string; kind: "unsupported"; mimeType: "application/octet-stream"; size: number }

export async function projectPreviewRead(
  rootDir: string,
  relativePath: string,
  limits?: ProjectLimits,
): Promise<Result<ProjectPreviewReadResult>> {
  const op = "projectPreviewRead"
  const policy = projectPreviewPolicyResolve(relativePath)

  if (policy.kind === "text") {
    const maxPreviewBytes =
      limits?.maxPreviewFileSizeBytes ?? projectDefaultLimits.maxPreviewFileSizeBytes ?? 10 * 1024 * 1024
    const maxTextBytes = limits?.maxTextFileSizeBytes ?? projectDefaultLimits.maxTextFileSizeBytes ?? 1024 * 1024
    const text = await projectTextRead(rootDir, relativePath, {
      ...limits,
      maxTextFileSizeBytes: Math.min(maxPreviewBytes, maxTextBytes),
    })
    if (!text.success) return text
    return createResult({ ...text.data, kind: "text", mimeType: policy.mimeType })
  }

  if (policy.kind === "image" || policy.kind === "pdf") {
    const preview = await projectPreviewPrepare(rootDir, relativePath, limits)
    if (!preview.success) return preview
    return createResult({
      path: preview.data.path,
      kind: preview.data.kind,
      mimeType: preview.data.mimeType,
      size: preview.data.size,
    })
  }

  const metadata = await projectMetadataRead(rootDir, relativePath)
  if (!metadata.success) return metadata
  if (metadata.data.type !== "file") {
    return createResultError(op, `Path '${metadata.data.path || "."}' is not a regular file`)
  }

  const maxBytes = limits?.maxPreviewFileSizeBytes ?? projectDefaultLimits.maxPreviewFileSizeBytes ?? 10 * 1024 * 1024
  if (metadata.data.size > maxBytes) {
    return createResultError(
      op,
      `File '${metadata.data.path}' size (${metadata.data.size} bytes) exceeds preview limit of ${maxBytes} bytes`,
    )
  }

  return createResult({
    path: metadata.data.path,
    kind: "unsupported",
    mimeType: "application/octet-stream",
    size: metadata.data.size,
  })
}
