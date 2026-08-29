import { databaseMigrate } from "../src/database/databaseMigrate.js"
import { projectRootConfigurationParse } from "../src/configuration/projectRootConfigurationParse.js"

const projectRootDirs = projectRootConfigurationParse(Bun.env.CODELINE_PROJECT_ROOTS)
if (!projectRootDirs.success) {
  console.error(projectRootDirs.errorMessage)
  process.exit(1)
}

const result = await databaseMigrate(undefined, { projectRootDirs: projectRootDirs.data })
if (!result.success) {
  console.error(result.errorMessage)
  process.exit(1)
}

console.log("Applied SQLite database migrations.")
