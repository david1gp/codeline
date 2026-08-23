import { databaseMigrate } from "../src/database/databaseMigrate.js"

const result = await databaseMigrate()
if (!result.success) {
  console.error(result.errorMessage)
  process.exit(1)
}

console.log("Applied SQLite database migrations.")
