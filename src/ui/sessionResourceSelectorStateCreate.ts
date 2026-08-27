import type { Accessor } from "solid-js"
import { createEffect, untrack } from "solid-js/dist/solid.js"
import type { AgentToolDefaultsEntry } from "../agents/client/agentToolDefaultsListFetch.js"
import { agentToolDefaultsListFetch } from "../agents/client/agentToolDefaultsListFetch.js"
import type { AgentInstructionInspectionResponse } from "../instructions/api/agentInstructionInspectionResponseSchema.js"
import { agentInstructionInspectionFetch } from "../instructions/client/agentInstructionInspectionFetch.js"
import type { ProjectApiIdentityResponse } from "../project/api/projectApiIdentityResponseSchema.js"
import { projectIdentityFetch } from "../project/client/projectIdentityFetch.js"
import type { SessionDetailResponse } from "../session/api/sessionDetailResponseSchema.js"
import type { SessionExecutionSelection } from "../session/schema/sessionExecutionSelectionSchema.js"
import { sessionDetailFetch } from "../session/ui/sessionDetailFetch.js"
import type { SkillCatalogInspectionResponse } from "../skills/api/skillCatalogInspectionResponseSchema.js"
import type { SkillPresetInspectionResponse } from "../skills/api/skillPresetInspectionResponseSchema.js"
import type { SkillSelectionInspectionResponse } from "../skills/api/skillSelectionInspectionResponseSchema.js"
import { skillCatalogInspectionFetch } from "../skills/client/skillCatalogInspectionFetch.js"
import { skillPresetInspectionFetch } from "../skills/client/skillPresetInspectionFetch.js"
import { skillSelectionInspectionFetch } from "../skills/client/skillSelectionInspectionFetch.js"
import { httpQueryStateCreate } from "./httpQueryStateCreate.js"
import type { SessionResourceSelectorAgentTools, SessionResourceSelectorView } from "./sessionResourceSelectorView.js"
import { sessionResourceSkillCatalogEstimate } from "./sessionResourceSkillCatalogEstimate.js"
import { sessionResourceSkillSelectionDerive } from "./sessionResourceSkillSelectionDerive.js"
import { sessionResourceSkillTreeDerive } from "./sessionResourceSkillTreeDerive.js"
import { signalObjectCreate } from "./signalObjectCreate.js"

type SessionResourceSelectorFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

type SessionResourceSelectorStateOptions = {
  fetch?: SessionResourceSelectorFetch
  isOnline?: Accessor<boolean>
  /** Project the pending session will run in; resolved to a project id for inspection reads. */
  projectPath: Accessor<string | null>
  selectedAgentId: Accessor<string | null>
  selectedServerId: Accessor<string | null>
  selectedSessionId: Accessor<string | null>
}

const skillOverrideEmpty = { disabledSkills: [] as readonly string[], enabledSkills: [] as readonly string[] }

