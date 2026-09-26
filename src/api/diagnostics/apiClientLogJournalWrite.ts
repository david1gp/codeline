import { apiClientLogSanitize } from "./apiClientLogSanitize.js"

export function apiClientLogJournalWrite(input: unknown): void {
  console.log(JSON.stringify(apiClientLogSanitize(input)))
}
