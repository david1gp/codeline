import type {
  AnalyzeQueryResult,
  BaseDefaultContext,
  BaseDefaultSchema,
  CustomMutatorDefs,
  InspectorQuery,
  Zero,
} from "@rocicorp/zero"
import { onCleanup } from "solid-js"

const MATERIALIZATION_DIAGNOSTIC_INTERVAL_MS = 1_000
const MATERIALIZATION_DIAGNOSTIC_THRESHOLD_MS = 5_000
const REDACTED_QUERY_VALUE = "[redacted]"

type RedactedQueryValue = typeof REDACTED_QUERY_VALUE

type MaterializationAnalysis = Pick<
  AnalyzeQueryResult,
  "dbScansByQuery" | "readRowCount" | "readRowCountsByQuery" | "sqlitePlans"
>

type MaterializationDiagnostic = {
  analysis: { status: "pending" } | { status: "available"; result: MaterializationAnalysis } | { status: "unavailable" }
  hydrateClient: number | null
  hydrateServer: number | null
  hydrateTotal: number
  query: {
    args: RedactedQueryValue | null
    clientZQL: RedactedQueryValue | null
    id: string
    inactivatedAt: InspectorQuery["inactivatedAt"]
    name: InspectorQuery["name"]
    serverZQL: RedactedQueryValue | null
    ttl: InspectorQuery["ttl"]
  }
  rowCount: number
  thresholdMs: number
  type: "zero-slow-query-materialization"
}

type SlowMaterializationQuery = InspectorQuery & { hydrateTotal: number }

export function zeroMaterializationDiagnosticsStart<
  S extends BaseDefaultSchema,
  MD extends CustomMutatorDefs | undefined,
  C extends BaseDefaultContext,
>(zero: Zero<S, MD, C>): void {
  if (!import.meta.env.DEV) return

  let disposed = false
  let inspectorUnavailable = false
  let polling = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const reportedMaterializations = new Set<string>()

  const poll = async () => {
    if (disposed || polling) return
    polling = true

    try {
      const queries = await zero.inspector.client.queries()
      for (const query of queries) {
        if (disposed) break
        if (!materializationQueryIsSlow(query)) continue

        const materializationKey = materializationQueryKey(query)
        if (reportedMaterializations.has(materializationKey)) continue
        reportedMaterializations.add(materializationKey)
        materializationDiagnosticLog(query, () => disposed)
      }
    } catch {
      // Inspector data is best effort. Stop polling when it is unavailable.
      inspectorUnavailable = true
    } finally {
      polling = false
      if (!disposed && !inspectorUnavailable) {
        timer = setTimeout(() => void poll(), MATERIALIZATION_DIAGNOSTIC_INTERVAL_MS)
      }
    }
  }

  timer = setTimeout(() => void poll(), 0)
  onCleanup(() => {
    disposed = true
    if (timer !== undefined) clearTimeout(timer)
    reportedMaterializations.clear()
  })
}

function materializationQueryIsSlow(query: InspectorQuery): query is SlowMaterializationQuery {
  return !query.deleted && query.hydrateTotal !== null && query.hydrateTotal > MATERIALIZATION_DIAGNOSTIC_THRESHOLD_MS
}

function materializationQueryKey(query: InspectorQuery): string {
  return `${query.id}:${query.hydrateTotal}`
}

function materializationDiagnosticLog(query: SlowMaterializationQuery, isDisposed: () => boolean): void {
  const diagnostic: MaterializationDiagnostic = {
    analysis:
      query.serverZQL === null && (query.name === null || query.args === null)
        ? { status: "unavailable" }
        : { status: "pending" },
    hydrateClient: query.hydrateClient,
    hydrateServer: query.hydrateServer,
    hydrateTotal: query.hydrateTotal,
    query: {
      args: query.args === null ? null : REDACTED_QUERY_VALUE,
      clientZQL: query.clientZQL === null ? null : REDACTED_QUERY_VALUE,
      id: query.id,
      inactivatedAt: query.inactivatedAt,
      name: query.name,
      serverZQL: query.serverZQL === null ? null : REDACTED_QUERY_VALUE,
      ttl: query.ttl,
    },
    rowCount: query.rowCount,
    thresholdMs: MATERIALIZATION_DIAGNOSTIC_THRESHOLD_MS,
    type: "zero-slow-query-materialization",
  }

  console.warn(diagnostic)

  if (diagnostic.analysis.status === "unavailable") return
  void materializationDiagnosticAnalysisLoad(query, diagnostic, isDisposed)
}

async function materializationDiagnosticAnalysisLoad(
  query: InspectorQuery,
  diagnostic: MaterializationDiagnostic,
  isDisposed: () => boolean,
): Promise<void> {
  try {
    const result = await query.analyze({ joinPlans: true, syncedRows: false, vendedRows: false })
    if (isDisposed()) return
    diagnostic.analysis = {
      result: {
        dbScansByQuery: result.dbScansByQuery,
        readRowCount: result.readRowCount,
        readRowCountsByQuery: result.readRowCountsByQuery,
        sqlitePlans: result.sqlitePlans,
      },
      status: "available",
    }
  } catch {
    if (!isDisposed()) diagnostic.analysis = { status: "unavailable" }
  }
}
