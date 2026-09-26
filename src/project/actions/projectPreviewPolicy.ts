import * as path from "node:path"

export type ProjectPreviewPolicy =
  | { kind: "text"; mimeType: string }
  | { kind: "image"; mimeType: string }
  | { kind: "pdf"; mimeType: "application/pdf" }
  | { kind: "unsupported"; mimeType: "application/octet-stream" }

const textMimeTypes: Readonly<Record<string, string>> = {
  ".bash": "text/plain",
  ".c": "text/x-c",
  ".cc": "text/x-c",
  ".cpp": "text/x-c++",
  ".css": "text/css",
  ".csv": "text/csv",
  ".go": "text/x-go",
  ".h": "text/x-c",
  ".hpp": "text/x-c++",
  ".html": "text/html",
  ".java": "text/x-java-source",
  ".js": "text/javascript",
  ".json": "application/json",
  ".jsonl": "application/json",
  ".jsx": "text/javascript",
  ".log": "text/plain",
  ".markdown": "text/markdown",
  ".md": "text/markdown",
  ".mjs": "text/javascript",
  ".py": "text/x-python",
  ".rb": "text/x-ruby",
  ".rs": "text/x-rust",
  ".sh": "application/x-sh",
  ".sql": "application/sql",
  ".svelte": "text/html",
  ".svg": "image/svg+xml",
  ".toml": "application/toml",
  ".ts": "text/typescript",
  ".tsx": "text/typescript",
  ".txt": "text/plain",
  ".xml": "application/xml",
  ".yaml": "application/yaml",
  ".yml": "application/yaml",
}

const imageMimeTypes: Readonly<Record<string, string>> = {
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
}

const plainTextNames = new Set([
  ".dockerignore",
  ".editorconfig",
  ".env",
  ".gitignore",
  "Dockerfile",
  "LICENSE",
  "Makefile",
])

export function projectPreviewPolicyResolve(filePath: string): ProjectPreviewPolicy {
  const name = path.posix.basename(filePath)
  const extension = path.posix.extname(name).toLowerCase()

  if (name === "README" || plainTextNames.has(name)) {
    return { kind: "text", mimeType: "text/plain" }
  }

  const textMimeType = textMimeTypes[extension]
  if (textMimeType !== undefined && extension !== ".svg") {
    return { kind: "text", mimeType: textMimeType }
  }

  const imageMimeType = imageMimeTypes[extension]
  if (imageMimeType !== undefined) {
    return { kind: "image", mimeType: imageMimeType }
  }

  if (extension === ".pdf") {
    return { kind: "pdf", mimeType: "application/pdf" }
  }

  return { kind: "unsupported", mimeType: "application/octet-stream" }
}
