#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
root=$(git -C "$script_dir/../.." rev-parse --show-toplevel)
env_file="$root/.env"
target_unit=codeline-dev.target

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

validate_database_environment() {
  load_env_file "$env_file"
  local name
  for name in NODE_ENV CONFIG_STORE_DIR ZITADEL_ORGANIZATION_ID; do
    require_loaded "$name" "$env_file"
  done
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
  for name in NODE_ENV AUTH_MODE HOST PORT PUBLIC_ORIGIN UI_PORT; do
    require_loaded "$name" "$env_file"
  done
  [[ "${loaded_env[NODE_ENV]}" == development ]] || fail "NODE_ENV must be development"
  [[ "${loaded_env[PORT]}" == 6001 ]] || fail "PORT must equal 6001 for the managed preview stack"
  [[ "${loaded_env[UI_PORT]}" == 6000 ]] || fail "UI_PORT must equal 6000 for the managed preview stack"
  validate_public_origin
  load_env_file "$env_file"
}

systemctl_user() {
  command -v systemctl >/dev/null 2>&1 || fail 'systemctl is required'
  systemctl --user "$@"
}

curl_wait() {
  local service=$1 url=$2
  command -v curl >/dev/null 2>&1 || fail "curl is required to wait for $service"
  local deadline=$((SECONDS + 180))
  while (( SECONDS < deadline )); do
    if curl --fail --silent --show-error "$url" >/dev/null 2>&1; then exit 0; fi
    sleep 2
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
  status            Show target, API, and UI status.
  stop              Stop the managed development target.
  up                Alias for start.
  validate          Validate environment without contacting a service.
  wait <service>    Wait for api or ui.
EOF
}

case "${1:-help}" in
  config|validate)
    validate_environment
    printf 'codeline-dev: environment is valid\n'
    ;;
  db-reset)
    validate_database_environment
    (cd "$root" && bun run db:reset)
    ;;
  db-reset-seed)
    validate_database_environment
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
    (cd "$root" && bun run db:reset-seed)
    ;;
  start|up)
    validate_environment
    systemctl_user start "$target_unit"
    ;;
  status)
    validate_environment
    systemctl_user status "$target_unit" codeline-dev-api.service codeline-dev-ui.service --no-pager
    ;;
  wait)
    service=${2:-}
    case "$service" in
      api|ui)
        validate_environment
        case "$service" in
          api) curl_wait "$service" "http://127.0.0.1:${loaded_env[PORT]}/api/ready" ;;
          ui) curl_wait "$service" "http://127.0.0.1:${loaded_env[UI_PORT]}/" ;;
        esac
        ;;
      *) fail 'usage: ops/dev/codeline-dev.sh wait {api|ui}' ;;
    esac
    ;;
  *) usage >&2; exit 2 ;;
esac
