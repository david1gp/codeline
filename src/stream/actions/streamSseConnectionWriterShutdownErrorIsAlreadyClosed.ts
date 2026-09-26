export function streamSseConnectionWriterShutdownErrorIsAlreadyClosed(error: unknown): boolean {
  if (!(error instanceof TypeError)) return false
  return /(?:already\s+)?closed|locked|released/i.test(error.message)
}
