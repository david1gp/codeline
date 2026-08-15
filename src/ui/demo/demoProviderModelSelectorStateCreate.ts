import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import type { ProviderModelSelectorState } from "../../providers/ui/providerModelSelectorStateCreate.js"
import type { DemoSessionScreenVariant } from "./demoSessionScreenVariant.js"

const demoModels = [
  {
    efforts: ["low", "medium", "high", "xhigh", "max"] as Array<"low" | "medium" | "high" | "xhigh" | "max">,
    id: "deterministic-large",
    name: "Deterministic Large",
    providerId: "deterministic" as const,
    value: "deterministic/deterministic-large",
  },
  {
    efforts: ["low", "medium", "high", "xhigh", "max"] as Array<"low" | "medium" | "high" | "xhigh" | "max">,
    id: "deterministic-fast",
    name: "Deterministic Fast",
    providerId: "deterministic" as const,
    value: "deterministic/deterministic-fast",
  },
]

export function demoProviderModelSelectorStateCreate(
  variant: () => DemoSessionScreenVariant,
): ProviderModelSelectorState {
  const selectedModel = createSignalObject<string | null>(demoModels[0]?.id ?? null)
  const status = () => {
    if (variant() === "loading") return "loading" as const
    if (variant() === "error") return "error" as const
    if (variant() === "empty") return "idle" as const
    return "ready" as const
  }

  return {
    codelineExecution: () => null,
    configuredModel: () => "deterministic-large",
    effortOptions: () => [...demoModels[0]!.efforts],
    groups: () => [{ id: "deterministic", models: [...demoModels], name: "Deterministic" }],
    modelSelect: (_provider, model: string) => {
      if (demoModels.some((candidate) => candidate.id === model)) selectedModel.set(model)
    },
    modelValueSelect: (value: string) => {
      const model = demoModels.find((candidate) => candidate.value === value)
      if (model !== undefined) selectedModel.set(model.id)
    },
    models: () => (status() === "ready" ? demoModels : []),
    provider: () => "deterministic",
    reasoningEffortSelect: () => undefined,
    reasoningEffortValueSelect: () => undefined,
    selectedModelValue: () => demoModels.find((model) => model.id === selectedModel.get())?.value ?? "",
    selectedProvider: () => "deterministic",
    selectedReasoningEffort: () => "medium" as const,
    selectedModel: selectedModel.get,
    status,
  }
}
