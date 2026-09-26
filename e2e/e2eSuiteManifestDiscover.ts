import { readdir } from "node:fs/promises"
import { resolve } from "node:path"
import type { E2eSuite } from "./e2eSuiteSchema.js"

/** Each immediate folder is one workflow; nested specs are its ordered steps. */
export async function e2eSuiteManifestDiscover(root: string): Promise<E2eSuite[]> {
  const directory = resolve(root, "e2e")
  const entries = await readdir(directory, { withFileTypes: true })
  const stepsIn = async (folder: string): Promise<string[]> => {
    const steps: string[] = []
    for (const entry of await readdir(resolve(root, folder), { withFileTypes: true })) {
      const path = `${folder}/${entry.name}`
      if (entry.isDirectory()) steps.push(...(await stepsIn(path)))
      if (entry.isFile() && entry.name.endsWith(".spec.ts")) steps.push(path)
    }
    return steps.sort()
  }
  const suites: E2eSuite[] = []
  for (const entry of entries) {
    const id = `e2e/${entry.name}`
    if (entry.isFile() && entry.name.endsWith(".spec.ts")) suites.push({ id, steps: [id] })
    if (entry.isDirectory()) {
      const steps = await stepsIn(id)
      if (steps.length > 0) suites.push({ id, steps })
    }
  }
  return suites.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}
