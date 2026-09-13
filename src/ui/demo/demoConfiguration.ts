import type { ConfigurationSection } from "../../configuration/ui/configurationSectionSchema.js"

export interface DemoConfiguration {
  description: string
  href: string
  kind: "configuration"
  label: string
  slug: ConfigurationSection
}
