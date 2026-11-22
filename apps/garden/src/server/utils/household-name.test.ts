import { describe, it, expect } from 'vitest';
import { defaultHouseholdName } from './household-name';

describe('defaultHouseholdName', () => {
  it.each([
    ['Anna', 'Annas hushåll'],
    ['Lars', 'Lars hushåll'],
    ['Max', 'Max hushåll'],
    [null, 'Mitt hushåll'],
    ['  ', 'Mitt hushåll'],
  ])('names the household of %s "%s"', (name, expected) => {
    // Arrange — name from the table

    // Act
    const result = defaultHouseholdName(name);

    // Assert
    expect(result).toBe(expected);
  });
});
