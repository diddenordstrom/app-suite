---
name: ubiquitous-language
description: Maintain a project glossary of domain terms (DDD-style ubiquitous language). Use whenever the user talks about terminology, naming a new entity, is unsure what to call something, or uses two names that seem to mean the same thing. Reads and updates ubiquitous_language.md next to this skill, and reconciles the glossary against the actual codebase.
---

# Ubiquitous Language

Keep the project's domain vocabulary canonical, consistent, and reflected in the code. The glossary lives at:

`.claude/skills/ubiquitous-language/ubiquitous_language.md`

Every term has a single canonical name, a short description, and (when useful) a list of known synonyms to avoid.

## When to invoke

Trigger this skill — even without an explicit `/ubiquitous-language` invocation — whenever the user:

- Asks "what should we call X?" / "what's the right name for…"
- Uses two different words for what sounds like the same concept (e.g. "planting" vs "crop instance", "chore" vs "task", "plantings or crops")
- Talks about terminology, naming, glossary, or "ubiquitous language" directly
- Introduces a new domain entity, event, or concept that doesn't yet have a settled name
- Renames something in code or schema

## Behavior at a glance

**Stay lightweight.** Don't lecture or run the full Step 1–5 ceremony if you don't need to. Two example flows:

**Flow A — term already in glossary (common case):**

> **user:** I want to add a new feature to my plantings or crops…
> _(Claude silently reads `ubiquitous_language.md`, sees `Planting` is canonical)_
> **claude:** Let's add a new feature to your **plantings**! What do you want it to do?

Just use the canonical term and move on. No need to announce "I checked the glossary." Optionally drop a one-liner if the user mixed synonyms: _"(using `planting` — that's the canonical term in our glossary)"_.

**Flow B — term not in glossary (or glossary empty):**

> **user:** I want to add a new feature to my plantings or crops…
> _(Claude reads `ubiquitous_language.md` — empty / no match)_
> **claude:** Quick naming check — you mentioned "plantings" and "crops". In gardening, **crop** usually means the species (e.g. "tomato") and **planting** means a specific instance you sowed in a bed at a time. Based on what you're building, I'd suggest:
>
> - `Crop` — the catalog entry (tomato, basil, …)
> - `Planting` — an actual sown instance tied to a location and date
>
> Want me to add both to the glossary with those definitions, or do you mean something different?

Recommend, then let the user confirm before writing to the glossary.

## Step 1 — Read the glossary

Read `.claude/skills/ubiquitous-language/ubiquitous_language.md` first. If the file doesn't exist yet, create it with the header from the template below.

Scan it for:

- The exact term being discussed
- Known synonyms listed under existing entries
- Closely related terms that might be the same concept under a different name

## Step 2 — Decide which case you're in

**Case A — Term already exists in the glossary.**
Use the canonical name. If the user just used a synonym, gently point that out and use the canonical form in your response and any code you write. Example: "We've been calling that a `Planting` — using that name."

**Case B — Term doesn't exist yet, but a closely related/synonymous one does.**
Surface the existing term, explain why it might be the same concept, and ask the user whether they want to:

1. Reuse the existing term (preferred if truly the same concept)
2. Add the new term as a synonym under the existing entry
3. Add it as a distinct new term (because the concepts actually differ — capture the distinction in the description)

**Case C — Term is brand new.**
Put on your domain-expert hat. Recommend a name based on:

- Plain domain language a gardener would recognise (this is a self-sufficiency garden planner, not enterprise-y jargon)
- Consistency with existing glossary entries (same level of abstraction, same naming style — singular nouns, no `*Entity` / `*Manager` suffixes)
- How it will read in code, URLs, UI labels, and conversation
- Avoid collisions with existing terms or common framework words

Present 1–3 candidate names with a one-line rationale each, recommend one, and ask the user to confirm or pick. Don't add to the glossary until the user has chosen.

## Step 3 — Update the glossary

Once a name is settled, add or update the entry in `ubiquitous_language.md`. Keep entries alphabetised. Format:

```markdown
### TermName

One- or two-sentence description of what this is in the domain. Mention what it is NOT if there's a likely confusion.

- **Synonyms to avoid:** old-name, alt-name (use TermName instead)
- **Code:** `tableName`, `ServiceName`, key fields (only if non-obvious from the term)
- **Related:** [[OtherTerm]], [[OtherTerm]]
```

Only include the bullets that add information — skip the rest. Use `[[OtherTerm]]` to link related entries.

## Step 4 — Reconcile with the codebase

After adding or changing an entry, quickly check whether the codebase agrees:

- Grep for the canonical term and its known synonyms across `server/`, `app/`, and `server/db/schema.ts`
- Look at table names, column names, type names, route paths, i18n keys, and UI labels

Three outcomes:

1. **Code matches the glossary** — done, no action needed.
2. **Code is consistent but uses a different name than the glossary** — ask the user which is canonical. The code is often the source of truth for things already shipped; update the glossary to match unless the user wants to rename.
3. **Code is inconsistent (multiple names for the same concept)** — report the inconsistency with file paths, and ask the user whether to:
   - Schedule a refactor now (add a backlog item or do it directly, per the project's TDD rules)
   - Defer it (add it to `BACKLOG.md` under a "Terminology refactors" section)
   - Accept the divergence (rare — only if there's a real semantic distinction worth preserving; capture it in the glossary)

Never silently rename things in code. Renames are a refactor and need the user's go-ahead — and per project rules, they go through Red → Green → Refactor.

## Step 5 — Use the canonical term from now on

Once a term is in the glossary, use the canonical name in:

- All future responses to the user
- New code, types, table/column names, API routes, i18n keys
- Commit messages and PR descriptions

If you catch yourself using a synonym, correct it.

## Guardrails

- **Don't invent terms unilaterally.** Always recommend, then let the user pick.
- **Don't update the glossary on the user's behalf without confirming the canonical name.** Recommending is fine; committing the choice needs their nod.
- **Don't rename code without explicit approval.** Glossary edits are cheap; code renames are a refactor.
- **Don't bloat entries.** A term needs a name and a one-line description. Synonyms, code pointers, and related links are optional.
- **Don't duplicate.** Before adding, search the glossary for the concept under any plausible name.
- **Stay in the domain.** This glossary is for gardening/planning concepts (crops, plantings, locations, chores, events, harvests, growing zones, …), not for generic software terms like "service" or "repository".

## Glossary file template (only when creating from scratch)

```markdown
# Ubiquitous Language

The canonical vocabulary for the Self-Sufficiency Garden Planner domain. Every concept has one name here — code, UI, and conversation should all use it.

When a term is missing, ambiguous, or contradicted by the code, invoke the `ubiquitous-language` skill to reconcile.

---
```
