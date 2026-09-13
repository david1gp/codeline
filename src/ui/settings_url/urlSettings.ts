import { pageRouteSettings } from "./pageRouteSettings.js"
import type { SettingsSection } from "../settingsSectionSchema.js"

export function urlSettings(section?: SettingsSection): string {
  if (!section || section === "general") return pageRouteSettings.settings
  return `${pageRouteSettings.settings}?section=${encodeURIComponent(section)}`
}
