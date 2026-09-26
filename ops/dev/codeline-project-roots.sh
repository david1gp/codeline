#!/usr/bin/env bash

codeline_project_roots_env_load() {
  local file=$1 line name value
  declare -gA codeline_project_roots_loaded_env
  codeline_project_roots_loaded_env=()
  [[ -f "$file" ]] || return 0

  while IFS= read -r line || [[ -n "$line" ]]; do
    line=${line%$'\r'}
    [[ "$line" =~ ^[[:space:]]*$ || "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" =~ ^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=(.*)$ ]] || {
      printf 'codeline-dev: invalid line in %s\n' "$file" >&2
      return 1
    }
    name=${BASH_REMATCH[2]}
    value=${BASH_REMATCH[3]}
    if [[ "$value" == \"*\" && "$value" == *\" ]]; then
      value=${value:1:${#value}-2}
    elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
      value=${value:1:${#value}-2}
    fi
    codeline_project_roots_loaded_env["$name"]=$value
  done < "$file"
}

codeline_project_roots_export() {
  local env_file=$1 defaults_file=$2 value
  if [[ ${CODELINE_PROJECT_ROOTS+x} ]]; then
    export CODELINE_PROJECT_ROOTS
    return 0
  fi

  codeline_project_roots_env_load "$env_file" || return
  if [[ ${codeline_project_roots_loaded_env[CODELINE_PROJECT_ROOTS]+x} ]]; then
    export "CODELINE_PROJECT_ROOTS=${codeline_project_roots_loaded_env[CODELINE_PROJECT_ROOTS]}"
    return 0
  fi

  [[ -f "$defaults_file" ]] || {
    printf 'codeline-dev: missing %s\n' "$defaults_file" >&2
    return 1
  }
  codeline_project_roots_env_load "$defaults_file" || return
  [[ ${codeline_project_roots_loaded_env[CODELINE_PROJECT_ROOTS]+x} ]] || {
    printf 'codeline-dev: CODELINE_PROJECT_ROOTS is required in %s\n' "$defaults_file" >&2
    return 1
  }
  value=${codeline_project_roots_loaded_env[CODELINE_PROJECT_ROOTS]}
  value=${value//\$\{HOME\}/$HOME}
  value=${value//\$HOME/$HOME}
  export "CODELINE_PROJECT_ROOTS=$value"
}
