import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { JoinBody } from "@/shared/api";
import { api, ApiError, errorMessage, fetchQuery } from "../api";
import { useAction } from "../hooks";
import { selectTrip } from "../trip";
import { Button, ErrorText, Field, Input, Spinner } from "../ui";
import { CenterCard } from "./Welcome";
import { t } from "../i18n";

interface JoinInfo { tripName: string; tripId: number; memberId: number | null }

export function Join() {
  const { code = "" } = useParams();
  const path = `/join/${encodeURIComponent(code)}`;
  // Fetched directly (not via the persisted query cache): memberId must be fresh.
  const [info, setInfo] = useState<{ loading: boolean; data?: JoinInfo; error?: ApiError }>({ loading: true });
  useEffect(() => {
    let live = true;
    // Dev mode auto-logs everyone in as the dev admin; drop to an anonymous viewer so the
    // invite flow can be tried as a real member (sets the server's dev_anon cookie).
    const ready = import.meta.env.DEV
      ? api<{ authMode: string }>("GET", "/me").then((me) => me.authMode === "dev" ? api("POST", "/auth/logout") : undefined)
      : Promise.resolve();
    ready.then(() => api<JoinInfo>("GET", path)).then(
      (data) => { if (live) setInfo({ loading: false, data }); },
      (e: unknown) => { if (live) setInfo({ loading: false, error: e instanceof ApiError ? e : new ApiError(errorMessage(e), 0) }); },
    );
    return () => { live = false; };
  }, [path]);
  const [name, setName] = useState("");
  const { run, busy, error } = useAction();
  const navigate = useNavigate();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const res = await api<{ tripId: number; memberId: number }>("POST", path, { name: name.trim() } satisfies JoinBody);
      selectTrip(res.tripId);
      await fetchQuery("/me");
      navigate("/", { replace: true });
    });
  };

  // Already on this trip: skip the form.
  const existing = info.data?.memberId != null ? info.data.tripId : null;
  useEffect(() => {
    if (existing == null) return;
    selectTrip(existing);
    void fetchQuery("/me").then(() => navigate("/", { replace: true }));
  }, [existing, navigate]);

  if (info.loading || existing != null) return <CenterCard><Spinner className="mx-auto" /></CenterCard>;
  if (info.error || !info.data)
    return (
      <CenterCard>
        <p className="text-sm text-muted-foreground">{info.error?.status === 404 ? t("join.invalidLink") : info.error?.message}</p>
      </CenterCard>
    );
  return (
    <CenterCard>
      <p className="text-sm text-muted-foreground">{t("join.invitedTo")}</p>
      <p className="text-xl font-semibold">{info.data.tripName}</p>
      <form onSubmit={submit} className="space-y-3 text-left">
        <Field label={t("join.yourName")} hint={t("join.yourNameHint")}>
          <Input required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Anna" maxLength={40} />
        </Field>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" className="w-full" disabled={busy || !name.trim()}>{t("join.join")}</Button>
      </form>
    </CenterCard>
  );
}
