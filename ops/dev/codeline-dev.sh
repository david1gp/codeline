#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
root=$(git -C "$script_dir/../.." rev-parse --show-toplevel)
compose_file="$root/ops/dev/compose.yaml"
env_file="$root/.env"

fail() {
  printf 'codeline-dev: %s\n' "$1" >&2
  exit 1
}

[[ -f "$env_file" ]] || fail "missing $env_file; copy .env.example to .env first"

load_env_file() {
  local line name value
  loaded_env=()
  while IFS= read -r line || [[ -n "$line" ]]; do
    line=${line%$'\r'}
    [[ "$line" =~ ^[[:space:]]*$ || "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" =~ ^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=(.*)$ ]] ||
      fail "invalid line in $env_file"
    name=${BASH_REMATCH[2]}
    value=${BASH_REMATCH[3]}
    if [[ "$value" == \"*\" && "$value" == *\" ]]; then
      value=${value:1:${#value}-2}
    elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
      value=${value:1:${#value}-2}
    fi
    export "$name=$value"
    loaded_env["$name"]=1
  done < "$env_file"
}

declare -A loaded_env
load_env_file
ZERO_CHECKOUT=${ZERO_CHECKOUT:-/home/david/opensource/zero}
export ZERO_CHECKOUT

required_env=(
  POSTGRES_DB
  POSTGRES_PASSWORD
  POSTGRES_PORT
  POSTGRES_USER
  DATABASE_URL
  ZITADEL_ORGANIZATION_ID
  PORT
  PUBLIC_ORIGIN
  UI_PORT
  VITE_ZERO_CACHE_URL
  VITE_ZERO_MUTATE_URL
  VITE_ZERO_QUERY_URL
  ZERO_ADMIN_PASSWORD
  ZERO_APP_ID
  ZERO_CHANGE_DB
  ZERO_CVR_DB
  ZERO_MUTATE_URL
  ZERO_PORT
  ZERO_REPLICA_FILE
  ZERO_QUERY_URL
  ZERO_UPSTREAM_DB
  CODEX_LB_API_TOKEN
  CLIPROXYAPI_API_KEY
)
for name in "${required_env[@]}"; do
  [[ "${loaded_env[$name]:-}" == 1 && -n "${!name:-}" ]] || fail "$name is required in .env"
done
[[ -d "$ZERO_CHECKOUT" ]] || fail "Zero checkout not found: $ZERO_CHECKOUT"

# Browser and cache must share PUBLIC_ORIGIN. Loopback query URLs break the
# Zero allowlist when the UI is reached through the HTTPS preview origin.
public_origin=${PUBLIC_ORIGIN%/}
[[ "$public_origin" == http://* || "$public_origin" == https://* ]] ||
  fail "PUBLIC_ORIGIN must be an absolute http(s) origin"
expected_zero_cache_url=$public_origin
expected_zero_query_url="$public_origin/api/query"
expected_zero_mutate_url="$public_origin/api/mutate"
require_matching_url() {
  local name=$1 expected=$2
  [[ "${!name}" == "$expected" ]] ||
    fail "$name must equal $expected (derived from PUBLIC_ORIGIN); do not point Zero query/mutate URLs at 127.0.0.1 while the UI uses the preview origin"
}
require_matching_url VITE_ZERO_CACHE_URL "$expected_zero_cache_url"
require_matching_url VITE_ZERO_QUERY_URL "$expected_zero_query_url"
require_matching_url VITE_ZERO_MUTATE_URL "$expected_zero_mutate_url"
require_matching_url ZERO_QUERY_URL "$expected_zero_query_url"
require_matching_url ZERO_MUTATE_URL "$expected_zero_mutate_url"
export VITE_ZERO_CACHE_URL VITE_ZERO_QUERY_URL VITE_ZERO_MUTATE_URL ZERO_QUERY_URL ZERO_MUTATE_URL

compose() {
  command -v podman >/dev/null 2>&1 || fail "podman is required"
  # Use the user's configured rootless defaults; Codeline must not create custom roots.
  podman compose -f "$compose_file" "$@"
}

usage() {
  cat <<'EOF'
Usage: ops/dev/codeline-dev.sh <command> [args]

Commands:
  build             Build the local Zero image from the sibling checkout; does not start containers.
  clean             Recreate local containers and volumes, restart the managed target, and seed example data.
  config            Resolve Compose configuration without printing it.
  down              Stop and remove containers, keeping named volumes.
  help              Show this help.
  logs [service...] Show service logs; extra arguments pass to Compose.
  migrate           Apply committed Drizzle migrations to local Postgres.
  link-zero         Build and link the pinned local Zero package into Codeline.
  reset             Remove containers and named volumes, deleting local service data.
  reset-zero-cache  Remove only the managed Zero Cache container and replica volume.
  start             Start existing containers without recreating them.
  status            Show container status.
  stop              Stop containers without removing them.
  up                Start the local services in detached mode.
  wait              Wait for a service health check to pass.
  verify-zero       Verify the linked local Zero package.
EOF
}

case "${1:-help}" in
  build) compose build zero-cache ;;
  clean)
    command -v systemctl >/dev/null 2>&1 || fail "systemctl is required for clean"
    systemctl --user cat codeline-dev.target >/dev/null 2>&1 ||
      fail "codeline-dev.target is not installed; run ops/dev/systemd/codeline-dev-systemd.sh install first"
    systemctl --user stop codeline-dev.target codeline-dev-postgres.service 2>/dev/null || true
    compose down --remove-orphans --volumes
    systemctl --user start codeline-dev-postgres.service
    (cd "$root" && bun run db:seed)
    systemctl --user start codeline-dev.target
    ;;
  config) compose config --quiet ;;
  down) compose down --remove-orphans ;;
  help) usage ;;
  logs)
    shift
    compose logs "$@"
    ;;
  migrate) (cd "$root" && bun run db:migrate) ;;
  link-zero)
    bash "$root/ops/dev/zero-link.sh" setup
    ;;
  reset) compose down --remove-orphans --volumes ;;
  reset-zero-cache)
    container_id=$(compose ps -aq zero-cache 2>/dev/null || true)
    if [[ -n "$container_id" ]]; then
      podman rm --force "$container_id" >/dev/null
    fi
    podman volume rm codeline-dev-zero >/dev/null 2>&1 || true
    ;;
  start)
    shift
    compose start "$@"
    ;;
  status) compose ps ;;
  stop)
    shift
    compose stop "$@"
    ;;
  up)
    shift
    compose up -d "$@"
    ;;
  wait)
    service=${2:-}
    if [[ "$service" == api ]]; then
      command -v curl >/dev/null 2>&1 || fail "curl is required to wait for $service"
      url="http://127.0.0.1:${PORT:-6001}/api/ready"
      deadline=$((SECONDS + 180))
      while (( SECONDS < deadline )); do
        if curl --fail --silent --show-error "$url" >/dev/null 2>&1; then
          exit 0
        fi
        sleep 2
      done
      fail "$service did not become available"
    fi
    if [[ "$service" == ui ]]; then
      command -v curl >/dev/null 2>&1 || fail "curl is required to wait for $service"
      url="http://127.0.0.1:${UI_PORT:-6000}/"
      deadline=$((SECONDS + 180))
      while (( SECONDS < deadline )); do
        if curl --fail --silent --show-error "$url" >/dev/null 2>&1; then
          exit 0
        fi
        sleep 2
      done
      fail "$service did not become available"
    fi
    [[ "$service" == postgres || "$service" == zero-cache ]] || fail "usage: $0 wait {postgres|zero-cache|api|ui}"
    deadline=$((SECONDS + 180))
    while (( SECONDS < deadline )); do
      container_id=$(compose ps -q "$service" 2>/dev/null || true)
      if [[ -z "$container_id" ]]; then
        sleep 2
        continue
      fi
      read -r container_state health_state < <(
        podman inspect "$container_id" --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}'
      )
      if [[ "$health_state" == healthy ]]; then
        exit 0
      fi
      if [[ "$container_state" == exited || "$container_state" == dead || "$health_state" == unhealthy ]]; then
        fail "$service health check failed"
      fi
      sleep 2
    done
    fail "$service did not become healthy"
    ;;
  verify-zero) bash "$root/ops/dev/zero-link.sh" verify ;;
  *) usage >&2; exit 2 ;;
esac
