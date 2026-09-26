#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
root=$(git -C "$script_dir/../.." rev-parse --show-toplevel)
env_file="$root/.env"
defaults_file="$script_dir/codeline-defaults.env"
target_unit=codeline-dev.target

source "$script_dir/codeline-project-roots.sh"

fail() {
  printf 'codeline-dev: %s\n' "$1" >&2
  exit 1
}

[[ -f "$env_file" ]] || fail "missing $env_file; copy .env.example to .env first"

declare -A loaded_env

load_env_file() {
  local file=$1 export_values=${2:-false} line name value
  loaded_env=()
  while IFS= read -r line || [[ -n "$line" ]]; do
    line=${line%$'\r'}
    [[ "$line" =~ ^[[:space:]]*$ || "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" =~ ^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=(.*)$ ]] ||
      fail "invalid line in $file"
    name=${BASH_REMATCH[2]}
    value=${BASH_REMATCH[3]}
    if [[ "$value" == \"*\" && "$value" == *\" ]]; then
      value=${value:1:${#value}-2}
    elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
      value=${value:1:${#value}-2}
    fi
    loaded_env["$name"]=$value
    if [[ "$export_values" == true ]]; then
      export "$name=$value"
    fi
  done < "$file"
}

require_loaded() {
  local name=$1
  [[ -n "${loaded_env[$name]:-}" ]] || fail "$name is required in $2"
}

require_any_loaded() {
  local description=$1 name
  shift
  for name in "$@"; do
    [[ -n "${loaded_env[$name]:-}" ]] && return 0
  done
  fail "$description is required in $env_file"
}

first_loaded_value() {
  local name
  for name in "$@"; do
    if [[ -n "${loaded_env[$name]:-}" ]]; then
      printf '%s' "${loaded_env[$name]}"
      return 0
    fi
  done
  return 1
}

project_roots_export() {
  codeline_project_roots_export "$env_file" "$defaults_file"
}

validate_provider_organization_mapping() {
  local authworks_organization zitadel_organization
  authworks_organization=$(first_loaded_value OIDC_AUTHWORKS_ORGANIZATION_ID OIDC_AUTHWORKS_ALLOWED_ORGANIZATION_ID || true)
  zitadel_organization=$(first_loaded_value \
    OIDC_ZITADEL_ORGANIZATION_ID OIDC_ZITADEL_ALLOWED_ORGANIZATION_ID \
    ZITADEL_ORGANIZATION_ID ZITADEL_ALLOWED_ORGANIZATION_ID || true)
  if [[ -n "$authworks_organization" && -n "$zitadel_organization" && "$authworks_organization" != "$zitadel_organization" ]]; then
    require_any_loaded 'a local Codeline organization external ID' OIDC_ORGANIZATION_ID OIDC_ALLOWED_ORGANIZATION_ID
  fi
}

validate_database_environment() {
  load_env_file "$env_file"
  local name
  for name in NODE_ENV CONFIG_STORE_DIR; do
    require_loaded "$name" "$env_file"
  done
  require_any_loaded 'an OIDC organization ID' \
    OIDC_AUTHWORKS_ORGANIZATION_ID OIDC_AUTHWORKS_ALLOWED_ORGANIZATION_ID \
    OIDC_ZITADEL_ORGANIZATION_ID OIDC_ZITADEL_ALLOWED_ORGANIZATION_ID \
    OIDC_ORGANIZATION_ID OIDC_ALLOWED_ORGANIZATION_ID \
    ZITADEL_ORGANIZATION_ID ZITADEL_ALLOWED_ORGANIZATION_ID
  validate_provider_organization_mapping
  [[ "${loaded_env[NODE_ENV]}" == development ]] || fail "NODE_ENV must be development"
}

validate_public_origin() {
  local public_origin=${loaded_env[PUBLIC_ORIGIN]%/}
  [[ "$public_origin" =~ ^https?://[^/]+$ ]] || fail "PUBLIC_ORIGIN must be an absolute origin without a path"
  [[ "$public_origin" == https://preview.codeline.work ]] ||
    fail "PUBLIC_ORIGIN must equal https://preview.codeline.work for the managed preview stack"
}

validate_environment() {
  load_env_file "$env_file"
  local name
  for name in NODE_ENV AUTH_MODE HOST PORT PUBLIC_ORIGIN CONFIG_STORE_DIR SESSION_SECRET \
    DEVELOPMENT_IDENTITY_KEY DEVELOPMENT_IDENTITY_DISPLAY_NAME; do
    require_loaded "$name" "$env_file"
  done
  [[ "${loaded_env[NODE_ENV]}" == development ]] || fail "NODE_ENV must be development"
  [[ "${loaded_env[AUTH_MODE]}" == development || "${loaded_env[AUTH_MODE]}" == oidc ]] ||
    fail "AUTH_MODE must be development or oidc"
  [[ "${loaded_env[PORT]}" == 6001 ]] || fail "PORT must equal 6001 for the managed preview stack"
  validate_public_origin
  if [[ "${loaded_env[AUTH_MODE]}" == oidc ]]; then
    require_any_loaded 'an OIDC issuer' \
      OIDC_AUTHWORKS_ISSUER OIDC_ZITADEL_ISSUER OIDC_ISSUER ZITADEL_ISSUER
    require_any_loaded 'an OIDC client ID' \
      OIDC_AUTHWORKS_CLIENT_ID OIDC_ZITADEL_CLIENT_ID OIDC_CLIENT_ID ZITADEL_CLIENT_ID
    require_any_loaded 'an OIDC organization ID' \
      OIDC_AUTHWORKS_ORGANIZATION_ID OIDC_AUTHWORKS_ALLOWED_ORGANIZATION_ID \
      OIDC_ZITADEL_ORGANIZATION_ID OIDC_ZITADEL_ALLOWED_ORGANIZATION_ID \
      OIDC_ORGANIZATION_ID OIDC_ALLOWED_ORGANIZATION_ID \
      ZITADEL_ORGANIZATION_ID ZITADEL_ALLOWED_ORGANIZATION_ID
    validate_provider_organization_mapping

    if [[ -n "${loaded_env[OIDC_AUTHWORKS_ISSUER]:-}" ||
      -n "${loaded_env[OIDC_AUTHWORKS_CLIENT_ID]:-}" ||
      -n "${loaded_env[OIDC_AUTHWORKS_CLIENT_SECRET]:-}" ||
      -n "${loaded_env[OIDC_AUTHWORKS_ORGANIZATION_ID]:-}" ||
      -n "${loaded_env[OIDC_AUTHWORKS_ALLOWED_ORGANIZATION_ID]:-}" ||
      -n "${loaded_env[OIDC_AUTHWORKS_CALLBACK_URL]:-}" ||
      -n "${loaded_env[OIDC_AUTHWORKS_REDIRECT_URI]:-}" ]]; then
      require_any_loaded 'the Authworks issuer' OIDC_AUTHWORKS_ISSUER OIDC_ISSUER
      require_any_loaded 'the Authworks client ID' OIDC_AUTHWORKS_CLIENT_ID OIDC_CLIENT_ID
      require_any_loaded 'the Authworks organization ID' \
        OIDC_AUTHWORKS_ORGANIZATION_ID OIDC_AUTHWORKS_ALLOWED_ORGANIZATION_ID \
        OIDC_ORGANIZATION_ID OIDC_ALLOWED_ORGANIZATION_ID
    fi

    if [[ -n "${loaded_env[OIDC_ZITADEL_ISSUER]:-}" ||
      -n "${loaded_env[OIDC_ZITADEL_CLIENT_ID]:-}" ||
      -n "${loaded_env[OIDC_ZITADEL_CLIENT_SECRET]:-}" ||
      -n "${loaded_env[OIDC_ZITADEL_ORGANIZATION_ID]:-}" ||
      -n "${loaded_env[OIDC_ZITADEL_ALLOWED_ORGANIZATION_ID]:-}" ||
      -n "${loaded_env[OIDC_ZITADEL_CALLBACK_URL]:-}" ||
      -n "${loaded_env[OIDC_ZITADEL_REDIRECT_URI]:-}" ]]; then
      require_any_loaded 'the Zitadel issuer' OIDC_ZITADEL_ISSUER ZITADEL_ISSUER
      require_any_loaded 'the Zitadel client ID' OIDC_ZITADEL_CLIENT_ID ZITADEL_CLIENT_ID
      require_any_loaded 'the Zitadel organization ID' \
        OIDC_ZITADEL_ORGANIZATION_ID OIDC_ZITADEL_ALLOWED_ORGANIZATION_ID \
        ZITADEL_ORGANIZATION_ID ZITADEL_ALLOWED_ORGANIZATION_ID \
        OIDC_ORGANIZATION_ID OIDC_ALLOWED_ORGANIZATION_ID
    fi
  fi
  load_env_file "$env_file"
}

systemctl_user() {
  command -v systemctl >/dev/null 2>&1 || fail 'systemctl is required'
  systemctl --user "$@"
}

curl_wait() {
  local service=$1 url=$2
  command -v curl >/dev/null 2>&1 || fail "curl is required to wait for $service"
  local timeout_seconds=${CODELINE_WAIT_TIMEOUT_SECONDS:-180}
  [[ "$timeout_seconds" =~ ^[1-9][0-9]*$ ]] || fail 'CODELINE_WAIT_TIMEOUT_SECONDS must be a positive integer'
  local deadline=$((SECONDS + timeout_seconds)) response http_code response_body remaining curl_timeout connect_timeout sleep_seconds
  local expected_response='{"database":"ready","service":"codeline","status":"ready"}'
  while (( SECONDS < deadline )); do
    remaining=$((deadline - SECONDS))
    curl_timeout=$remaining
    if (( curl_timeout > 5 )); then curl_timeout=5; fi
    connect_timeout=$curl_timeout
    if (( connect_timeout > 2 )); then connect_timeout=2; fi
    response=$(curl --connect-timeout "$connect_timeout" --max-time "$curl_timeout" --silent --show-error --write-out $'\n%{http_code}' "$url" 2>/dev/null) || response=
    if (( SECONDS >= deadline )); then break; fi
    http_code=${response##*$'\n'}
    response_body=${response%$'\n'*}
    if [[ "$http_code" == 200 && "$response_body" == "$expected_response" ]]; then exit 0; fi
    remaining=$((deadline - SECONDS))
    sleep_seconds=$remaining
    if (( sleep_seconds > 2 )); then sleep_seconds=2; fi
    sleep "$sleep_seconds"
  done
  fail "$service did not become available"
}

usage() {
  cat <<'EOF'
Usage: ops/dev/codeline-dev.sh <command> [args]

Commands:
  config            Validate SQLite and preview-origin configuration.
  db-reset          Reset the local SQLite database.
  db-reset-seed     Reset, migrate, and seed deterministic SQLite fixtures.
  down              Stop the managed development target, keeping data.
  help              Show this help.
  install           Install definitions only; never enables or starts them.
  logs [unit]       Show user-systemd logs for the target or one service.
  remove            Remove repository-managed user-unit links only.
  reset             Stop the target and reset, migrate, and seed SQLite.
  start             Start the managed development target.
  status            Show target and API status.
  stop              Stop the managed development target.
  up                Alias for start.
  validate          Validate environment without contacting a service.
  wait <service>    Wait for api.
EOF
}

case "${1:-help}" in
  config|validate)
    validate_environment
    printf 'codeline-dev: environment is valid\n'
    ;;
  db-reset)
    validate_database_environment
    project_roots_export
    (cd "$root" && bun run db:reset)
    ;;
  db-reset-seed)
    validate_database_environment
    project_roots_export
    (cd "$root" && bun run db:reset-seed)
    ;;
  down|stop)
    validate_environment
    systemctl_user stop "$target_unit"
    ;;
  help) usage ;;
  install) bash "$root/ops/dev/systemd/install.sh" install ;;
  logs)
    validate_environment
    unit=${2:-$target_unit}
    journalctl --user -u "$unit" --no-pager
    ;;
  remove) bash "$root/ops/dev/systemd/install.sh" remove ;;
  reset)
    validate_environment
    validate_database_environment
    project_roots_export
    (cd "$root" && bun run db:reset-seed)
    ;;
  start|up)
    validate_environment
    systemctl_user start "$target_unit"
    systemctl_user is-active --quiet "$target_unit"
    ;;
  status)
    validate_environment
    systemctl_user status "$target_unit" codeline-dev-api.service --no-pager
    ;;
  wait)
    service=${2:-}
    case "$service" in
      api)
        validate_environment
        curl_wait "$service" "http://127.0.0.1:${loaded_env[PORT]}/api/ready"
        ;;
      *) fail 'usage: ops/dev/codeline-dev.sh wait api' ;;
    esac
    ;;
  *) usage >&2; exit 2 ;;
esac
