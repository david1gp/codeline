import type { ApplicationAccountView } from "./applicationAccountContext.js"
import { applicationShellStateCreate } from "./applicationShellStateCreate.js"
import { appShellStateCreate } from "./appShellStateCreate.js"

/**
 * Shell for signed-out, read-only browsing of the last locally active account's
 * cached settled sessions. It opens no `/api/events` feed and reports a null
 * account, so the session state modules render only from IndexedDB and keep
 * every mutation disabled.
 */
export function signedOutApplicationStateCreate(options: { offline?: boolean } = {}): {
  account: ApplicationAccountView
  applicationShell: ReturnType<typeof applicationShellStateCreate>
  state: ReturnType<typeof appShellStateCreate>
} {
  return {
    account: { userId: () => null },
    applicationShell: applicationShellStateCreate(),
    state: appShellStateCreate({ initialOnline: options.offline === true ? false : undefined }),
  }
}
