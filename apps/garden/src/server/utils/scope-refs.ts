export const SCOPED_ENTITIES = [
  'household',
  'location',
  'planting',
  'storage',
  'expense',
  'garden-event',
  'garden',
  'macro-target',
  'wishlist',
] as const;
export type ScopedEntity = (typeof SCOPED_ENTITIES)[number];

export interface ScopeRef {
  entity: ScopedEntity;
  id: number;
}

export interface ScopeRequest {
  path: string;
  query: Record<string, unknown>;
  body: unknown;
}

/** Body/query keys that point at household-owned rows. */
const FIELD_ENTITIES: [string, ScopedEntity][] = [
  ['householdId', 'household'],
  ['locationId', 'location'],
  ['targetLocationId', 'location'],
  ['plantingId', 'planting'],
  ['locationIds', 'location'],
  ['plantingIds', 'planting'],
];

function toId(value: unknown): number | null {
  if (value === '' || value === null) return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function pathRef(path: string): ScopeRef[] {
  const [, api, entity, idPart] = path.split('?')[0]!.split('/');
  if (api !== 'api' || !(SCOPED_ENTITIES as readonly string[]).includes(entity ?? '')) return [];
  const id = toId(idPart);
  return id === null ? [] : [{ entity: entity as ScopedEntity, id }];
}

function fieldRefs(source: unknown): ScopeRef[] {
  if (typeof source !== 'object' || source === null) return [];
  const record = source as Record<string, unknown>;
  return FIELD_ENTITIES.flatMap(([key, entity]) => {
    const raw = record[key];
    const values = key.endsWith('Ids') ? (Array.isArray(raw) ? raw : []) : [raw];
    return values.map(toId).flatMap((id) => (id === null ? [] : [{ entity, id }]));
  });
}

/**
 * Every household-owned row an API request points at: the id after
 * `/api/<entity>/` plus ids in the query string and JSON body. The auth
 * middleware checks each one against the active household.
 */
export function collectScopeRefs(req: ScopeRequest): ScopeRef[] {
  return [...pathRef(req.path), ...fieldRefs(req.query), ...fieldRefs(req.body)];
}
