#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
root=$(git -C "$script_dir/../.." rev-parse --show-toplevel)
env_file="$root/.env"
docker_env_file="$root/ops/dev/convex/.env.docker"
target_unit=codeline-dev.target

fail() {
  printf 'codeline-dev: %s\n' "$1" >&2
  exit 1
}

[[ -f "$env_file" ]] || fail "missing $env_file; copy .env.example to .env first"
[[ -f "$docker_env_file" ]] || fail "missing $docker_env_file; copy ops/dev/convex/env.docker.example first"

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

validate_public_origin() {
  local public_origin=${loaded_env[PUBLIC_ORIGIN]%/}
  [[ "$public_origin" =~ ^https?://[^/]+$ ]] || fail "PUBLIC_ORIGIN must be an absolute origin without a path"
  [[ "$public_origin" == https://preview.codeline.work ]] ||
    fail "PUBLIC_ORIGIN must equal https://preview.codeline.work for the managed preview stack"

  local scheme=${public_origin%%://*}
  local host=${public_origin#*://}
  local expected_convex_url="$scheme://convex.$host"
  local expected_site_url="$scheme://api.$host"

  [[ "${loaded_env[VITE_CONVEX_URL]}" == "$expected_convex_url" ]] ||
    fail "VITE_CONVEX_URL must equal $expected_convex_url (the preview Convex route)"
  [[ "${loaded_env[CONVEX_SELF_HOSTED_URL]}" == "$expected_convex_url" ]] ||
    fail "CONVEX_SELF_HOSTED_URL must equal $expected_convex_url (the preview Convex route)"

  load_env_file "$docker_env_file"
  local name
  for name in CONVEX_CLOUD_ORIGIN CONVEX_SITE_ORIGIN NEXT_PUBLIC_DEPLOYMENT_URL INSTANCE_NAME INSTANCE_SECRET DISABLE_BEACON; do
    require_loaded "$name" "$docker_env_file"
  done
  [[ "${loaded_env[CONVEX_CLOUD_ORIGIN]}" == "$expected_convex_url" ]] ||
    fail "CONVEX_CLOUD_ORIGIN must equal $expected_convex_url (the preview Convex route)"
  [[ "${loaded_env[NEXT_PUBLIC_DEPLOYMENT_URL]}" == "$expected_convex_url" ]] ||
    fail "NEXT_PUBLIC_DEPLOYMENT_URL must equal $expected_convex_url (the preview Convex route)"
  [[ "${loaded_env[CONVEX_SITE_ORIGIN]}" == "$expected_site_url" ]] ||
    fail "CONVEX_SITE_ORIGIN must equal $expected_site_url (the preview Convex API route)"
  [[ "${loaded_env[INSTANCE_SECRET]}" =~ ^[[:xdigit:]]{64}$ ]] ||
    fail "INSTANCE_SECRET must contain exactly 64 hexadecimal characters"
  [[ "${loaded_env[DISABLE_BEACON]}" == true ]] || fail "DISABLE_BEACON must be true for local development"
}

validate_environment() {
  load_env_file "$env_file"
  local name
  for name in NODE_ENV AUTH_MODE HOST PORT PUBLIC_ORIGIN UI_PORT VITE_CONVEX_URL CONVEX_SELF_HOSTED_URL CONVEX_SELF_HOSTED_ADMIN_KEY; do
    require_loaded "$name" "$env_file"
  done
  [[ "${loaded_env[NODE_ENV]}" == development ]] || fail "NODE_ENV must be development"
  [[ "${loaded_env[PORT]}" == 6001 ]] || fail "PORT must equal 6001 for the managed preview stack"
  [[ "${loaded_env[UI_PORT]}" == 6000 ]] || fail "UI_PORT must equal 6000 for the managed preview stack"
  [[ "${loaded_env[CONVEX_SELF_HOSTED_ADMIN_KEY]}" != replace-with-* ]] ||
    fail "CONVEX_SELF_HOSTED_ADMIN_KEY must be replaced in $env_file"
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
  config            Validate Convex deployment and preview-origin configuration.
  down              Stop the managed Convex-only target, keeping data.
  help              Show this help.
  install           Install definitions only; never enables or starts them.
  logs [unit]       Show user-systemd logs for the target or one service.
  remove            Remove repository-managed user-unit links only.
  reset             Stop the target and delete the persistent Convex volume.
  start             Start the managed Convex-only target.
  status            Show target, Convex, API, and UI service status.
  stop              Stop the managed Convex-only target.
  up                Alias for start.
  validate          Validate environment without contacting a service.
  wait <service>    Wait for convex-backend, convex-dashboard, api, or ui.
EOF
}

case "${1:-help}" in
  config|validate)
    validate_environment
    printf 'codeline-dev: environment is valid\n'
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
    systemctl_user stop "$target_unit" 2>/dev/null || true
    command -v podman >/dev/null 2>&1 || fail 'podman is required to reset Convex data'
    podman volume rm --force codeline-convex-data >/dev/null 2>&1 || true
    ;;
  start|up)
    validate_environment
    systemctl_user start "$target_unit"
    ;;
  status)
    validate_environment
    systemctl_user status "$target_unit" codeline-convex-backend.service codeline-convex-dashboard.service \
      codeline-convex-dev.service codeline-dev-api.service codeline-dev-ui.service --no-pager
    ;;
  wait)
    validate_environment
    service=${2:-}
    case "$service" in
      convex-backend) curl_wait "$service" http://127.0.0.1:3210/version ;;
      convex-dashboard) curl_wait "$service" http://127.0.0.1:6791/ ;;
      api) curl_wait "$service" "http://127.0.0.1:${loaded_env[PORT]}/api/ready" ;;
      ui) curl_wait "$service" "http://127.0.0.1:${loaded_env[UI_PORT]}/" ;;
      *) fail 'usage: ops/dev/codeline-dev.sh wait {convex-backend|convex-dashboard|api|ui}' ;;
    esac
    ;;
  *) usage >&2; exit 2 ;;
esac
