import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { e2eCheckpointRecover } from "./e2eCheckpointRecover.js"
import { e2eCheckpointStoreCreate } from "./e2eCheckpointStoreCreate.js"
import type { E2eCheckpoint } from "./e2eCheckpointSchema.js"
import { e2eFixtureCleanupCreate } from "./e2eFixtureCleanupCreate.js"
import { e2eFixtureRequest } from "./e2eFixtureRequest.js"
import { e2eRunIdCreate } from "./e2eRunIdCreate.js"
import type { E2eSuite } from "./e2eSuiteSchema.js"
import { e2eSuitesRun } from "./e2eSuitesRun.js"
import * as v from "valibot"

const origin = "https://preview.codeline.work"
const issuedSchema = v.object({
  exists: v.literal(true),
  createdAt: v.pipe(v.string(), v.isoTimestamp()),
  userIds: v.tuple([v.string(), v.string()]),
  members: v.tuple([v.object({ userId: v.string() }), v.object({ userId: v.string() })]),
})
const statusSchema = v.object({
  exists: v.boolean(),
  createdAt: v.optional(v.pipe(v.string(), v.isoTimestamp())),
  userIds: v.optional(v.array(v.string())),
})
const suites: [E2eSuite, E2eSuite] = [
  { id: "e2e/lifecycleA", steps: ["e2e/lifecycleA/issue.spec.ts", "e2e/lifecycleA/verify.spec.ts"] },
  { id: "e2e/lifecycleB", steps: ["e2e/lifecycleB/finish.spec.ts"] },
]

