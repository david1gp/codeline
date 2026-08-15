import { createContext } from "solid-js"
import type { applicationShellStateCreate } from "./applicationShellStateCreate.js"

export const applicationShellContext = createContext<ReturnType<typeof applicationShellStateCreate>>()
