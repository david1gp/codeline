import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

export const e2eRepositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
