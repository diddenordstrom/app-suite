/* global process, console */
// Runs draft 4's own engine (runPath, pvBridge) on a few scenarios and writes the pinned numbers
// that engine.test.ts checks against. Regenerate only if a scenario is added:
//   node apps/brygga/src/shared/fixtures/draft4-facit.mjs docs/raw/fire-calculator-draft-4.html apps/brygga/src/shared/fixtures/draft4.json
import fs from "node:fs";
const html = fs.readFileSync(process.argv[2], "utf8");
let js = html.split("<script>")[1].split("</script>")[0];
js = js.replace(/buildUI\(\);\s*update\(\);[\s\S]*$/, "");
const run = new Function("SCEN", js + `
  for (const grp of [...main, ...assumptions]) for (const f of grp.items) if (!f.hint) inputs[f.id] = { n: { value: String(SCEN[f.id] ?? f.val) }, money: false };
  const res = {};
  const age0 = g('age');
  const cands = []; for (let a = Math.floor(age0) + 1; a <= 75; a++) cands.push(runPath(a));
  const ch = runPath(g('retAge'));
  const pick = (c) => ({ a: c.a, liqRealA: c.liqRealA, need: c.need, minBridge: c.minBridge, marginOk: c.marginOk, bridgeShort: c.bridgeShort, shortfall: c.shortfall, ok: c.ok, fire4: c.fire4,
    nw: c.pts.map(p => p.nw), liquid: c.pts.map(p => p.liquid), pension: c.pts.map(p => p.pension) });
  res.payment = monthlyPayment();
  res.earliest = cands.find(c => c.ok)?.a ?? null;
  res.okAges = cands.filter(c => c.ok).map(c => c.a);
  res.chosen = pick(ch);
  return res;
`);
const scenarios = {
  defaults: {},
  rich: { age: 45, retAge: 52, salary: 900000, stocks: 4000000, stockSave: 15000, priv: 800000, tjanst: 1200000, allm: 1500000, loan: 1500000, expensesAfter: 35000, allmStart: 66, tjStart: 62 },
  tight: { stocks: 100000, stockSave: 2000, expensesAfter: 42000, retAge: 55 },
  noLoan: { age: 50, retAge: 58, loan: 0, stocks: 2500000, expensesAfter: 25000, tjStart: 55 },
};
const out = {};
for (const [k, s] of Object.entries(scenarios)) out[k] = { input: s, ...run(s) };
fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 1));
for (const [k, v] of Object.entries(out)) console.log(k, v.earliest, v.okAges.join(","), v.chosen.ok, Math.round(v.chosen.need), Math.round(v.chosen.liqRealA), Math.round(v.chosen.nw.at(-1)));
