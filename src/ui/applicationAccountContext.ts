import { createContext } from "solid-js"

export type ApplicationAccountView = {
  /** The signed-in application user, or null while signed out. */
  userId: () => string | null
}

export const applicationAccountContext = createContext<ApplicationAccountView>()
