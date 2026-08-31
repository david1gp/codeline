import { createMemo } from "solid-js"
import { signalObjectCreate } from "../../ui/signalObjectCreate.js"
import { projectAvatarColorResolve } from "../projectAvatarColorResolve.js"
import { projectAvatarFirstGrapheme } from "../projectAvatarFirstGrapheme.js"

export function projectAvatarStateCreate(input: { faviconUrl: () => string | null | undefined; name: () => string }) {
  const letter = createMemo(() => projectAvatarFirstGrapheme(input.name()).toUpperCase())
  const color = createMemo(() => projectAvatarColorResolve(input.name()))
  const failedFaviconUrl = signalObjectCreate<string | null>(null)

  return {
    background: () => color().background,
    faviconError: () => {
      failedFaviconUrl.set(input.faviconUrl() ?? null)
    },
    foreground: () => color().foreground,
    letter,
    showFavicon: () =>
      input.faviconUrl() !== null && input.faviconUrl() !== undefined && input.faviconUrl() !== failedFaviconUrl.get(),
  }
}
