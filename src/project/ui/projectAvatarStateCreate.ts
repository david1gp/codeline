import { createMemo } from "solid-js"
import { projectAvatarColorResolve } from "../projectAvatarColorResolve.js"
import { projectAvatarFirstGrapheme } from "../projectAvatarFirstGrapheme.js"

export function projectAvatarStateCreate(input: { name: () => string }) {
  const letter = createMemo(() => projectAvatarFirstGrapheme(input.name()).toUpperCase())
  const color = createMemo(() => projectAvatarColorResolve(input.name()))

  return {
    background: () => color().background,
    foreground: () => color().foreground,
    letter,
  }
}
