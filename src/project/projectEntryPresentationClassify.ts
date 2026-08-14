import type { ProjectApiDirectoryResponse } from "./api/projectApiDirectoryResponseSchema.js"

type ProjectEntry = ProjectApiDirectoryResponse["entries"][number]

const extensionPresentations: Readonly<Record<string, { label: string; marker: string }>> = {
  avif: { label: "Image", marker: "IMG" },
  bmp: { label: "Image", marker: "IMG" },
  c: { label: "C source", marker: "C" },
  cc: { label: "C++ source", marker: "C++" },
  cpp: { label: "C++ source", marker: "C++" },
  css: { label: "Stylesheet", marker: "CSS" },
  gif: { label: "Image", marker: "IMG" },
  go: { label: "Go source", marker: "GO" },
  h: { label: "C header", marker: "H" },
  html: { label: "HTML", marker: "HTML" },
  java: { label: "Java source", marker: "JAVA" },
  jpeg: { label: "Image", marker: "IMG" },
  jpg: { label: "Image", marker: "IMG" },
  js: { label: "JavaScript", marker: "JS" },
  json: { label: "JSON", marker: "JSON" },
  jsx: { label: "JavaScript", marker: "JSX" },
  markdown: { label: "Markdown", marker: "MD" },
  md: { label: "Markdown", marker: "MD" },
  pdf: { label: "PDF document", marker: "PDF" },
  png: { label: "Image", marker: "IMG" },
  py: { label: "Python source", marker: "PY" },
  rs: { label: "Rust source", marker: "RS" },
  sh: { label: "Shell script", marker: "SH" },
  sql: { label: "SQL", marker: "SQL" },
  svg: { label: "SVG image", marker: "SVG" },
  toml: { label: "TOML", marker: "TOML" },
  ts: { label: "TypeScript", marker: "TS" },
  tsx: { label: "TypeScript", marker: "TSX" },
  txt: { label: "Text", marker: "TXT" },
  webp: { label: "Image", marker: "IMG" },
  xml: { label: "XML", marker: "XML" },
  yaml: { label: "YAML", marker: "YAML" },
  yml: { label: "YAML", marker: "YAML" },
}

export function projectEntryPresentationClassify(entry: Pick<ProjectEntry, "name" | "type">) {
  if (entry.type === "directory") return { label: "Folder", marker: "DIR" }
  if (entry.type === "other") return { label: "Unavailable", marker: "--" }

  const extensionSeparator = entry.name.lastIndexOf(".")
  const extension = extensionSeparator < 0 ? "" : entry.name.slice(extensionSeparator + 1).toLowerCase()
  return extensionPresentations[extension] ?? { label: "File", marker: "FILE" }
}
