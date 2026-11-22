/**
 * The signed-in user and the active household. Loaded once by the shell; every page reads it with
 * useHousehold() and loads its own data for `current.id` on mount.
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, errorMessage } from "./api";

export interface AuthUser { id: number; name: string | null; email: string | null }
export interface Me { authMode: "dev" | "oidc" | "demo"; user: AuthUser | null }
export interface MembershipHousehold { id: number; name: string; inviteCode: string | null; role: "owner" | "member" }

export const inviteUrl = (origin: string, code: string) => `${origin}/join/${code}`;
export const loginUrl = (returnTo: string) => `/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`;

export const fetchMe = () => api<Me>("GET", "/auth/me");

export interface HouseholdCtx {
  me: Me;
  user: AuthUser;
  current: MembershipHousehold;
  households: MembershipHousehold[];
  isOwner: boolean;
  /** Make another household active, then reload so every page refetches for it. */
  switchTo: (id: number) => Promise<void>;
  /** Refetch the household list and the active household (after a rename, say). */
  refresh: () => Promise<void>;
}

const Ctx = createContext<HouseholdCtx | null>(null);

export function useHousehold(): HouseholdCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useHousehold outside HouseholdProvider");
  return c;
}

type State = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; me: Me & { user: AuthUser }; current: MembershipHousehold; households: MembershipHousehold[] };

export function HouseholdProvider({ loading, error, children }: { loading: ReactNode; error: (message: string, retry: () => void) => ReactNode; children: ReactNode }) {
  const [state, setState] = useState<State>({ status: "loading" });

  const load = useCallback(async () => {
    try {
      const me = await fetchMe();
      // Not signed in: off to the login, which comes back here.
      if (!me.user) {
        location.href = loginUrl(location.pathname + location.search);
        return;
      }
      const [current, households] = await Promise.all([
        api<MembershipHousehold>("GET", "/household/current"),
        api<MembershipHousehold[]>("GET", "/household"),
      ]);
      setState({ status: "ready", me: me as Me & { user: AuthUser }, current, households });
    } catch (e) {
      setState({ status: "error", message: errorMessage(e) });
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (state.status === "loading") return <>{loading}</>;
  if (state.status === "error") return <>{error(state.message, () => { setState({ status: "loading" }); void load(); })}</>;

  const value: HouseholdCtx = {
    me: state.me,
    user: state.me.user,
    current: state.current,
    households: state.households,
    isOwner: state.current.role === "owner",
    switchTo: async (id) => {
      await api("PUT", "/me/household", { id });
      location.reload();
    },
    refresh: load,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
