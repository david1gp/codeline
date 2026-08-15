import { createContext } from "solid-js"
import type { PwaStatusView } from "./pwaStatusView.js"

export const pwaStatusContext = createContext<PwaStatusView>()
