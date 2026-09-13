import type { Result } from "@adaptive-ds/result"

type ChatComposerStopOptions = {
  cancellation: () => Promise<Result<unknown>>
  clientRunId: string | null
  isBusy: boolean
  isStopping: boolean
  localStop: () => void
  onError: (message: string) => void
  onStart: () => void
  onFinish: () => void
}

export async function chatComposerStop(options: ChatComposerStopOptions): Promise<void> {
  if (!options.isBusy || options.isStopping || options.clientRunId === null) return

  options.onStart()
  try {
    const cancelled = await options.cancellation()
    if (!cancelled.success) {
      options.onError(cancelled.errorMessage)
      return
    }
    options.localStop()
  } finally {
    options.onFinish()
  }
}
