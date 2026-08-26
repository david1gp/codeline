import { createResultErrorCode } from "@adaptive-ds/result"
import { runErrorCodes } from "./runErrorCodes.js"

type RunErrorCode = (typeof runErrorCodes)[keyof typeof runErrorCodes]

export function runResultCreateError(op: string, errorMessage: string, code: RunErrorCode) {
  return createResultErrorCode(op, errorMessage, code)
}
