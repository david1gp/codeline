import type { Page } from "@playwright/test"
import { sessionCacheDatabaseConfig } from "../../src/session/storage/sessionCacheDatabaseConfig.js"

/** Reads device-local snapshot records written by public application behavior. */
export async function expiredCursorSnapshotRecordsRead(page: Page): Promise<Array<Record<string, unknown>>> {
  return page.evaluate(async (name) => {
    const opened = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      if (!opened.objectStoreNames.contains("sessionSnapshots")) return []
      const store = opened.transaction("sessionSnapshots", "readonly").objectStore("sessionSnapshots")
      const records = await new Promise<unknown[]>((resolve, reject) => {
        const request = store.getAll()
        request.onsuccess = () => resolve(request.result as unknown[])
        request.onerror = () => reject(request.error)
      })
      return records as Array<Record<string, unknown>>
    } finally {
      opened.close()
    }
  }, sessionCacheDatabaseConfig.name)
}
