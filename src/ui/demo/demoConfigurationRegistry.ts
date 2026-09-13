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
  {
    description: "Interactive skill instructions backed only by deterministic fixtures and browser storage.",
    href: urlDemoItem("config", "skills"),
    kind: "configuration",
    label: "Skills",
    slug: "skills",
  },
  {
    description: "Interactive command templates backed only by deterministic fixtures and browser storage.",
    href: urlDemoItem("config", "commands"),
    kind: "configuration",
    label: "Commands",
    slug: "commands",
  },
] as const satisfies readonly DemoConfiguration[]
