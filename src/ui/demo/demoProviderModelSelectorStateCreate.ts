import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import type { ProviderModelSelectorState } from "../../providers/ui/providerModelSelectorStateCreate.js"
import type { DemoSessionScreenVariant } from "./demoSessionScreenVariant.js"

const demoModels = [
  { id: "deterministic-large", name: "Deterministic Large" },
  { id: "deterministic-fast", name: "Deterministic Fast" },
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
    modelSelect: (model: string) => {
      if (demoModels.some((candidate) => candidate.id === model)) selectedModel.set(model)
    },
    models: () => (status() === "ready" ? demoModels : []),
    provider: () => "deterministic",
    reasoningEffortSelect: () => undefined,
    selectedReasoningEffort: () => "medium",
    selectedModel: selectedModel.get,
    status,
  }
}
