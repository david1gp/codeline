import type { ConfigurationSection } from "../configuration/configurationSectionSchema.js"

export interface DemoConfiguration {
  description: string
  href: string
  kind: "configuration"
  label: string
  slug: ConfigurationSection
}
