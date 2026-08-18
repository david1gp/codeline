# Organization-scoped server access

## Goal

Model Contentoren as an organization, assign each configured machine/server to one organization, and allow every authenticated user of that ZITADEL organization to use its servers. Keep each user's sessions, notes, runs, messages, and streams private.

## Decisions

- Add an organization abstraction and make every server belong to exactly one organization.
- Derive organization membership from a validated ZITADEL organization/resource-owner claim at sign-in. Do not maintain separate invitations or manually provision each Contentoren user.
- Configure the allowed ZITADEL organization ID statically in the deployment environment and assign seeded/configured servers to that organization.
- Treat the OIDC client ID as the application audience, not proof of organization membership. Validate the issuer, audience, and organization claim independently.
- Allow all active members of the configured Contentoren organization to list and use its servers and enabled agents.
- Keep sessions and conversation data owned by their creating user even when users share organization servers.
- Keep server and agent configuration deployment-managed; the UI consumes organization-available targets.
- Preserve non-disclosure across organizations and reject sign-in when the validated organization is not allowed.
- The checked-in ZITADEL setup identifies `ssotest` as owned by Contentoren, so it should receive access once the Codeline client emits and validates that organization claim. David must resolve to the same organization claim; client ID alone cannot establish this.

## Approach

- First pin the exact ZITADEL resource-owner scope/claim and check in the missing Codeline project/application provisioning so organization access is reproducible.
- Add organizations and OIDC-derived memberships, then migrate servers from user ownership to organization ownership.
- Authorize server and agent use through the authenticated user's organization membership while retaining direct user checks on personal application data.
- Seed the Contentoren organization and its servers deterministically from non-secret environment identifiers.
- Verify both `ssotest` and David against the live client after the static configuration is reproducible.

## Tasks

- [x] 1. Confirm the live Codeline app's ZITADEL project, project-check policy, Contentoren organization ID, requested resource-owner scope, and emitted organization claim; add a checked-in Codeline project/application definition without secrets. Current context: provisioning is pagination-safe, requires explicit claim assertion, suppresses xtrace around admin tokens/client secrets, and passes shellcheck plus focused security tests.
- [x] 2. Add `organization` and `organization_member` persistence, add `server.organizationId`, migrate existing configured servers to Contentoren, remove `server.ownerUserId`, and update affected constraints, relations, and generated schema artifacts. Current context: migration now rejects missing/blank organization IDs before ownership changes, retains collision-safe renaming, and passes configured managed migration plus schema tests.
- [x] 3. Add the allowed organization ID and required claim/scope to runtime configuration; validate the organization claim during the OIDC callback and idempotently synchronize the user membership from the trusted issuer/subject/resource-owner tuple. Current context: OIDC and development authentication both require the exact configured issuer-bound membership and fail closed for missing, stale, ambiguous, or failed membership loads.
- [x] 4. Update server and agent repositories and `/api/servers` so authenticated members list and use servers belonging to their organization; remove user-owner checks from session creation and target switching while preserving cross-organization non-disclosure. Current context: current organization access is enforced for target selection and existing-session list/load/chat/branch/idempotent-create paths; reassignment and membership-loss regressions pass focused tests.
- [x] 5. Audit session, note, run, attempt, delegation, message, and stream repositories and APIs to ensure each user's private data remains isolated inside the shared organization. Current context: nested run/attempt, message-copy, and stream authorization gaps were closed; focused same-organization and cross-organization isolation tests pass with `userId` retained as the private-data boundary.
- [x] 6. Update fixtures, seed scripts, environment examples, and configuration reconciliation to create Contentoren once and assign the stable example servers to it without per-user ownership. Current context: seeding creates the organization/membership once, accepts exact idempotent matches, and atomically rejects conflicting external organization IDs without rebinding existing data.
- [x] 7. Add tests for allowed and denied organization claims, membership synchronization, two Contentoren users sharing server access, cross-organization server denial, and private session/run/message/note/stream isolation. Current context: organization callback, membership, shared-target, cross-organization, and personal-data coverage passes in all 680 tests under both default and explicit OIDC auth environments.
- [x] 8. Update setup-state messaging and development documentation, run the managed clean/migrate/seed workflow, and verify organization access end to end. Current context: local-only e2e setup/cleanup is guarded and fully tested, managed clean/migrate/seed succeeds, all 680 tests pass under default and OIDC environments, Playwright passes twice with no residue, and live `ssotest` access plus David's Contentoren eligibility are verified.

## Paths

- `src/identity/api/apiAuthRoutesAdd.ts`
- `src/identity/actions/oidcIdentityUpsert.ts`
- `src/identity/db/`
- `src/configuration/runtimeConfigurationSchema.ts`
- `src/configuration/runtimeConfigurationParse.ts`
- `src/servers/db/`
- `src/servers/api/`
- `src/agents/db/`
- `src/agents/api/`
- `src/session/`
- `src/note/`
- `src/run/`
- `src/stream/`
- `src/database/migrations/`
- `src/database/exampleDataFixture.ts`
- `src/database/exampleDataSeed.ts`
- `src/database/exampleDataConfigurationReconcile.ts`
- `src/database/zeroSchema.ts`
- `src/ui/WorkspaceSetupPanel.tsx`
- `scripts/dbSeed.ts`
- `scripts/e2eEnvironmentAssertLocal.ts`
- `scripts/e2eIdentityRunPurge.ts`
- `scripts/e2eIdentitySubjectPrefixCreate.ts`
- `scripts/e2eOrganizationMemberSessionsIssue.ts`
- `scripts/e2eOrganizationMemberSessionsPurge.ts`
- `e2e/organizationSharedAccess.spec.ts`
- `e2e/e2eMemberSessionsIssue.ts`
- `e2e/e2eMemberSessionsPurge.ts`
- `e2e/e2eRepositoryRoot.ts`
- `e2e/e2eRunIdCreate.ts`
- `playwright.config.ts`
- `README.md`
- `test/`
- `.env.example`
- `ops/dev/`
- `/home/david/leo/contentoren-server/zitadel/scripts/`
