# app-suite

npm-workspaces monorepo of small self-hosted apps (`apps/fartlek`, `kvitt`, `etapp`, `portfolio`, `brygga`, `garden` (Autarki)) sharing `packages/ui`, `packages/i18n` and `packages/server-kit`.

- Layout, dev ports, shipping and deploy: [README.md](README.md).
- Conventions and how to add an app (sign-in, demo mode, push): [CONTRIBUTING.md](CONTRIBUTING.md).
- Decisions, reasons and open questions: [docs/index.md](docs/index.md) (generated, never hand-edited). Open only the pages you need; how to read and write the wiki is in [docs/CLAUDE.md](docs/CLAUDE.md). When a session settles something, file it there, add a log entry and run `npm run docs:index`.

Run `npm run check` (typecheck, lint, tests, docs check) before committing.

Detailed rules live in [.claude/rules/](.claude/rules/); the ones scoped to a path load only when you work on those files.
