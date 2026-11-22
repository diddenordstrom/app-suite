import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Button, Card, Logo } from "../ui";
import { api } from "../api";
import { fetchMe, loginUrl } from "../household";
import { t } from "../i18n";

/** Invite landing: preview the household, sign in if needed (coming back with ?auto=1), then join. */
export function Join() {
  const code = useParams().code ?? "";
  const [params] = useSearchParams();
  const [household, setHousehold] = useState<{ id: number; name: string } | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | "invalid" | "joining">("loading");

  const join = async (signedIn: boolean) => {
    if (!signedIn) {
      location.href = loginUrl(`/join/${encodeURIComponent(code)}?auto=1`);
      return;
    }
    setState("joining");
    try {
      await api("POST", `/invite/${code}/join`);
      location.href = "/settings";
    } catch {
      setState("invalid");
    }
  };

  useEffect(() => {
    let live = true;
    void (async () => {
      const [preview, me] = await Promise.all([
        api<{ id: number; name: string }>("GET", `/invite/${code}`).catch(() => null),
        fetchMe().catch(() => ({ user: null })),
      ]);
      if (!live) return;
      setHousehold(preview);
      setLoggedIn(me.user !== null);
      setState(preview ? "ready" : "invalid");
      // Back from signing in through this page: join without a second click.
      if (preview && me.user && params.get("auto") === "1") await join(true);
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  return (
    <div className="mx-auto max-w-md px-4 pt-12" data-testid="join-page">
      <Logo className="mx-auto mb-6 size-12" />
      <Card className="space-y-4 p-6 text-center">
        {state === "loading" ? (
          <p className="text-muted-foreground">{t("common.loading")}</p>
        ) : state === "invalid" ? (
          <>
            <h1 className="text-lg font-semibold">{t("join.invalid.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("join.invalid.body")}</p>
            <Link to="/" className="inline-flex h-10 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-accent">{t("join.home")}</Link>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold" data-testid="join-household-name">{t("join.title", { name: household?.name ?? "" })}</h1>
            <p className="text-sm text-muted-foreground">{t("join.body")}</p>
            <Button data-testid="join-button" disabled={state === "joining"} onClick={() => void join(loggedIn)}>
              {loggedIn ? t("join.button") : t("join.loginButton")}
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}
