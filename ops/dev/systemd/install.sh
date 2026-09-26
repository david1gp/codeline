#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
root=$(git -C "$script_dir/../.." rev-parse --show-toplevel)
config_dir=${XDG_CONFIG_HOME:-$HOME/.config}
unit_dir="$config_dir/systemd/user"
stable_checkout="$HOME/adaptive/codeline"

fail() {
  printf 'codeline-dev-systemd: %s\n' "$1" >&2
  exit 1
}

command -v systemctl >/dev/null 2>&1 || fail 'systemctl is required'

remove_stale_ui_link() {
  local unit=codeline-dev-ui.service state enabled_state

  state=$(unit_active_state_read "$unit")
  case "$state" in
    active) systemctl --user stop "$unit" ;;
    failed) systemctl --user reset-failed "$unit" ;;
  esac

  state=$(unit_active_state_read "$unit")
  case "$state" in
    inactive|absent) ;;
    *) fail "refusing to unlink $unit while its state is $state" ;;
  esac

  enabled_state=$(unit_enabled_state_read "$unit")
  if [[ "$enabled_state" == enabled ]]; then
    systemctl --user disable "$unit"
  fi

  state=$(unit_active_state_read "$unit")
  case "$state" in
    inactive|absent) rm -f "$unit_dir/$unit" ;;
    *) fail "refusing to unlink $unit while its state is $state" ;;
  esac
}

unit_active_state_read() {
  local unit=$1 output load_state= active_state= property value
  if ! output=$(systemctl --user show "$unit" --property=LoadState --property=ActiveState 2>/dev/null); then
    fail "unable to query the state of $unit"
  fi

  while IFS='=' read -r property value; do
    case "$property" in
      LoadState) load_state=$value ;;
      ActiveState) active_state=$value ;;
    esac
  done <<< "$output"

  case "$load_state:$active_state" in
    not-found:inactive) printf 'absent\n' ;;
    loaded:inactive) printf 'inactive\n' ;;
    loaded:failed) printf 'failed\n' ;;
    loaded:active|loaded:reloading|loaded:activating|loaded:deactivating) printf 'active\n' ;;
    *) fail "unable to determine a safe state for $unit" ;;
  esac
}

unit_enabled_state_read() {
  local unit=$1 output
  output=$(systemctl --user is-enabled "$unit" 2>/dev/null) || true
  case "$output" in
    enabled|enabled-runtime) printf 'enabled\n' ;;
    disabled|disabled-runtime|indirect|linked|linked-runtime|alias|static|masked|masked-runtime|generated|transient|not-found)
      printf 'not-enabled\n'
      ;;
    *) fail "unable to query whether $unit is enabled" ;;
  esac
}

install_units() {
  local unit
  if [[ "$root" != "$stable_checkout" ]]; then
    ln -sfn "$root" "$stable_checkout"
    printf 'linked %s -> %s\n' "$stable_checkout" "$root"
  fi

  mkdir -p "$unit_dir"
  # Remove the stale link from the former managed Vite runtime.
  remove_stale_ui_link

  for unit in codeline-dev-api.service codeline-dev.target; do
    ln -sf "$script_dir/$unit" "$unit_dir/$unit"
    printf 'linked %s\n' "$unit"
  done

  # Preparation only: do not enable or start any unit here. The managed
  # lifecycle wrapper starts codeline-dev.target after the environment is
  # validated.
  systemctl --user daemon-reload
}

remove_units() {
  local unit
  for unit in codeline-dev-api.service codeline-dev.target; do
    rm -f "$unit_dir/$unit"
  done
  remove_stale_ui_link
  systemctl --user daemon-reload
}

case "${1:-help}" in
  install) install_units ;;
  remove|uninstall) remove_units ;;
  help)
    printf 'Usage: ops/dev/systemd/install.sh {install|remove|help}\n'
    ;;
  *) fail "unknown command: $1" ;;
esac
