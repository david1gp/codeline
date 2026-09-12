import { createContext } from "solid-js"
import type { primaryNavigationStateCreate } from "./primaryNavigationStateCreate.js"

export const applicationNavigationContext = createContext<ReturnType<typeof primaryNavigationStateCreate>>()
