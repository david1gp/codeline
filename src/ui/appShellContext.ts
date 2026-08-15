import { createContext } from "solid-js"
import type { AppShellView } from "./appShellView.js"

export const appShellContext = createContext<AppShellView>()
