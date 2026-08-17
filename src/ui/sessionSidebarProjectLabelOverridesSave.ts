const storageKey = "codeline.projectLabels"

export function sessionSidebarProjectLabelOverridesSave(
  labels: Record<string, string>,
  storage: Pick<Storage, "setItem"> | undefined = globalThis.localStorage,
): void {
  try {
    storage?.setItem(storageKey, JSON.stringify(labels))
  } catch (_error) {
    // Label overrides stay in memory when persistence is blocked.
  }
}