export function sessionResourceSelectorStateCreate(
  options: SessionResourceSelectorStateOptions,
): SessionResourceSelectorView {
  const fetchImplementation = options.fetch ?? globalThis.fetch
  const request = { fetch: fetchImplementation }

  // Pending, unsubmitted choices. They are deliberately not persisted: the server owns
  // the durable per-user default, and an unsubmitted selection must never leak into it.
  const presetOverride = signalObjectCreate<string | null>(null)
  const skillEnabledDelta = signalObjectCreate<readonly string[]>([])
  const skillDisabledDelta = signalObjectCreate<readonly string[]>([])
  const toolOverrides = signalObjectCreate<Readonly<Record<string, { bash?: boolean; webfetch?: boolean }>>>({})
  const inspectorOpen = signalObjectCreate(false)

  const isExistingSession = () => options.selectedSessionId() !== null

  // The inspection routes are project-id scoped. The server owns the reference-to-id
  // mapping, because display labels are disambiguated and are not stable identifiers.
  const projectQuery = httpQueryStateCreate<ProjectApiIdentityResponse>({
    key: () => {
      const projectPath = options.projectPath()
      return projectPath === null ? undefined : `/api/project/identity?path=${encodeURIComponent(projectPath)}`
    },
    load: async (_key, signal) =>
      projectIdentityFetch(untrack(() => options.projectPath()) ?? "", { ...request, signal }),
  })

  const projectId = () => projectQuery.data()?.id ?? null

  const catalogQuery = httpQueryStateCreate<SkillCatalogInspectionResponse>({
    enabled: () => !isExistingSession(),
    key: () => {
      const id = projectId()
      return id === null ? undefined : `/api/project/skills/catalog?project=${id}`
    },
    load: async (_key, signal) => skillCatalogInspectionFetch(untrack(() => projectId()) ?? "", { ...request, signal }),
  })

  const presetQuery = httpQueryStateCreate<SkillPresetInspectionResponse>({
    enabled: () => !isExistingSession(),
    key: () => {
      const id = projectId()
      return id === null ? undefined : `/api/project/skills/presets?project=${id}`
    },
    load: async (_key, signal) => skillPresetInspectionFetch(untrack(() => projectId()) ?? "", { ...request, signal }),
  })

  const selectionQuery = httpQueryStateCreate<SkillSelectionInspectionResponse>({
    enabled: () => !isExistingSession(),
    key: () => {
      const id = projectId()
      if (id === null) return undefined
      const preset = presetOverride.get()
      return `/api/project/skills/selection?project=${id}${preset === null ? "" : `&preset=${preset}`}`
    },
    load: async (_key, signal) =>
      skillSelectionInspectionFetch(untrack(() => projectId()) ?? "", {
        ...request,
        ...(untrack(() => presetOverride.get()) === null
          ? {}
          : { presetName: untrack(() => presetOverride.get()) ?? "" }),
        signal,
      }),
  })

  // An existing session renders its own captured instruction snapshot, never the
  // current filesystem state, so discovery is only read while the selection is mutable.
  const instructionQuery = httpQueryStateCreate<AgentInstructionInspectionResponse>({
    enabled: () => !isExistingSession(),
    key: () => {
      const id = projectId()
      return id === null ? undefined : `/api/agent-instructions?project=${id}`
    },
    load: async (_key, signal) =>
      agentInstructionInspectionFetch(untrack(() => projectId()) ?? "", { ...request, signal }),
  })

  // An existing session displays the immutable selection it captured at creation.
  const sessionDetailQuery = httpQueryStateCreate<SessionDetailResponse>({
    key: () => {
      const sessionId = options.selectedSessionId()
      return sessionId === null ? undefined : `/api/sessions/${encodeURIComponent(sessionId)}`
    },
    load: async (_key, signal) =>
      sessionDetailFetch(untrack(() => options.selectedSessionId()) ?? "", { ...request, signal }),
  })

  const agentToolsQuery = httpQueryStateCreate<readonly AgentToolDefaultsEntry[]>({
    enabled: () => !isExistingSession(),
    key: () => {
      const serverId = options.selectedServerId()
      return serverId === null ? undefined : `/api/servers/${serverId}/agents#tool-defaults`
    },
    load: async (_key, signal) =>
      agentToolDefaultsListFetch(untrack(() => options.selectedServerId()) ?? "", { ...request, signal }),
  })

  // A preset or project change invalidates per-skill overrides, because the names they
  // referenced may no longer be selectable under the newly resolved preset.
  let lastSelectionScope: string | null = null
  createEffect(() => {
    const scope = `${options.projectPath() ?? ""}|${presetOverride.get() ?? ""}`
    if (lastSelectionScope === scope) return
    lastSelectionScope = scope
    untrack(() => {
      skillEnabledDelta.set([])
      skillDisabledDelta.set([])
    })
  })

  let lastToolScope: string | null = null
  createEffect(() => {
    const scope = `${options.selectedServerId() ?? ""}|${options.selectedAgentId() ?? ""}`
    if (lastToolScope === scope) return
    lastToolScope = scope
    untrack(() => toolOverrides.set({}))
  })

  const selectionResponse = () => selectionQuery.data()
  const presetName = () => presetOverride.get() ?? selectionResponse()?.selection.presetName ?? null
  const activePreset = () => {
    const name = presetName()
    return presetQuery.data()?.presets.find((preset) => preset.name === name) ?? null
  }

  const derivedSelection = () => {
    const response = selectionResponse()
    if (response === undefined) {
      return { activeSkillNames: [] as readonly string[], requestOverride: skillOverrideEmpty }
    }
    return sessionResourceSkillSelectionDerive({
      delta: { disabledSkills: skillDisabledDelta.get(), enabledSkills: skillEnabledDelta.get() },
      loadedOverride: response.selection.userOverride,
      presetExcludeSkillNames: activePreset()?.excludeSkills ?? [],
      serverActiveSkillNames: response.selection.activeSkills.map(({ name }) => name),
    })
  }

  const catalogSkills = () => catalogQuery.data()?.skills ?? []

  const activeSkills = () => {
    const names = new Set(derivedSelection().activeSkillNames)
    return catalogSkills()
      .filter(({ name }) => names.has(name))
      .map(({ bundlePath, description, name, source }) => ({ bundlePath, description, name, source }))
  }

  const descriptionCatalog = () => sessionResourceSkillCatalogEstimate(activeSkills())

  const folders = () =>
    sessionResourceSkillTreeDerive({
      activeSkillNames: derivedSelection().activeSkillNames,
      excludedSkillNames: activePreset()?.excludeSkills ?? [],
      groups: catalogQuery.data()?.groups ?? [],
      skills: catalogSkills(),
    })

  const skillToggle = (name: string, enabled: boolean) => {
    const enabledNames = new Set(skillEnabledDelta.get())
    const disabledNames = new Set(skillDisabledDelta.get())
    if (enabled) {
      enabledNames.add(name)
      disabledNames.delete(name)
    } else {
      disabledNames.add(name)
      enabledNames.delete(name)
    }
    skillEnabledDelta.set([...enabledNames])
    skillDisabledDelta.set([...disabledNames])
  }

  const folderToggle = (folderPath: string, enabled: boolean) => {
    const folder = folders().find((candidate) => candidate.path === folderPath)
    if (folder === undefined) return
    const enabledNames = new Set(skillEnabledDelta.get())
    const disabledNames = new Set(skillDisabledDelta.get())
    for (const name of folder.descendantSkillNames) {
      if (enabled) {
        enabledNames.add(name)
        disabledNames.delete(name)
        continue
      }
      disabledNames.add(name)
      enabledNames.delete(name)
    }
    skillEnabledDelta.set([...enabledNames])
    skillDisabledDelta.set([...disabledNames])
  }

  // Only the selected primary agent and the agents that are actually selectable as
  // subagents belong to a session's tool selection. Other primary agents on the same
  // server are separate session targets, not delegation targets, and including them
  // would both misrepresent the session and exceed the selection's subagent bound.
  const agentTools = () => {
    const overrides = toolOverrides.get()
    const primaryAgentId = options.selectedAgentId()
    return (agentToolsQuery.data() ?? [])
      .filter((entry) => entry.agentId === primaryAgentId || entry.parentAgentId !== null)
      .map((entry) => {
        const override = overrides[entry.agentId] ?? {}
        return {
          agentId: entry.agentId,
          bash: override.bash ?? entry.tools.bash,
          isPrimary: entry.agentId === primaryAgentId,
          name: entry.name,
          role: entry.role,
          webfetch: override.webfetch ?? entry.tools.webfetch,
        }
      })
  }

  const toolToggle = (agentId: string, tool: "bash" | "webfetch", enabled: boolean) => {
    const current = toolOverrides.get()
    toolOverrides.set({ ...current, [agentId]: { ...(current[agentId] ?? {}), [tool]: enabled } })
  }

  const pendingExecutionSelection = (): SessionExecutionSelection | undefined => {
    const primaryAgentId = options.selectedAgentId()
    const entries = agentTools()
    if (primaryAgentId === null || entries.length === 0) return undefined
    const primary = entries.find((entry) => entry.agentId === primaryAgentId)
    if (primary === undefined) return undefined
    return {
      tools: {
        primary: { agentId: primary.agentId, tools: { bash: primary.bash, webfetch: primary.webfetch } },
        selectableSubagents: entries
          .filter((entry) => entry.agentId !== primaryAgentId)
          .map((entry) => ({ agentId: entry.agentId, tools: { bash: entry.bash, webfetch: entry.webfetch } })),
      },
      version: 1,
    }
  }

  const pendingSkillSelection = () => {
    const name = presetName()
    const override = derivedSelection().requestOverride
    if (name === null) return undefined
    return {
      override: { disabledSkills: [...override.disabledSkills], enabledSkills: [...override.enabledSkills] },
      presetName: name,
    }
  }

  const queries = [catalogQuery, presetQuery, selectionQuery, instructionQuery, agentToolsQuery] as const

  const existingExecutionResources = () => sessionDetailQuery.data()?.session.executionResources ?? null

  const status = (): ReturnType<SessionResourceSelectorView["status"]> => {
    if (options.isOnline?.() === false) return "offline"
    if (isExistingSession()) {
      if (sessionDetailQuery.isError()) return "error"
      return sessionDetailQuery.data() === undefined ? "loading" : "ready"
    }
    if (projectId() === null) return projectQuery.isError() ? "error" : "loading"
    if (queries.some((query) => query.isError())) return "error"
    if (queries.some((query) => query.isLoading() && query.data() === undefined)) return "loading"
    return "ready"
  }

  const errorMessage = () => {
    if (isExistingSession()) {
      return sessionDetailQuery.isError()
        ? (sessionDetailQuery.errorMessage() ?? "The captured session resources are unavailable.")
        : null
    }
    return (
      queries.find((query) => query.isError())?.errorMessage() ??
      (projectQuery.isError() ? (projectQuery.errorMessage() ?? "The project set is unavailable.") : null) ??
      null
    )
  }

  // A created session is described only by its immutable manifest projection, so the
  // captured values replace the live discovery reads instead of merging with them.
  const capturedActiveSkills = () =>
    (existingExecutionResources()?.skills ?? []).map(({ bundlePath, description, name, source }) => ({
      bundlePath,
      description,
      name,
      source,
    }))

  const capturedAgentTools = (): readonly SessionResourceSelectorAgentTools[] => {
    const resources = existingExecutionResources()
    if (resources === null) return []
    const entryCreate = (entry: { agentId: string; tools: readonly string[] }, isPrimary: boolean) => ({
      agentId: entry.agentId,
      bash: entry.tools.includes("bash"),
      isPrimary,
      name: entry.agentId,
      role: isPrimary ? "primary" : "subagent",
      webfetch: entry.tools.includes("webfetch"),
    })
    return [
      entryCreate(resources.tools.primary, true),
      ...resources.tools.selectableSubagents.map((entry) => entryCreate(entry, false)),
    ]
  }

  return {
    activeSkills: () => (isExistingSession() ? capturedActiveSkills() : activeSkills()),
    agentTools: () => (isExistingSession() ? capturedAgentTools() : agentTools()),
    collisions: () => catalogQuery.data()?.collisions ?? [],
    descriptionCatalog: () => {
      if (!isExistingSession()) return descriptionCatalog()
      const captured = existingExecutionResources()?.descriptionCatalog
      const rendered = sessionResourceSkillCatalogEstimate(capturedActiveSkills())
      if (captured === null || captured === undefined) return rendered
      return {
        characterCount: captured.characterCount,
        content: rendered.content,
        estimatedTokens: captured.estimatedTokens,
      }
    },
    diagnostics: () => catalogQuery.data()?.diagnostics ?? [],
    errorMessage,
    existingExecutionResources,
    existingExecutionSelection: () => sessionDetailQuery.data()?.session.executionSelection ?? null,
    folders,
    folderToggle,
    groups: () => catalogQuery.data()?.groups ?? [],
    instructionDiagnostics: () => (isExistingSession() ? [] : (instructionQuery.data()?.diagnostics ?? [])),
    instructionSnapshots: () =>
      isExistingSession()
        ? (existingExecutionResources()?.instructionSources ?? [])
        : (instructionQuery.data()?.snapshots ?? []),
    inspectorOpen: inspectorOpen.get,
    inspectorOpenChange: inspectorOpen.set,
    isMutable: () => !isExistingSession(),
    missingFolderPaths: () => selectionResponse()?.selection.missingFolderPaths ?? [],
    missingSkillNames: () => selectionResponse()?.selection.missingSkillNames ?? [],
    pendingExecutionSelection,
    pendingSkillSelection,
    presetName: () => (isExistingSession() ? (existingExecutionResources()?.presetName ?? null) : presetName()),
    presetDiagnostics: () => presetQuery.data()?.diagnostics ?? [],
    presetSelect: (name: string) => {
      if (!(presetQuery.data()?.presets ?? []).some((preset) => preset.name === name)) return
      presetOverride.set(name)
    },
    presets: () => presetQuery.data()?.presets ?? [],
    presetSource: () => (presetOverride.get() === null ? "default" : "override"),
    retry: () => {
      if (isExistingSession()) {
        sessionDetailQuery.retry()
        return
      }
      for (const query of queries) query.retry()
      projectQuery.retry()
    },
    roots: () => catalogQuery.data()?.roots ?? [],
    skillBundles: () => catalogQuery.data()?.bundles ?? [],
    skillToggle,
    status,
    toolToggle,
  }
}

export type SessionResourceSelectorState = ReturnType<typeof sessionResourceSelectorStateCreate>
