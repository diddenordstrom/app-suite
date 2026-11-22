import { describe, it, expect } from 'vitest';
import { collectScopeRefs } from './scope-refs';

describe('collectScopeRefs', () => {
  it('maps a numeric id after a scoped entity in the path', () => {
    // Arrange
    const req = { path: '/api/planting/12/image/abc', query: {}, body: undefined };

    // Act
    const refs = collectScopeRefs(req);

    // Assert
    expect(refs).toEqual([{ entity: 'planting', id: 12 }]);
  });

  it('ignores global entities and non-numeric segments', () => {
    // Arrange
    const paths = ['/api/crops/3', '/api/seed-variety/4', '/api/storage/consume', '/api/image/x'];

    // Act
    const refs = paths.flatMap((path) => collectScopeRefs({ path, query: {}, body: undefined }));

    // Assert
    expect(refs).toEqual([]);
  });

  it('strips the query string from the path', () => {
    // Arrange
    const req = { path: '/api/location/7?x=1', query: {}, body: undefined };

    // Act
    const refs = collectScopeRefs(req);

    // Assert
    expect(refs).toEqual([{ entity: 'location', id: 7 }]);
  });

  it('covers every household-owned entity in the path', () => {
    // Arrange
    const entities = [
      'household',
      'location',
      'planting',
      'storage',
      'expense',
      'garden-event',
      'garden',
      'macro-target',
      'wishlist',
    ];

    // Act
    const refs = entities.flatMap((e) =>
      collectScopeRefs({ path: `/api/${e}/1`, query: {}, body: undefined }),
    );

    // Assert
    expect(refs.map((r) => r.entity)).toEqual(entities);
  });

  it('collects householdId from the query and the body', () => {
    // Arrange
    const req = { path: '/api/dashboard', query: { householdId: '3' }, body: { householdId: 4 } };

    // Act
    const refs = collectScopeRefs(req);

    // Assert
    expect(refs).toEqual([
      { entity: 'household', id: 3 },
      { entity: 'household', id: 4 },
    ]);
  });

  it('collects location and planting references from the body, including arrays', () => {
    // Arrange
    const body = {
      locationId: 1,
      targetLocationId: '2',
      plantingId: 3,
      locationIds: [4, 5],
      plantingIds: [6],
    };

    // Act
    const refs = collectScopeRefs({ path: '/api/garden-event', query: {}, body });

    // Assert
    expect(refs).toEqual([
      { entity: 'location', id: 1 },
      { entity: 'location', id: 2 },
      { entity: 'planting', id: 3 },
      { entity: 'location', id: 4 },
      { entity: 'location', id: 5 },
      { entity: 'planting', id: 6 },
    ]);
  });

  it('skips missing, null and non-integer values (handlers return 400 for those)', () => {
    // Arrange
    const body = { locationId: null, plantingId: 'abc', householdId: 1.5, locationIds: 'x' };

    // Act
    const refs = collectScopeRefs({ path: '/api/planting', query: { householdId: '' }, body });

    // Assert
    expect(refs).toEqual([]);
  });

  it('ignores a body that is not an object', () => {
    // Arrange
    const req = { path: '/api/image', query: {}, body: 'binary' };

    // Act
    const refs = collectScopeRefs(req);

    // Assert
    expect(refs).toEqual([]);
  });
});
