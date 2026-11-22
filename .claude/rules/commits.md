# Commits and repo hygiene

- Start every commit message with a [gitmoji](https://gitmoji.dev/) character, then a short imperative summary: `✨ Add trip balances`, `🐛 Fix login redirect`.
- Docs commits start with 📝.
- Run `npm run check` before committing.
- Never commit `.env` files or `data/`; both are gitignored. Add new settings to the app's `.env.example`.
- Secret values go in Komodo or GitHub secrets, never in git.
