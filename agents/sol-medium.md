---
description: complex UI design/styling work
mode: subagent
model: codex-lb/gpt-5.6-sol
variant: medium
permission:
  task:
    "*": deny
    explore: allow
    browser: allow
tools:
  read: true
  write: true
  edit: true
---

## tools

- use `bun` instead of `npm`
- use `magick` for image manipulation
- use `yt-dlp` to download videos/audio/transcripts
- use `rg` or `fd` instead of `find` -> or better use the `explore` subagent
- git: we work exclusivly on `main` branch, do not create other branches

## dev

a dev/preview server is running as a systemd user service for each project defined in `ops` folder
this service should be used to test and no other/new dev servers should be started in parallel
check logs for errors or restart it proactively
served from caddy via `caddy-projects` cli

## assets

use `./videos`, `./images`, `./fonts` dirs for assets,
`./public` base folder path for svg files,
run `bun run assets:process` on updates,
load `assets-info` for more info on demand

## opensource

external/open-source projects reside in `~/opensource` for questions/behavior lookup, 
a github project in question should git cloned and searched there 
instead of trying to fetch github code raw via http fetches
