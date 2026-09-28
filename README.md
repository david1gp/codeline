# Codeline

Codeline is an AI coding workspace for keeping your projects, conversations, and work in progress together. Choose from the providers, agents, and models configured for your workspace, then work through coding tasks with activity and conversation history close at hand.

## What you can do

- Work with configured AI providers and agents, and choose an available model.
- Keep conversations organized by project, with sessions you can revisit, branch, or pin.
- Follow session activity as it happens.
- Browse project files and view read-only previews, including Markdown.
- Use a responsive workspace designed for different screen sizes.

## How to use Codeline

1. Choose a project and one of its configured agents.
2. Select an available model and start a conversation.
3. Follow the session activity as you work.
4. Return to saved sessions when you want to pick up where you left off.

Want to explore the interface? The [demo showcase](https://codeline.work/demo) uses example states; it is not a live AI session.

## Command-line interface

The Bun-based `codeline` CLI supports one-shot prompts and interactive conversations from a checkout of this repository, with Bun 1.3 or newer. Install dependencies in the checkout and run:

```sh
bun install
bun run src/cli/main.ts run "Explain this project"
bun run src/cli/main.ts chat
```

Local in-process execution is the default; it does not start a server. For configuration, project/session behavior, remote use, and themes, see the [CLI guide](./docs/cli.md).

The `codeline` package bin points to TypeScript source and is not a separately compiled CLI distribution; the instructions here support use from the checkout, not a global package install.

## Links

- [Codeline website](http://codeline.work/)
- [Source code](https://github.com/david1gp/codeline)
- [Report an issue](https://github.com/david1gp/codeline/issues)

## License

[MIT](./LICENSE)
