import { providerDeterministicScenarioFixture } from "./providerDeterministicScenarioFixture.js"

const deterministicScenarioModelPrefixes = ["simulation-", "simulation:"] as const

export function providerDeterministicScenarioResolve(model: string) {
  const prefix = deterministicScenarioModelPrefixes.find((candidate) => model.startsWith(candidate))
  if (prefix === undefined) return null

  const slug = model.slice(prefix.length) as keyof typeof providerDeterministicScenarioFixture
  if (!Object.hasOwn(providerDeterministicScenarioFixture, slug)) return null
  return providerDeterministicScenarioFixture[slug]
}
