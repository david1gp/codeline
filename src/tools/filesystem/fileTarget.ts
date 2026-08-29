import type { FileVersion } from "./fileVersion.js"

declare const fileTargetKeyBrand: unique symbol

export type FileTargetKey = string & { readonly [fileTargetKeyBrand]: "FileTargetKey" }

export function fileTargetKey(value: string): FileTargetKey {
  return value as FileTargetKey
}

export type FileTarget = {
  readonly targetKey: FileTargetKey
  readonly displayPath: string
}

export type FileInfo = {
  readonly version: FileVersion
  readonly type: "file" | "directory" | "other"
  readonly size?: number
}

export type FilePathInfo = {
  readonly version: FileVersion
  readonly type: "file" | "directory" | "symlink" | "other"
  readonly size?: number
}

export type FileDirEntry = {
  readonly name: string
  readonly type: "file" | "directory" | "other"
  readonly target: FileTarget
  readonly version?: FileVersion
  readonly size?: number
}

export type FileObservation = { readonly kind: "present"; readonly version: FileVersion } | { readonly kind: "absent" }
