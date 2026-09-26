export async function pwaServiceWorkerRegister(
  onUpdateReady: (registration: ServiceWorkerRegistration) => void,
): Promise<void> {
  if (import.meta.env.DEV) return
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return
  if (!window.isSecureContext) return

  try {
    const registration = await navigator.serviceWorker.register("/service-worker.js", { scope: "/" })

    if (registration.waiting && navigator.serviceWorker.controller) onUpdateReady(registration)

    registration.addEventListener("updatefound", () => {
      const installing = registration.installing
      if (!installing) return
      installing.addEventListener("statechange", () => {
        if (installing.state === "installed" && navigator.serviceWorker.controller) onUpdateReady(registration)
      })
    })
  } catch {
    return
  }
}
