import { createContext } from "solid-js"
import type { eventFeedCoordinatorStateCreate } from "./eventFeedCoordinatorStateCreate.js"

export const eventFeedCoordinatorContext = createContext<ReturnType<typeof eventFeedCoordinatorStateCreate>>()
