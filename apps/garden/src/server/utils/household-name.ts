/** Name for the household a new account gets. Users can rename it later. */
export function defaultHouseholdName(userName: string | null): string {
  const name = userName?.trim();
  if (!name) return 'Mitt hushåll';
  return /[sxz]$/i.test(name) ? `${name} hushåll` : `${name}s hushåll`;
}
