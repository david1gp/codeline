const subjectNamespace = "e2e-organization-member"

/**
 * Builds the run-unique subject namespace shared by the issuing and cleanup
 * scripts. Every synthetic identity of one run carries this prefix, so cleanup
 * can remove exactly the run's rows without touching seeded fixture data.
 */
export function e2eIdentitySubjectPrefixCreate(runId: string): string {
  return `${subjectNamespace}-${runId}-`
}