/** Explicit, serial live verification; never uses the default production checkpoint directory. */
export async function e2eLifecycleVerify(token: string): Promise<void> {
  if (token.length < 32) throw new Error("E2E_FIXTURE_API_TOKEN is required")
  const directory = await mkdtemp("/tmp/opencode/codeline/e2e/verification-")
  const store = e2eCheckpointStoreCreate(directory)
  const cleanup = e2eFixtureCleanupCreate(token, { production: origin, dev: origin })
  const status = (id: string) => e2eFixtureRequest(origin, token, `/${id}`, statusSchema)
  const issue = async (checkpoint: E2eCheckpoint, fixtureId: string) => {
    // Persist the owned marker before the API call, even if the response is lost.
    const stored = await store.load(checkpoint.target)
    assert.equal(stored?.runId, checkpoint.runId)
    assert.equal(stored.origin, origin)
    await store.save({
      ...stored,
      resourceIds: { fixtureRunIds: [...stored.resourceIds.fixtureRunIds, fixtureId] },
    })
    const issued = await e2eFixtureRequest(origin, token, "", issuedSchema, "POST", { runId: fixtureId })
    assert.deepEqual(
      issued.members.map((member) => member.userId),
      issued.userIds,
    )
    const live = await status(fixtureId)
    assert.equal(live.exists, true)
    assert.deepEqual(live.userIds, issued.userIds)
    assert.equal(live.createdAt, issued.createdAt)
    return issued
  }
  const seen: string[] = []
  let complete = false
  try {
    const firstRunId = e2eRunIdCreate()
    const firstFixtureId = e2eRunIdCreate()
    let issued: v.InferOutput<typeof issuedSchema> | undefined
    const options = {
      target: "production" as const,
      origin,
      suites,
      store,
      cleanup,
      runIdCreate: () => firstRunId,
    }
    await assert.rejects(
      e2eSuitesRun({
        ...options,
        suiteRun: async (suite, checkpoint) => {
          for (const step of suite.steps) {
            seen.push(step)
            if (step === suites[0].steps[0]) issued = await issue(checkpoint, firstFixtureId)
            if (step === suites[1].steps[0]) throw new Error("deliberate lifecycle verification failure")
          }
        },
      }),
      /deliberate lifecycle verification failure/,
    )
    const verifiedIssued = issued
    assert.ok(verifiedIssued)
    const retained = await store.load("production")
    assert.ok(retained)
    assert.equal(retained?.runId, firstRunId)
    assert.equal(retained.origin, origin)
    assert.deepEqual(retained.completedSuites, [suites[0].id])
    assert.deepEqual(retained.resourceIds.fixtureRunIds, [firstFixtureId])
    assert.deepEqual(
      retained.suiteManifest,
      suites.map(({ id, steps }) => ({ id, steps: [...steps] })),
    )
    assert.equal((await status(firstFixtureId)).createdAt, verifiedIssued.createdAt)
    assert.deepEqual((await status(firstFixtureId)).userIds, verifiedIssued.userIds)
    console.info("Lifecycle: deliberate failure retained checkpoint, member IDs and creation time")

    await e2eSuitesRun({
      ...options,
      runIdCreate: () => {
        throw new Error("resume must not create a new run")
      },
      suiteRun: async (suite, checkpoint) => {
        assert.equal(suite.id, suites[1].id)
        assert.equal(checkpoint.runId, firstRunId)
        assert.equal(checkpoint.createdAt, retained.createdAt)
        assert.deepEqual(checkpoint.resourceIds.fixtureRunIds, [firstFixtureId])
        assert.equal((await status(firstFixtureId)).createdAt, verifiedIssued.createdAt)
        assert.deepEqual((await status(firstFixtureId)).userIds, verifiedIssued.userIds)
        seen.push(suite.steps[0]!)
      },
    })
    assert.deepEqual(seen, [...suites[0].steps, suites[1].steps[0], suites[1].steps[0]])
    assert.equal((await status(firstFixtureId)).exists, false)
    assert.equal(await store.load("production"), undefined)
    console.info("Lifecycle: resumed exact identity, skipped completed steps, verified cleanup")

    const foreignRunId = e2eRunIdCreate()
    const foreignFixtureId = e2eRunIdCreate()
    const foreign: E2eCheckpoint = {
      ...retained,
      runId: foreignRunId,
      completedSuites: [],
      resourceIds: { fixtureRunIds: [] },
    }
    await store.save(foreign)
    const foreignIssued = await issue(foreign, foreignFixtureId)
    const foreignStored = await store.load("production")
    assert.ok(foreignStored)
    const mismatchedStore = {
      ...store,
      load: async (target: E2eCheckpoint["target"]) => (target === "dev" ? store.load("production") : undefined),
      targets: async () => [] as E2eCheckpoint["target"][],
    }
    await assert.rejects(
      e2eSuitesRun({
        target: "dev",
        origin,
        suites,
        store: mismatchedStore,
        cleanup,
        suiteRun: async () => {
          throw new Error("foreign suite must not run")
        },
      }),
      /target mismatch/,
    )
    assert.deepEqual(await store.load("production"), foreignStored)
    assert.equal((await status(foreignFixtureId)).createdAt, foreignIssued.createdAt)
    assert.deepEqual((await status(foreignFixtureId)).userIds, foreignIssued.userIds)
    await cleanup(foreignStored)
    await store.clear(foreignStored)
    assert.equal((await status(foreignFixtureId)).exists, false)
    console.info("Lifecycle: foreign-target checkpoint and data untouched by mismatch")

    // Advance only the runner clock; the API uses its real timestamps and ownership checks.
    const base = new Date()
    const agedRunId = e2eRunIdCreate()
    const agedFixtureId = e2eRunIdCreate()
    const agedOptions = { ...options, runIdCreate: () => agedRunId, now: () => base }
    await assert.rejects(
      e2eSuitesRun({
        ...agedOptions,
        suiteRun: async (suite, checkpoint) => {
          if (suite.id === suites[0].id) await issue(checkpoint, agedFixtureId)
          else throw new Error("deliberate aged-run failure")
        },
      }),
      /deliberate aged-run failure/,
    )
    const aged = await store.load("production")
    assert.equal(aged?.createdAt, base.toISOString())
    assert.deepEqual(aged.resourceIds.fixtureRunIds, [agedFixtureId])
    assert.equal((await status(agedFixtureId)).exists, true)
    const freshRunId = e2eRunIdCreate()
    const freshFixtureId = e2eRunIdCreate()
    await e2eSuitesRun({
      ...options,
      now: () => new Date(base.getTime() + 24 * 60 * 60 * 1000),
      runIdCreate: () => freshRunId,
      suiteRun: async (suite, checkpoint) => {
        assert.equal(checkpoint.runId, freshRunId)
        assert.equal((await status(agedFixtureId)).exists, false)
        if (suite.id === suites[0].id) await issue(checkpoint, freshFixtureId)
      },
    })
    assert.equal((await status(agedFixtureId)).exists, false)
    assert.equal((await status(freshFixtureId)).exists, false)
    assert.equal(await store.load("production"), undefined)
    console.info("Lifecycle: exactly 24h checkpoint purged before fresh fixtures; both runs absent")
    complete = true
  } finally {
    // An unexpected failure still attempts verified teardown; leave the directory for recovery if unsafe.
    for (const target of ["production", "dev"] as const) {
      const checkpoint = await store.load(target)
      if (checkpoint === undefined) continue
      const recovered = await e2eCheckpointRecover({
        runId: checkpoint.runId,
        target,
        origin,
        store,
        cleanup,
      })
      if (!recovered.success)
        throw new Error(`Verification checkpoint retained in ${directory}: ${recovered.errorMessage}`)
    }
    if (complete) await rm(directory, { recursive: true })
    else console.error(`Verification failed; inspect isolated directory ${directory}`)
  }
}
