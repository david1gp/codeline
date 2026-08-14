import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import { nextTheme3, themeIcon, type ThemeVariant } from "../themeSwitcherStateCreate.js"

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
    themeCycle: () => theme.set(nextTheme3(theme.get())),
  }
}
