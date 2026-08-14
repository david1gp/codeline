/** Rendering contract of the application-shell sign-out control. */
export type AuthShellView = {
  busy: () => boolean
  logout: () => void
  userId: () => string
}
