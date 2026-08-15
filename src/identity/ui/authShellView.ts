/** Rendering contract of the application-shell account control. */
export type AuthShellView = {
  busy: () => boolean
  displayName: () => string
  logout: () => void
  userId: () => string
}
