export type FileSystemErrorCode =
  | "FS_NOT_FOUND"
  | "FS_NOT_DIRECTORY"
  | "FS_NOT_TEXT"
  | "FS_NOT_REGULAR_FILE"
  | "FS_TOO_LARGE"
  | "FS_PERMISSION_DENIED"
  | "FS_IO_ERROR"
  | "FS_STALE_VERSION"
  | "FS_NOT_OBSERVED"
  | "FS_AMBIGUOUS_EDIT"
  | "FS_EDIT_NOT_FOUND"
  | "FS_ABORTED"

export class FileSystemError extends Error {
  readonly code: FileSystemErrorCode

  constructor(message: string, code: FileSystemErrorCode, options?: ErrorOptions) {
    super(message, options)
    this.name = "FileSystemError"
    this.code = code
  }
}
