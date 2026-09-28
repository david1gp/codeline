# Codeline CLI

The CLI runs on Bun 1.3 or newer and is supported from a Codeline checkout. Install that checkout's dependencies and invoke its source entry directly:

```sh
bun install
bun run src/cli/main.ts --help
```

`package.json` declares `codeline` as a bin pointing to `src/cli/main.ts`. This is a Bun/TypeScript source entry, not a separately compiled CLI distribution; the supported install/use instructions here are checkout-only, not a global package install.

## Commands

`chat` is the default command and opens an interactive conversation. `run` sends one prompt and writes the assistant's appended response to stdout (without adding a final newline):

```sh
bun run src/cli/main.ts chat
bun run src/cli/main.ts run "Summarize the current project"
bun run src/cli/main.ts run "Continue that explanation" --session SESSION_ID
```

Both commands accept `--backend local|URL`, `--session ID`, `--project VALUE`, and `--theme NAME_OR_PATH`. Flags override corresponding config values. With no backend configured or specified, the CLI uses local in-process execution; it neither listens on a port nor starts the development preview server.

For local execution, `--project` is a project directory (relative paths resolve from the current working directory); without it, the current working directory is the project. Local projects must be within `CODELINE_PROJECT_ROOTS`, a JSON array of allowed root directories; if unset, the user's home directory is the only root. Local data, including its SQLite database, is kept under `${XDG_DATA_HOME:-$HOME/.local/share}/codeline`.

Local target selection provisions the first catalog agent marked `mode: primary` that is enabled, has an enabled compiled model and provider, and has a non-empty value in the environment variable named by that provider model's `apiKey`. If none qualifies, no local primary target is provisioned; the CLI does not create credentials. For checked-in examples, see the [build primary agent](../agents/build.md), [delegate primary agent](../agents/delegate.md), the enabled [codex-lb GPT 5.6 Luna model](../providers/codex-lb/gpt-5.6-luna.yml) (which references `CODEX_LB_API_TOKEN`), and the credential variable names in [`.env.example`](../.env.example). The [provider and agent catalog guide](./20260815_provider_agent_catalogs.md) describes these catalog files. Keep actual credential values out of documentation and source control.

For a server backend, `--project` is a server project ID, not a local path; server defaults and project authorization belong to that server. Omit `--project` to let the server choose its default for a new session. Use `--session` to continue an existing session. The CLI first applies each flag over its matching config value, then rejects the effective options if both `session` and `project` are set. Thus a flag can introduce a conflict with the other value left in config; config values are not discarded just because a different option was supplied on the command line.

## Settings and isolated data

The optional JSON settings file is `${XDG_CONFIG_HOME:-$HOME/.config}/codeline/config.json`. `XDG_CONFIG_HOME` and `HOME` are used only when absolute paths; otherwise the CLI falls back to the absolute home directory and its `.config` directory. The strict JSON object accepts only these optional, non-empty string settings (except the backend alternatives):

```json
{
  "backend": "local",
  "session": "SESSION_ID",
  "project": "PROJECT_PATH_OR_SERVER_ID",
  "theme": "dark"
}
```

`backend` must be `"local"` or a valid server URL. The effective precedence is command-line flag, then config file, then the built-in `local` backend default. The session token is never read from config. Missing config is equivalent to an empty object; malformed JSON, unknown keys, or invalid values fail rather than being ignored.

To keep both settings and local database data separate for a run, set absolute XDG directories before invocation. The project still defaults to the process's current working directory:

```sh
export XDG_CONFIG_HOME="$HOME/.config/codeline-sandbox"
export XDG_DATA_HOME="$HOME/.local/share/codeline-sandbox"
bun run src/cli/main.ts run "Inspect this project" --project .
```

The local project path is canonicalized and checked against the allowed roots. A relative `CODELINE_PROJECT_ROOTS` entry is resolved from the current working directory; use absolute paths for predictable root configuration.

## Remote server and temporary authentication

Choose a Codeline server explicitly with `--backend` or the config setting. Remote requests require `CODELINE_SESSION_TOKEN` in the process environment. It is the opaque identity-session cookie value used by the existing application—not a JWT or bearer token. The CLI has no login flow, token flag, or token persistence; it sends the value as cookie authentication and redacts it from CLI error output. Do not save it in config, shell history, scripts, or examples. Supply it temporarily through a protected prompt/environment mechanism, then unset it:

```sh
read -rsp 'Codeline session cookie: ' CODELINE_SESSION_TOKEN
printf '\n'
export CODELINE_SESSION_TOKEN
bun run src/cli/main.ts run "Summarize this project" --backend https://codeline.example
unset CODELINE_SESSION_TOKEN
```

For a new remote session, optionally pass `--project PROJECT_ID`; for an existing one, pass `--session SESSION_ID` instead. The server owns project resolution, authorization, and execution defaults. Never pass the session cookie as a command argument.

## Terminal themes

Interactive chat defaults to the built-in `dark` Pi-compatible theme; `light` is also bundled. `--theme` or the `theme` config key accepts a name, or an explicit JSON path (absolute paths, paths containing `/`, and names ending in `.json` are explicit paths). Named themes are searched in this order:

1. `${XDG_CONFIG_HOME:-$HOME/.config}/codeline/themes/NAME.json`
2. `${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/themes/NAME.json`
3. `./.pi/themes/NAME.json` under the current working directory
4. The bundled `dark` and `light` themes, if the requested name matches and no matching file was found above

Set `PI_CODING_AGENT_DIR` to an absolute path for predictable lookup. Unlike `XDG_CONFIG_HOME`, a relative value is used as-is rather than resolved against the home directory. A theme file with the same name in an earlier location takes precedence over a bundled theme.

Theme files use Pi coding-agent theme JSON, including color values and variable references. For example, with `./.pi/themes/ocean.json` present:

```sh
bun run src/cli/main.ts chat --theme ocean
```
