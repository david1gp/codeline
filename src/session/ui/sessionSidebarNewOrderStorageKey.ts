export function sessionSidebarNewOrderStorageKey(accountId: string): string {
  return `codeline.session.sidebarNew.order:${encodeURIComponent(accountId)}`
}
