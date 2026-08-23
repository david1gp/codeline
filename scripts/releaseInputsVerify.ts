import { releaseInputsVerify } from "../src/release/releaseInputsVerify.js"

const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "")
const args = Bun.argv.slice(2)
let manifestPath: string | undefined
let input: "gitStore" | undefined
let verifyRoot = root

for (let index = 0; index < args.length; index += 1) {
  const argument = args[index]
  if (argument === "--manifest" || argument === "--root" || argument === "--input") {
    const value = args[index + 1]
    if (value === undefined) {
      console.error(`release-inputs: ${argument} requires a value`)
      process.exit(2)
    }
    if (argument === "--manifest") manifestPath = value
    if (argument === "--root") verifyRoot = value
    if (argument === "--input") {
      if (value === "git-store" || value === "gitStore") input = "gitStore"
      else {
        console.error(`release-inputs: unknown input ${value}`)
        process.exit(2)
      }
    }
    index += 1
    continue
  }
  console.error(`release-inputs: unknown argument ${argument}`)
  process.exit(2)
}

const result = await releaseInputsVerify({
  root: verifyRoot,
  manifestPath,
  inputNames: input === undefined ? undefined : [input],
})
if (!result.success) {
  console.error(`release-inputs: ${result.errorMessage}`)
  process.exit(1)
}

for (const label of result.data) console.log(`release-inputs: verified ${label}`)
