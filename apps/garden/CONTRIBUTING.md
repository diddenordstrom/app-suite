# Contributing to Autarki

Thanks for your interest in contributing! This project has a few non-negotiables. Read this before opening a PR.

## The Three Rules

1. **Gitmoji commit messages** — every commit starts with one Unicode emoji
2. **Linear git history** — no merge commits on `main`
3. **High test coverage** — 80% floor in CI, aim for ~100%

## 1. Gitmoji Commit Messages

**This is the most important rule.** Every commit message must start with exactly one [gitmoji](https://gitmoji.dev/) emoji, followed by a short lowercase description.

**Use the actual Unicode emoji character** — never the markdown shortcode form (`:sparkles:`, `:rocket:`, etc.).

```bash
# Good
✨ add succession-planting suggestions
🐛 fix harvest date off-by-one in zone 3
📝 document homelab deployment

# Bad
:sparkles: add succession-planting suggestions    # markdown code, not emoji
add succession-planting suggestions               # no emoji
✨ Add Succession-Planting Suggestions            # capitalised
```

### Common emoji

| Emoji | When to use            |
| ----- | ---------------------- |
| ✨    | New feature            |
| 🐛    | Bug fix                |
| 📝    | Documentation          |
| ♻️    | Refactor               |
| ✅    | Tests                  |
| 💄    | UI / style             |
| 🔧    | Configuration          |
| ⬆️    | Dependency upgrade     |
| 🔥    | Removing code or files |
| 🚨    | Linter fixes           |
| 🗃️    | Database changes       |
| 🌱    | Seed data              |
| 💚    | CI fixes               |

If none of these fit, pick the closest match from <https://gitmoji.dev/>.

### Format

```
<emoji> <short, lowercase description>
```

- Keep the subject line under 72 characters
- Lowercase after the emoji (proper nouns excepted)
- Focus on the _what_ and _why_, not the _how_

## 2. Linear Git History

`main` has a linear history. No merge commits.

- **Rebase, don't merge.** Keep your branch up to date with `git rebase main`, not `git merge main`.
- **Squash or rebase your PR before merge.** GitHub's "Rebase and merge" or "Squash and merge" — never "Create a merge commit".
- If you see a merge commit appear in your branch, fix it before requesting review.

```bash
# Good — rebase your branch onto latest main
git fetch origin
git rebase origin/main

# Bad — creates a merge commit
git merge origin/main
```

## 3. Test Coverage

Test-driven development is mandatory: **Red → Green → Refactor**. No production code without a failing test driving it — this applies to bug fixes, features, and refactors alike.

- CI enforces an **80% floor** on lines, functions, branches, and statements via `npm run test:coverage -w apps/garden`. Falling under fails the build.
- Treat 80% as the floor, not the goal. Aim for ~100% on every layer we own.
- Every code path that throws an error must have a test covering it.

### Where tests live

- **Unit tests** — colocated next to the source: `foo.ts` → `foo.test.ts`
- **Integration tests** — `tests/integration/` (real DB, real API endpoints)
- **E2E tests** — `tests/e2e/` (Playwright, browser-level user flows)

### Test style — AAA

```ts
it('returns null for an unknown id', async () => {
  // Arrange
  const service = new CropService(db);

  // Act
  const result = await service.getCropById(99999);

  // Assert
  expect(result).toBeNull();
});
```

## Workflow

1. Fork (or branch, if you have write access) from `main`
2. Write a failing test for the change you want to make
3. Make it pass with the smallest reasonable change
4. Refactor while keeping tests green
5. Run the full local check before pushing:
   ```bash
   npm run lint -w apps/garden
   npm run typecheck -w apps/garden
   npm test -w apps/garden
   npm run test:e2e:smoke -w apps/garden
   ```
   CI runs the same checks plus the coverage gate and the full e2e suite.
6. Commit using gitmoji
7. Rebase onto `main` if it has moved on
8. Open a PR

## Code Quality

- **No `any`** types
- Max function length: **50 lines**
- Max nesting depth: **3 levels**
- Max statements per function: **15**
- Prefer dependency injection over hard imports — code must be testable
- API handlers stay thin (validate → call service → return); business logic lives in `src/server/services/`

## Database Changes

When you change `src/server/db/schema.ts`, run `npm run db:generate -w apps/garden` and commit the new file in `drizzle/`. Migrations run on startup (server-kit's `openDb`), and tests run against the same migrations.

## Questions

Open an issue, or check [BACKLOG.md](./BACKLOG.md) for what's already on the roadmap.
