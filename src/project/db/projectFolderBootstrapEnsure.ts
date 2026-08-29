import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { uuidv7 } from "../../uuid/uuidv7.js"
import type { ProjectFolderBootstrapKey } from "../projectFolderBootstrapKeySchema.js"
import { projectFolderTable } from "./projectFolderTable.js"

const projectFolderBootstrapDefinitions: readonly {
  key: ProjectFolderBootstrapKey
  name: string
}[] = [
  { key: "adaptive", name: "adaptive" },
  { key: "leo", name: "leo" },
  { key: "personal", name: "personal" },
]

export async function projectFolderBootstrapEnsure(
  database: Pick<DatabaseExecutor, "insert">,
  userId: string,
): Promise<Result<undefined>> {
  const op = "projectFolderBootstrapEnsure"

  try {
    for (const definition of projectFolderBootstrapDefinitions) {
      await database
        .insert(projectFolderTable)
        .values({
          id: uuidv7(),
          name: definition.name,
          bootstrapKey: definition.key,
          userId,
        })
        .onConflictDoNothing({ target: [projectFolderTable.userId, projectFolderTable.bootstrapKey] })
    }

    return createResult(undefined)
  } catch (_error) {
    return createResultError(op, "The project folders could not be bootstrapped.")
  }
}
