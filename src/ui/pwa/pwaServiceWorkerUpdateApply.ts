/**
 * Ports needed to activate a waiting service worker and reload exactly once,
 * so the lifecycle can be exercised without a browser.
 */
export type PwaServiceWorkerUpdatePort = {
  controllerChanged: (listener: () => void) => () => void
  reload: () => void
  waiting: () => { postMessage: (message: unknown) => void } | undefined
}

export const pwaServiceWorkerSkipWaitingMessage = "codeline-skip-waiting"

/**
 * Activates the waiting worker and reloads once its controller takes over.
 * Without a waiting worker there is nothing to activate, so reload directly.
 */
export function pwaServiceWorkerUpdateApply(port: PwaServiceWorkerUpdatePort): void {
  let reloaded = false
  const reloadOnce = () => {
    if (reloaded) return
    reloaded = true
    port.reload()
  }

  const waiting = port.waiting()
  if (!waiting) {
    reloadOnce()
    return
  }

  const unsubscribe = port.controllerChanged(() => {
    unsubscribe()
    reloadOnce()
  })

  waiting.postMessage({ type: pwaServiceWorkerSkipWaitingMessage })
}
