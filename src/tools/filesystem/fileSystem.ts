import type { FileDirEntry, FileInfo, FilePathInfo, FileTarget } from "./fileTarget.js"
import type { FileVersion } from "./fileVersion.js"

export type FileWriteIntent =
  | { readonly kind: "createIfAbsent" }
  | { readonly kind: "replaceIfVersion"; readonly version: FileVersion }

export type FileWriteOutcome = {
  readonly operation: "create" | "update"
  readonly version: FileVersion
  readonly before: string | null
  readonly after: string
}

export type FileEditRequest = {
  readonly oldString: string
  readonly newString: string
  readonly replaceAll: boolean
}

export type FileEditOutcome = {
  readonly version: FileVersion
  readonly before: string
  readonly after: string
}

export abstract class FileSystem {
  abstract resolve(path: string, options?: { cwd?: string; signal?: AbortSignal }): Promise<FileTarget>
  abstract processPath(target: FileTarget): string
  abstract fileUrl(target: FileTarget): string
  abstract contains(parent: FileTarget, child: FileTarget): boolean
  abstract stat(target: FileTarget, signal?: AbortSignal): Promise<FileInfo | undefined>
  abstract lstat(path: string, options?: { cwd?: string }, signal?: AbortSignal): Promise<FilePathInfo | undefined>
  abstract readText(target: FileTarget, signal?: AbortSignal): Promise<string>
  abstract streamText(target: FileTarget, signal?: AbortSignal): Promise<AsyncIterable<string>>
  abstract readBytes(target: FileTarget, signal: AbortSignal | undefined, maxBytes: number): Promise<Uint8Array>
  abstract listDir(target: FileTarget, signal?: AbortSignal): Promise<FileDirEntry[]>
  abstract writeText(
    target: FileTarget,
    content: string,
    expected?: FileWriteIntent,
    signal?: AbortSignal,
  ): Promise<FileWriteOutcome>
  abstract editText(
    target: FileTarget,
    edit: FileEditRequest,
    expected?: { readonly version: FileVersion },
    signal?: AbortSignal,
  ): Promise<FileEditOutcome>
}
