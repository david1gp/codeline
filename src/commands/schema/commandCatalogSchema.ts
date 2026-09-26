import * as path from "node:path"
import * as v from "valibot"
import { commandDiscoveryLimits } from "../commandDiscoveryLimits.js"
import { commandCollisionSchema } from "./commandCollisionSchema.js"
import { commandDiagnosticSchema } from "./commandDiagnosticSchema.js"
import { commandDigestSchema } from "./commandDigestSchema.js"
import { commandSnapshotSchema } from "./commandSnapshotSchema.js"

const commandCatalogRootSchema = v.pipe(
  v.strictObject({
    canonicalPath: v.pipe(
      v.string(),
      v.minLength(1),
      v.maxLength(4_096),
      v.check((value) => path.isAbsolute(value)),
    ),
    precedence: v.pipe(v.number(), v.integer(), v.minValue(0)),
    source: v.picklist(["global", "project"]),
  }),
  v.check(({ precedence, source }) => precedence === (source === "global" ? 0 : 1)),
)

export const commandCatalogSchema = v.pipe(
  v.strictObject({
    collisions: v.pipe(v.array(commandCollisionSchema), v.maxLength(commandDiscoveryLimits.maximumCommands)),
    commands: v.pipe(v.array(commandSnapshotSchema), v.maxLength(commandDiscoveryLimits.maximumCommands)),
    diagnostics: v.pipe(v.array(commandDiagnosticSchema), v.maxLength(commandDiscoveryLimits.maximumDiagnostics)),
    digest: commandDigestSchema,
    roots: v.pipe(v.array(commandCatalogRootSchema), v.maxLength(2)),
    version: v.literal(1),
  }),
  v.check(({ commands }) => new Set(commands.map(({ name }) => name)).size === commands.length),
  v.check(({ commands }) =>
    commands.every((command, index) => index === 0 || commands[index - 1]!.name < command.name),
  ),
  v.check(({ collisions }) => new Set(collisions.map(({ name }) => name)).size === collisions.length),
  v.check(({ roots }) => new Set(roots.map(({ source }) => source)).size === roots.length),
)

export type CommandCatalog = v.InferOutput<typeof commandCatalogSchema>
