import { urlDemoItem } from "../demo_url/urlDemo.js"
import type { DemoConfiguration } from "./demoConfiguration.js"

export const demoConfigurationRegistry = [
  {
    description: "Interactive subagent definitions backed only by deterministic fixtures and browser storage.",
    href: urlDemoItem("config", "subagents"),
    kind: "configuration",
    label: "Subagents",
    slug: "subagents",
  },
] as const satisfies readonly DemoConfiguration[]
