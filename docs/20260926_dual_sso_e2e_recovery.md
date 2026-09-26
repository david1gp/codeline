# Dual SSO recovery and E2E verification

## Goal

Restore Authworks and Zitadel sign-in on the repository-managed combined preview at `https://preview.codeline.work`, and run a focused, repeatable browser E2E check for both providers using the `ssotest` account. Preserve the existing Codeline data and keep all credentials out of tracked files and command output.

## Decisions

- The existing provider clients remain in use. Their missing secrets may be rotated; the user approved rotation. Authworks and Zitadel secrets must be handed into provider-specific keys in Codeline's ignored, mode-600 `.env` without printing them.
- Provider organization IDs stay separate. The local Codeline organization ID is a stable explicit selection based on the verified Contentoren Zitadel organization; Authworks maps its own verified organization ID to it.
- Use the existing fixed `prodctl` Authworks bridges and Zitadel's protected Codeline application handoff, not arbitrary remote commands or ad-hoc servers.
- Use repository-owned seed/migration workflows, the managed combined preview service, Playwright with one worker, and focused tests only. Never reset the existing database just to enable SSO.
- Keep provider test credentials in ignored `.env`. The Authworks `ssotest` repair uses the fixed password/membership ensure bridge; Zitadel `testuser` credentials come from `zitadel-cli credentials get ... --profile contentoren`.

## Tasks

1. **Protected provider handoffs — complete.** Guard dual-provider environment updates, verify focused tests, deploy the prodctl bridge, and rotate existing Zitadel and Authworks Codeline client secrets into provider-specific ignored settings.
2. **Organization and test-account recovery — complete.** The fixed Authworks bridge reactivated the `ssotest` account with member membership and synchronized its provider organization ID. Both providers' test credentials are protected in the ignored environment. The empty local database was migrated and seeded through repository-owned workflows; the configured organization matches the single seeded organization.
3. **Managed dual-provider preview — complete.** OIDC mode exposes both providers on the managed preview; readiness and fixture authorization checks pass. Real browser logins and logouts succeeded for both Authworks and Zitadel.
4. **Focused browser E2E — complete.** The new Playwright spec passed for both providers against the managed preview, covering real sign-in, callback, dashboard, and logout with one worker.
5. **Finish — in progress.** Run focused checks and typecheck, review diffs and secret hygiene, commit and push tracked changes in the appropriate repositories, deploy as needed, and confirm the preview is healthy.

## Current context

The merged Codeline `main` is already pushed and the former topic branch is deleted. The managed preview runs OIDC mode with both Authworks and Zitadel. Its ignored `.env` contains protected fixture, client, organization, and test-account settings; local example data is seeded. The focused Playwright spec passed actual sign-in, callback, dashboard, and logout for both providers. Repeat the focused check with `bunx playwright test e2e/managedOriginSso/managedOriginSso.spec.ts --workers=1`; it requires `E2E_STAFF_EMAIL`, `E2E_STAFF_PASSWORD`, `E2E_ZITADEL_STAFF_EMAIL`, and `E2E_ZITADEL_STAFF_PASSWORD` in the ignored `.env`. Tracked-change review, commits, and final deployment remain. Never print any ID, password, token, client secret, or raw environment contents.
