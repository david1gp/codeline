import { createContext } from "solid-js"
import type { workspacePageStateCreate } from "../../ui/workspacePageStateCreate.js"

export const sessionDrawerContext = createContext<ReturnType<typeof workspacePageStateCreate>>()
