import { describe, expect, it } from "vitest";
import type { ItemSuggestion } from "@/shared/api";
import { rankSuggestions } from "./ItemSuggestions";

const s = (text: string, count: number, lastUsed: number): ItemSuggestion => ({ text, quantity: null, count, lastUsed });
const all = [s("Oat milk", 5, 10), s("Milk", 3, 20), s("Mince", 3, 30), s("Eggs", 2, 40), s("Bread", 1, 50)];
const texts = (r: ItemSuggestion[]) => r.map((x) => x.text);

describe("rankSuggestions", () => {
  it("empty query returns most frequent, minus excluded", () => {
    expect(texts(rankSuggestions(all, "  ", new Set(["eggs"]), 3))).toEqual(["Oat milk", "Mince", "Milk"]);
  });
  it("prefix before substring, then count, then recency; case-insensitive", () => {
    expect(texts(rankSuggestions(all, "MI", new Set(), 6))).toEqual(["Mince", "Milk", "Oat milk"]);
    expect(texts(rankSuggestions(all, "milk", new Set(["milk"]), 6))).toEqual(["Oat milk"]);
  });
});
