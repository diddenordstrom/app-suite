import { describe, expect, it } from "vitest";
import { parseQuick, parseTodo, summarize } from "./quick";

describe("parseTodo", () => {
  it("a leading category word picks the category and is dropped", () => {
    expect(parseTodo("fika Kroatorpet")).toEqual({ text: "Kroatorpet", category: "fika" });
    expect(parseTodo("Mat på torget")).toEqual({ text: "På torget", category: "mat" });
  });
  it("aliases pick a category but stay in the text", () => {
    expect(parseTodo("handla ICA")).toEqual({ text: "Handla ICA", category: "fixa" });
    expect(parseTodo("lunch i Lom")).toEqual({ text: "Lunch i Lom", category: "mat" });
  });
  it("defaults to 'se' and keeps a lone category word as text", () => {
    expect(parseTodo("polkagrisbutiken")).toEqual({ text: "Polkagrisbutiken", category: "se" });
    expect(parseTodo("fika")).toEqual({ text: "Fika", category: "se" });
  });
});

describe("parseQuick", () => {
  it("parses the artifact's example", () => {
    const r = parseQuick("Huskvarna, fika Kroatorpet, handla ICA\nGränna, se polkagrisbutiken\nnatt tält Vättern");
    expect(r.warnings).toEqual([]);
    expect(r.commands).toEqual([
      { kind: "stop", name: "Huskvarna", lat: null, lon: null, todos: [{ text: "Kroatorpet", category: "fika" }, { text: "Handla ICA", category: "fixa" }] },
      { kind: "stop", name: "Gränna", lat: null, lon: null, todos: [{ text: "Polkagrisbutiken", category: "se" }] },
      { kind: "night", sleepType: "tent", name: "Vättern", lat: null, lon: null },
    ]);
  });

  it("starts days and strips a 'stopp' prefix", () => {
    const r = parseQuick("dag Gudbrandsdalen\nstopp lom stavkyrkje");
    expect(r.commands).toEqual([
      { kind: "day", title: "Gudbrandsdalen" },
      { kind: "stop", name: "Lom stavkyrkje", lat: null, lon: null, todos: [] },
    ]);
  });

  it("takes coordinates off a line before splitting on commas", () => {
    const r = parseQuick("Pollfossen 61.9056, 7.9583, se fallet");
    expect(r.commands[0]).toEqual({ kind: "stop", name: "Pollfossen", lat: 61.9056, lon: 7.9583, todos: [{ text: "Fallet", category: "se" }] });
  });

  it("reads a long Google Maps link", () => {
    const r = parseQuick("Geiranger https://www.google.com/maps/place/Geiranger/@62.1008,7.2059,13z, fika");
    expect(r.commands[0]).toMatchObject({ name: "Geiranger", lat: 62.1008, lon: 7.2059 });
    expect(r.warnings).toEqual([]);
  });

  it("warns about short share links and unreadable links, keeping the stop", () => {
    const r = parseQuick("Strynefjell https://maps.app.goo.gl/439yRrFsK7vXw43f8?g_st=ic\nX https://example.com/a");
    expect(r.commands.map((c) => c.kind === "stop" && c.name)).toEqual(["Strynefjell", "X"]);
    expect(r.warnings).toEqual([{ line: 1, code: "shortLink" }, { line: 2, code: "badLink" }]);
  });

  it("night: type word, name, position, any part optional", () => {
    expect(parseQuick("natt vandrarhem Lom").commands[0]).toEqual({ kind: "night", sleepType: "hostel", name: "Lom", lat: null, lon: null });
    expect(parseQuick("natt hotell Geiranger 62.1008, 7.2059").commands[0]).toEqual(
      { kind: "night", sleepType: "hotel", name: "Geiranger", lat: 62.1008, lon: 7.2059 },
    );
    expect(parseQuick("natt Camping Skjåk,").commands[0]).toEqual({ kind: "night", sleepType: null, name: "Camping Skjåk", lat: null, lon: null });
    expect(parseQuick("natt tält 61.8811, 8.3899").commands[0]).toEqual({ kind: "night", sleepType: "tent", name: null, lat: 61.8811, lon: 8.3899 });
  });

  it("ignores bullets and blank lines pasted from a notes app", () => {
    const r = parseQuick("Norge\n\t⁃\tLom Stavkjyrkje (Bakeriet i Lom)\n\t⁃\tPollfossen\n• Gamle Strynefjellsvegen\n- Geiranger\n1. Trollstigen\n\n");
    expect(r.commands.map((c) => c.kind === "stop" && c.name)).toEqual([
      "Norge", "Lom Stavkjyrkje (Bakeriet i Lom)", "Pollfossen", "Gamle Strynefjellsvegen", "Geiranger", "Trollstigen",
    ]);
  });

  it("summarizes what a paste adds", () => {
    expect(summarize(parseQuick("dag A\nX, fika, mat\nY\nnatt Z"))).toEqual({ days: 1, stops: 2, todos: 2, nights: 1 });
  });
});
