#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
managed_checkout_path="$script_dir/.."

fail() {
  printf 'codeline-deploy: %s\n' "$1" >&2
  exit 1
}

command -v realpath >/dev/null 2>&1 || fail 'realpath is required'
command -v flock >/dev/null 2>&1 || fail 'flock is required'

root=$(git -C "$script_dir/.." rev-parse --show-toplevel)
root=$(realpath -- "$root")
managed_checkout=$(realpath -- "$managed_checkout_path") ||
  fail "managed checkout does not exist: $managed_checkout_path"
managed_git_root=$(git -C "$managed_checkout" rev-parse --show-toplevel) ||
  fail "managed checkout is not a Git checkout: $managed_checkout"
managed_git_root=$(realpath -- "$managed_git_root")
[[ "$root" == "$managed_checkout" && "$root" == "$managed_git_root" ]] ||
  fail "deploy checkout $root does not match the managed checkout $managed_checkout"

live_dist="$root/dist"

exec 9>"$root/.codeline-deploy.lock"
flock -n 9 || fail 'another deployment is already running'

echo "Validating the managed Codeline runtime configuration before stopping the service."
if ! bash "$root/ops/dev/codeline-dev.sh" validate; then
  fail 'managed runtime configuration validation failed; the service and live build were not changed'
fi

work_dir=$(mktemp -d "$root/.codeline-deploy.XXXXXX")
stage_dist="$work_dir/dist"
backup_dist="$work_dir/previous-dist"
failed_dist="$work_dir/failed-dist"
cleanup_work_dir=true
swap_started=false
swap_restored=false
failed_build_removed=false
target_stop_started=false
recovery_needed=false
prior_build_present=false
rollback_result=failed
rollback_stop_failed=false

path_exists() {
  [[ -e "$1" || -L "$1" ]]
}

if path_exists "$live_dist"; then
  prior_build_present=true
fi

rollback_deployment() {
  local recovery_ok=true
  local target_stopped=false

  if [[ "$target_stop_started" == true ]]; then
    if bash "$root/ops/dev/codeline-dev.sh" stop; then
      target_stopped=true
    else
      rollback_stop_failed=true
      recovery_ok=false
      printf 'codeline-deploy: could not stop the managed target for rollback; filesystem restoration was not attempted\n' >&2
    fi
  fi

  if [[ "$target_stopped" != true ]]; then recovery_ok=false; fi

  if [[ "$recovery_ok" == true && "$prior_build_present" == true ]]; then
    if path_exists "$backup_dist"; then
      if path_exists "$live_dist"; then
        if path_exists "$failed_dist" || ! mv -- "$live_dist" "$failed_dist"; then
          recovery_ok=false
        fi
      fi
      if ! path_exists "$live_dist"; then
        if ! mv -- "$backup_dist" "$live_dist"; then recovery_ok=false; fi
      fi
    elif [[ "$swap_started" == true && "$swap_restored" != true ]]; then
      recovery_ok=false
    fi

    if [[ "$swap_started" == true && "$recovery_ok" == true ]]; then
      if ! bash "$root/ops/dev/codeline-dev.sh" start ||
        ! bash "$root/ops/dev/codeline-dev.sh" wait api; then
        recovery_ok=false
      fi
    fi
  elif [[ "$recovery_ok" == true && "$prior_build_present" != true && "$swap_started" == true ]] &&
    path_exists "$live_dist"; then
    if rm -rf -- "$live_dist"; then
      failed_build_removed=true
    else
      recovery_ok=false
    fi
  fi

  if [[ "$recovery_ok" == true ]]; then
    if [[ "$prior_build_present" == true ]]; then
      if [[ "$swap_started" == true ]]; then
        rollback_result=restored
      else
        rollback_result=stopped-unchanged
      fi
    else
      if [[ "$failed_build_removed" == true ]]; then
        rollback_result=no-prior-build
      else
        rollback_result=stopped-unchanged
      fi
    fi
    recovery_needed=false
    return 0
  fi

  cleanup_work_dir=false
  return 1
}

cleanup() {
  local exit_code=$?
  trap - EXIT
  trap '' INT TERM HUP
  if [[ "$recovery_needed" == true ]]; then
    if rollback_deployment; then
      case "$rollback_result" in
        restored)
          printf 'codeline-deploy: the prior build was restored and the managed target is ready again\n' >&2
          ;;
        no-prior-build)
          printf 'codeline-deploy: deployment failed with no prior build; the failed build was removed and the managed target is confirmed stopped\n' >&2
          ;;
        stopped-unchanged)
          printf 'codeline-deploy: deployment failed before the build was swapped; the live build was not changed and the managed target is confirmed stopped\n' >&2
          ;;
      esac
    else
      if [[ "$rollback_stop_failed" == true ]]; then
        printf 'codeline-deploy: rollback failed because the managed target could not be stopped; the live build and service state are not confirmed\n' >&2
      else
        printf 'codeline-deploy: rollback failed; the prior build or managed target is not confirmed healthy\n' >&2
      fi
      exit_code=1
    fi
  fi
  if [[ "$cleanup_work_dir" == true && -d "$work_dir" ]]; then rm -rf -- "$work_dir"; fi
  exit "$exit_code"
}
trap cleanup EXIT

handle_signal() {
  local signal=$1
  local exit_code
  case "$signal" in
    INT) exit_code=130 ;;
    TERM) exit_code=143 ;;
    HUP) exit_code=129 ;;
  esac
  printf 'codeline-deploy: received %s; handling deployment recovery\n' "$signal" >&2
  exit "$exit_code"
}
trap 'handle_signal INT' INT
trap 'handle_signal TERM' TERM
trap 'handle_signal HUP' HUP

echo "Building the Codeline combined preview server in a staging directory."
if ! (cd "$managed_checkout" && CODELINE_BUILD_DIR="$stage_dist" bun run build); then
  fail 'build failed; the managed service and live build were not changed'
fi
[[ -f "$stage_dist/server/index.js" ]] || fail 'build did not produce dist/server/index.js'
[[ -f "$stage_dist/ui/index.html" ]] || fail 'build did not produce dist/ui/index.html'

echo "Stopping the managed Codeline target before swapping build output."
target_stop_started=true
recovery_needed=true
if ! bash "$root/ops/dev/codeline-dev.sh" stop; then
  fail 'could not stop the managed Codeline target; the deployment was not swapped'
fi

swap_dist() {
  swap_started=true
  if [[ -e "$live_dist" || -L "$live_dist" ]]; then
    if ! mv -- "$live_dist" "$backup_dist"; then return 1; fi
  fi
  if mv -- "$stage_dist" "$live_dist"; then
    return 0
  fi
  if path_exists "$backup_dist" && ! path_exists "$live_dist" && mv -- "$backup_dist" "$live_dist"; then
    swap_restored=true
  fi
  return 1
}

target_start_ready() {
  bash "$root/ops/dev/codeline-dev.sh" start && bash "$root/ops/dev/codeline-dev.sh" wait api
}

if ! swap_dist; then
  fail 'could not install the staged build; attempting guarded deployment recovery'
fi

echo "Starting the managed Codeline target."
if target_start_ready; then
  recovery_needed=false
  echo "Codeline combined preview server is ready."
  exit 0
fi

fail 'the new build did not become ready; attempting guarded deployment recovery'
