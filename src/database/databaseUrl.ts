import path from "node:path"
import { databasePath } from "./databasePath.js"

export const databaseUrl = `file://${path.resolve(databasePath)}`
