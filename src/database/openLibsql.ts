import { mkdirSync } from "node:fs"
import path from "node:path"
import { createClient } from "@libsql/client"
import { sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/libsql"

export function openLibsql(filePath: string) {
  const absoluteFilePath = path.resolve(filePath)
  mkdirSync(path.dirname(absoluteFilePath), { recursive: true })
  const absoluteFileUrl = `file://${absoluteFilePath}`
  const client = createClient({ url: absoluteFileUrl })
  const db = drizzle(client)

  // https://phiresky.github.io/blog/2020/sqlite-performance-tuning/
  void db.run(sql`pragma journal_mode = WAL;`).catch((error) => console.log("journal", error))
  void db.run(sql`pragma synchronous = normal;`).catch((error) => console.log("sync", error))
  void db.run(sql`pragma temp_store = memory;`).catch((error) => console.log("temp", error))
  void db.run(sql`pragma busy_timeout = 5000;`).catch((error) => console.log("busy", error))

  // https://blog.pecar.me/sqlite-django-config
  void db.run(sql`pragma legacy_alter_table = OFF;`).catch((error) => console.log("legacy", error))
  void db.run(sql`pragma mmap_size = 134217728;`).catch((error) => console.log("mmap", error))
  void db.run(sql`pragma journal_size_limit = 27103364;`).catch((error) => console.log("journal size", error))
  void db.run(sql`pragma cache_size = 2000;`).catch((error) => console.log("cache", error))

  return db
}
