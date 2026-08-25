# Authworks SSO

## Goal

Replace the failing local login flow with Authworks SSO through `authworks.contentoren.de`, using the existing Authworks and Contentoren configuration as the source of truth.

## Decisions

- Reuse the existing Authworks implementation in `~/adaptive/authworks`.
- Reuse existing credentials/configuration from Authworks environment files or `~/leo/contentoren-server`; do not duplicate secrets in tracked files.
- Preserve Codeline's existing authenticated-session behavior where compatible.
- Use Codeline's existing Authorization Code + PKCE callback at `https://preview.codeline.work/api/auth/callback`.
- Configure Authworks as a confidential OIDC Web client with `openid email profile` scopes and exact redirect matching.
- Authworks production scope support is deployed and the confidential client is registered; Codeline includes the resource-owner scope when production discovery advertises it.
- Validate through the repository-managed combined preview service at `https://preview.codeline.work`.
- The credential-required callback remains intentionally unexercised; no credentials or secrets are stored in Codeline.

## Approach

- Inspect Codeline's current authentication flow and service-worker failure.
- Inspect Authworks integration contracts and the Contentoren deployment configuration.
- Implement the smallest Codeline and configuration changes needed for SSO.
- Verify focused tests, the managed service, and the redirect into the Authworks login UI; do not exercise the credential-required callback.

## Tasks

- [x] 1. Map Codeline authentication, service-worker routing, and relevant tests/configuration.
- [x] 2. Map Authworks SSO integration requirements and available Contentoren configuration without exposing secrets.
- [x] 3. Implement the Authworks SSO backend/configuration integration. (Authworks production scope support is deployed and the confidential client is registered; Codeline now uses the advertised resource-owner scope when available.)
- [x] 4. Update the login UI/client flow for Authworks SSO. (The managed preview login action redirects to the Authworks login UI.)
- [x] 5. Add or update focused automated tests. (Focused auth/login/service-worker tests pass; typecheck and build pass.)
- [x] 6. Verify the managed combined preview service and login redirect. (The managed preview is ready, redirects to Authworks, and serves the fixed service worker; the credential-required callback remains not exercised.)

## Paths

- `src/`
- `ops/dev/`
- `docs/20260825_authworks_sso.md`
- `~/adaptive/authworks`
- `~/leo/contentoren-server`
