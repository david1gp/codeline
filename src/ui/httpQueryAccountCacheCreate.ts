import type { Accessor } from "solid-js"
import { httpQueryCacheCreate } from "./httpQueryCacheCreate.js"

const httpQueryAnonymousAccountId = "anonymous"

/**
 * Account-scoped facade over the shared volatile revision/ETag cache. Every
 * lookup resolves the cache of the currently signed-in application user, so one
 * account's retained representations are never rendered as another account's
 * data, and `keyCreate` prefixes canonical resource keys with the same account.
 */
export function httpQueryAccountCacheCreate(accountId: Accessor<string | null | undefined>) {
  const accountKey = () => accountId() ?? httpQueryAnonymousAccountId
  const cache: ReturnType<typeof httpQueryCacheCreate> = {
    clear: (key) => httpQueryCacheCreate(accountKey()).clear(key),
    get: <T>(key: string) => httpQueryCacheCreate(accountKey()).get<T>(key),
    invalidate: (key, revision) => httpQueryCacheCreate(accountKey()).invalidate(key, revision),
    replace: (key, entry) => httpQueryCacheCreate(accountKey()).replace(key, entry),
  }

  return { accountKey, cache, keyCreate: (resource: string) => `${accountKey()} ${resource}` }
}
