export function cliPollingDelay(signal: AbortSignal | undefined, milliseconds: number): Promise<void> {
  if (signal?.aborted) return Promise.resolve()
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer)
      signal?.removeEventListener("abort", finish)
      resolve()
    }
    const timer = setTimeout(finish, milliseconds)
    signal?.addEventListener("abort", finish, { once: true })
  })
}
