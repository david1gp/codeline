import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import { mdiBrightnessAuto } from "@adaptive-ds/mdi/mdiBrightnessAuto.js"
import { mdiWeatherNight } from "@adaptive-ds/mdi/mdiWeatherNight.js"
import { mdiWhiteBalanceSunny } from "@adaptive-ds/mdi/mdiWhiteBalanceSunny.js"
import { onCleanup, onMount } from "solid-js"
import * as v from "valibot"

export const themeVariant = {
  light: "light",
  dark: "dark",
  os: "os",
} as const

export type ThemeVariant = keyof typeof themeVariant

export const themeSchema = v.enum(themeVariant)
export const themeLocalStorageKey = "theme"

export const themeOptions = [
  {
    description: "Always use a light appearance.",
    icon: mdiWhiteBalanceSunny,
    label: "Light",
    value: themeVariant.light,
  },
  {
    description: "Always use a dark appearance.",
    icon: mdiWeatherNight,
    label: "Dark",
    value: themeVariant.dark,
  },
  {
    description: "Follow your operating system preference.",
    icon: mdiBrightnessAuto,
    label: "System",
    value: themeVariant.os,
  },
] as const

export function nextTheme3(current: string | undefined): ThemeVariant {
  switch (current) {
    case themeVariant.light:
      return themeVariant.dark
    case themeVariant.dark:
      return themeVariant.os
    case themeVariant.os:
      return themeVariant.light
    default:
      return themeVariant.dark
  }
}

export function themeIcon(t: string | undefined): string {
  switch (t) {
    case themeVariant.light:
      return mdiWhiteBalanceSunny
    case themeVariant.dark:
      return mdiWeatherNight
    default:
      return mdiBrightnessAuto
  }
}

function setBrowserTheme(theme: ThemeVariant) {
  if (typeof document === "undefined") return
  if (theme === themeVariant.dark) {
    document.documentElement.classList.add("dark")
  } else if (theme === themeVariant.light) {
    document.documentElement.classList.remove("dark")
  } else {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
    document.documentElement.classList.toggle("dark", prefersDark)
  }
}

const themeSignal = createSignalObject<ThemeVariant>(themeVariant.os)

export function themeSet(theme: ThemeVariant, saveToStorage: boolean) {
  themeSignal.set(theme)
  setBrowserTheme(theme)
  if (!saveToStorage || typeof localStorage === "undefined") return
  localStorage.setItem(themeLocalStorageKey, theme)
}

const themeLabels: Record<ThemeVariant, string> = {
  light: "Light",
  dark: "Dark",
  os: "System",
}

export function themeSwitcherStateCreate() {
  onMount(() => {
    const stored = localStorage.getItem(themeLocalStorageKey)
    const result = v.safeParse(themeSchema, stored)
    themeSet(result.success ? result.output : themeVariant.os, false)

    const onStorage = (event: StorageEvent) => {
      if (event.key !== themeLocalStorageKey) return
      const next = v.safeParse(themeSchema, event.newValue)
      if (next.success) themeSet(next.output, false)
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const onMediaChange = () => {
      if (themeSignal.get() === themeVariant.os) themeSet(themeVariant.os, false)
    }

    window.addEventListener("storage", onStorage)
    media.addEventListener("change", onMediaChange)
    onCleanup(() => {
      window.removeEventListener("storage", onStorage)
      media.removeEventListener("change", onMediaChange)
    })
  })

  const currentTheme = () => themeSignal.get()
  const currentThemeLabel = () => themeLabels[currentTheme()]
  const nextTheme = () => nextTheme3(currentTheme())

  return {
    currentTheme,
    currentThemeIcon: () => themeIcon(currentTheme()),
    currentThemeLabel,
    nextThemeLabel: () => themeLabels[nextTheme()],
    themeOptions,
    themeCycle: () => themeSet(nextTheme(), true),
    themeSelect: (theme: ThemeVariant) => themeSet(theme, true),
  }
}
