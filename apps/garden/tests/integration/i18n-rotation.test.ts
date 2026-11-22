import { describe, it, expect } from 'vitest';
import { en, sv } from '../../src/client/i18n/plants';

// Smoke test: the rotation keys the suggestion engine refers to resolve to non-empty strings in both languages.
// The {family} placeholder is left un-interpolated; only the raw templates are checked.

const EXPECTED_KEYS = [
  'rotation.advice.legumeBonus',
  'rotation.advice.hardExclusion',
  'rotation.advice.softPenalty',
  'suggestions.maxedOutFamily',
] as const;

describe('rotation i18n keys', () => {
  for (const [name, dict] of [['sv', sv], ['en', en]] as const) {
    for (const key of EXPECTED_KEYS) {
      it(`[${name}] ${key} resolves to a non-empty string`, () => {
        expect(typeof dict[key]).toBe('string');
        expect(dict[key].length).toBeGreaterThan(0);
      });
    }
  }
});
