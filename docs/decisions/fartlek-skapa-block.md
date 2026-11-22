---
title: Fartlek "Skapa block": one entry, two steps, one editor
summary: Why the plan has one "Skapa block" button, what step 1 asks, and why the block editor shows the weeks as columns with the numbers beside them
type: decision
status: accepted
updated: 2026-11-16
---

## Decision

The plan page's header had six actions (Vecka/Månad/Block, Föreslå block, Nytt block, Rensa, Lopp). It now has the view switch, one primary **Skapa block** and a **⋯** menu (Lopp, Rensa…, Nytt block som text). Skapa block opens a dialog in two steps:

1. **Utgångsläge.** What the coach reads from the seed (form today, average of the last weeks, peak week, next race) and its conclusion: no A/B race inside the race window, so the block builds volume, or the runner is tired and the block starts with a lighter week. The runner names the block, picks the start week and the **rhythm**, then chooses **Låt coachen föreslå** or **Bygg själv**.
2. **Planera veckorna.** One editor for both choices: the coach's weeks filled in, or the same weeks empty. Every edit re-evaluates the block (form, km, warnings, charts), as before.

**Rhythm replaces the 2/3/4 weeks toggle.** It is asked as 1:1, 2:1 or 3:1 with one sentence on what a block does (raise volume and intensity a few weeks, then a lighter week where the body adapts). 2:1 and 3:1 are 3 and 4 weeks under the engine's own rule. 1:1 (two weeks, the second lighter) needed `BlockSeed.lighterWeeks`: the rule has no lighter week under three, so the server sets `[false, true]` for `rhythm=1:1`.

**The editor's length and lighter weeks are the runner's.** Weeks can be added (a build week before the closing lighter week, a copy of the build week before it at +8 % in a suggested block, empty in one built by hand), removed (down to `BLOCK.minWeeks`) and switched between build and lighter (runs scale to 70 % and back). The edited weeks are evaluated with `lighterWeeks` set from the editor. Suggestions still default to at most `BLOCK.maxWeeks` (4); a block shaped in the editor may be up to `BLOCK.maxEditWeeks` (6).

**A block can start this week, from today (2026-11-16).** The user, on a Monday with nothing planned, couldn't start a block before next week. The running week is now a start week while no block holds it and at least `BLOCK.minDaysLeft` (4) days are left, Monday to Thursday; the picker shows it as "från idag". It is the default when nothing is planned in what is left of it, else the next free week stays the default. The engine plans the whole week and clips it to today on (the same as re-planning a running block); the days before are locked in the editor with what was run, and the POST refuses a session on a day that is over. As in re-planning, the load run earlier in that week is not in the seed, a small inaccuracy. "Föreslå veckan" also shows on the running week now (the route already took it).

**A tired start asks once, in the editor.** When `lighterFirst` makes week 1 lighter, the rhythm no longer ends lighter within its length. The editor offers "Förläng till N veckor" (the engine plans one more week, so the block ends lighter) or keeps the length. It is asked in step 2, not step 1, because the runner sees what it does to the weeks and the charts.

**A lighter first week comes from form or from asking, never from a km rhythm (2026-11-16).** The user caught step 1 saying "du är sliten" for a runner whose form was fine: the lighter week came from `lighterDue`, a km rhythm (three build weeks in a row at a new high). The user's point: a runner who is fresh after weeks of building should build on (the weeks were planned too easy), and the rhythm is the block's job, since every block ends lighter. So `lighterDue` is gone. The next-week seed decides `backoff` with a reason (`WeekSeed.backoffWhy`, carried to `BlockSeed.lighterFirstWhy`): **asked** (a target noted "backoff", or a lighter start from the Monday check-in) or **form** (`formHeavy`: form under −25 % of fitness, `FORM.heavy`, the band the form tile calls "Tungt belastad"). A runner's own target still blocks the automatic one. Only "form" is called tired, with the form %; the form tile shows the form % and its band. The week dialog's lighter-week line names the reason. Tendons and bones are still protected by the growth and ramp limits and the spike rule, not by a lighter week. In the scenarios the "building" runner (form −27 % after the build) now gets a 40 km week and a 4-week block ending lighter, instead of a lighter week first; a first heavy week out of nothing (fitness 4, fatigue 17) gets a lighter week for form. **A target in the way (2026-11-17):** the week dialog treats a week target as the runner deciding the week, so it never goes lighter on its own there. Skapa block doesn't: a prod week with a 29 km target (left behind by a block or a copy, "inget block") got no lighter start at −31 % form. Now Skapa block reads form whatever the week's target is, and only a target noted "backoff" counts as asked (`seedFor(..., { formOverTarget })`). When both hold (heavy form and a "backoff" note) the reason shown is form ("du är sliten"), the truer one. Open: blocks write a km target per week (the sum of its sessions) that goes stale when sessions move, and a week without a target already falls back to the sum; blocks could write only the role note.

**Weeks as columns, days as rows** on wider screens, the numbers in a column beside them. The same weekday lines up across weeks, so the block's progression reads left to right like the volume chart (the long run growing Sunday by Sunday). Passed over: one row per week as in Vecka/Månad, which needs seven narrow cells per row and makes comparing the same day across weeks a jump between rows. Past five or six weeks the columns scroll sideways. On phones the editor shows one week at a time behind tabs that double as a small volume chart, with a bar of the main numbers at the bottom.

**Quick-add buttons** (Lugnt, Lugnt + strides, Tröskel, Långpass, Annan träning) put a session on the first free day that suits it in the chosen week, as the text editor's do.

"Räkna om resten" uses the same editor layout (its length and lighter weeks stay the engine's).

## Changing a block uses the same editor

**Ändra block** opens the editor on what is planned now, from the running week to the block's end (`GET /blocks/:id/replan?thisWeek=1&edit=1`). Days that are over are locked and show what was run; a race in those weeks stays as it is and its day is locked, so a race is never replaced. (Re-planning those weeks was race mode's job until [race blocks](fartlek-race-blocks.md) were built; now "Räkna om resten" tapers toward the race.) **Räkna om resten** is a button in the same editor: it loads the engine's re-plan and its reasons, with the diff against the current plan as before. From the block card both open this dialog; the Monday check-in's pause still opens it on the re-plan. The block's length stays with its settings (now "Blockinställningar" behind ⋯, with "Redigera som text"); the editor only switches weeks between build and lighter.

**A finished block** shows a one- or two-sentence summary from its own numbers (volume against plan, key sessions, the share of easy runs in Z1–2), its form going in and coming out (TSB on the start day and the day after the end), and no edit buttons. A running block shows its form at the start and now.

**No "use as template".** It was in the mock and was dropped: an old block was planned for the fitness the runner had then, and "Skapa block" already suggests the next block from where the runner is now, so a template would mostly copy stale km.

## Not done yet

- A week added in the creating editor that already holds planned sessions makes "Använd blocket" refuse (the shown set no longer matches).

The design was mocked first in a Claude Design canvas ("Fartlek – Skapa block").
