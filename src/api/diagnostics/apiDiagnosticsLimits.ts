export const apiDiagnosticsLimits = {
  maxBatchSize: 50,
  maxBodyBytes: 64 * 1024,
  maxMessageLength: 4_000,
  maxSourceLength: 64,
  maxStackLength: 8_000,
  maxStructuredDepth: 8,
  maxStructuredEntries: 50,
  maxStructuredNodes: 500,
  maxStructuredStringLength: 4_000,
  maxTimestampLength: 64,
  maxUrlLength: 2_048,
} as const
