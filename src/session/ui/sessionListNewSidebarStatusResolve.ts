export function sessionListNewSidebarStatusResolve(
  status: "loading" | "complete" | "error",
  sessionCount: number,
  isSignedIn: boolean,
) {
  return {
    emptyMessage: isSignedIn ? "No active conversations." : "Sign in to see your conversations.",
    isError: status === "error" && sessionCount === 0,
    isLoading: status === "loading" && sessionCount === 0,
  }
}
