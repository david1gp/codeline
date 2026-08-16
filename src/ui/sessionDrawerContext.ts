import { createContext } from "solid-js"
import type { workspacePageStateCreate } from "./workspacePageStateCreate.js"

export const sessionDrawerContext = createContext<ReturnType<typeof workspacePageStateCreate>>()
