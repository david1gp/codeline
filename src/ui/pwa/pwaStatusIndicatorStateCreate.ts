import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import { onCleanup, onMount } from "solid-js"
import { pwaBrowserStatusResolve } from "./pwaBrowserStatusResolve.js"
import type { PwaInstallPromptEvent } from "./pwaInstallPromptEvent.js"
import { pwaServiceWorkerRegister } from "./pwaServiceWorkerRegister.js"
import { pwaServiceWorkerUpdateApply } from "./pwaServiceWorkerUpdateApply.js"

export function pwaStatusIndicatorStateCreate() {
  const online = createSignalObject(typeof navigator === "undefined" ? true : navigator.onLine)
  const offlineSince = createSignalObject<number | undefined>(online.get() ? undefined : Date.now())
  const updateReady = createSignalObject(false)
  const installPrompt = createSignalObject<PwaInstallPromptEvent | undefined>(undefined)
  const registration = createSignalObject<ServiceWorkerRegistration | undefined>(undefined)

  onMount(() => {
    const setOnline = () => {
      online.set(true)
      offlineSince.set(undefined)
    }
    const setOffline = () => {
      online.set(false)
      if (offlineSince.get() === undefined) offlineSince.set(Date.now())
    }
    const captureInstall = (event: Event) => {
      installPrompt.set(event as PwaInstallPromptEvent)
    }
    const clearInstall = () => installPrompt.set(undefined)

    window.addEventListener("online", setOnline)
    window.addEventListener("offline", setOffline)
    window.addEventListener("beforeinstallprompt", captureInstall)
    window.addEventListener("appinstalled", clearInstall)

    void pwaServiceWorkerRegister((ready) => {
      registration.set(ready)
      updateReady.set(true)
    })

    onCleanup(() => {
      window.removeEventListener("online", setOnline)
      window.removeEventListener("offline", setOffline)
      window.removeEventListener("beforeinstallprompt", captureInstall)
      window.removeEventListener("appinstalled", clearInstall)
    })
  })

  const status = () => pwaBrowserStatusResolve({ online: online.get(), updateReady: updateReady.get() })

  return {
    status,
    label: () => {
      if (status() === "offline") return "App offline"
      if (status() === "update-ready") return "App update ready"
      return "App online"
    },
    disconnectedSince: () => (status() === "offline" ? offlineSince.get() : undefined),
    installable: () => installPrompt.get() !== undefined,
    reloadForUpdate: () => {
      updateReady.set(false)
      pwaServiceWorkerUpdateApply({
        controllerChanged: (listener) => {
          const container = navigator.serviceWorker
          container.addEventListener("controllerchange", listener)
          return () => container.removeEventListener("controllerchange", listener)
        },
        reload: () => window.location.reload(),
        waiting: () => registration.get()?.waiting ?? undefined,
      })
    },
    install: async () => {
      const prompt = installPrompt.get()
      if (!prompt) return
      installPrompt.set(undefined)
      await prompt.prompt()
    },
  }
}
