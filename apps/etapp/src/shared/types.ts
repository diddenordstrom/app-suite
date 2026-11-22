export interface User {
  id: number;
  sub: string;
  email: string | null;
  name: string | null;
}

export function displayName(u: Pick<User, "name" | "email" | "sub">): string {
  return u.name || u.email || u.sub;
}
