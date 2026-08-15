import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import { nextTheme3, type ThemeVariant, themeIcon, themeSet } from "../themeSwitcherStateCreate.js"

const themeLabels: Record<ThemeVariant, string> = {
  light: "Light",
  dark: "Dark",
  os: "System",
}

export function demoThemeSwitcherStateCreate() {
  const theme = createSignalObject<ThemeVariant>("os")

  return {
    currentTheme: theme.get,
    currentThemeIcon: () => themeIcon(theme.get()),
    currentThemeLabel: () => themeLabels[theme.get()],
    nextThemeLabel: () => themeLabels[nextTheme3(theme.get())],
    themeCycle: () => {
      const next = nextTheme3(theme.get())
      theme.set(next)
      themeSet(next, false)
    },
  }
}
