import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { List, Trip } from "@/shared/api";
import { useQuery } from "../api";
import { useHousehold } from "../household";
import { Button, Card, cn, ErrorText, PageSkeleton } from "../ui";
import { PageHeader } from "../components/common";
import { ActiveTrip } from "../components/ActiveTrip";
import type { CheckoutSummary } from "../components/CheckoutDialog";
import { StartTripDialog } from "../components/StartTripDialog";
import { TripHistory } from "../components/TripHistory";
import { CartIcon, CheckIcon } from "../components/icons";
import { possessive, t as tr, tn } from "../i18n";

export function TripPage() {
  const h = useHousehold();
  const trips = useQuery<Trip[]>(`${h.base}/trips`);
  const lists = useQuery<List[]>(`${h.base}/lists`);
  const [params, setParams] = useSearchParams();
  const [summary, setSummary] = useState<CheckoutSummary | null>(null);
  const [starting, setStarting] = useState(false);

  if (summary) return <Summary summary={summary} onDone={() => setSummary(null)} />;
  if (trips.loading || lists.loading) return <PageSkeleton cards={2} columns="" />;
  if (!trips.data) return <ErrorText>{trips.error?.message}</ErrorText>;

  const active = trips.data.filter((t) => t.status === "active").sort((a, b) => Number(b.shopperId === h.me.id) - Number(a.shopperId === h.me.id) || b.startedAt - a.startedAt);
  const sel = active.find((t) => t.id === Number(params.get("id"))) ?? active[0];

  return (
    <div className="space-y-6">
      <PageHeader title={tr("trip.title")}>
        <Button variant="outline" onClick={() => setStarting(true)}><CartIcon className="size-4" />{sel ? tr("trip.another") : tr("trip.start")}</Button>
      </PageHeader>
      {active.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {active.map((t) => (
            <button key={t.id} type="button" onClick={() => setParams({ id: String(t.id) }, { replace: true })}
              className={cn("rounded-full border border-border px-3 py-1 text-sm", t.id === sel?.id ? "bg-primary text-primary-foreground" : "hover:bg-accent")}>
              {t.shopperId === h.me.id ? tr("trip.yours") : tr("trip.theirs", { owner: possessive(h.name(t.shopperId)) })}{t.store ? ` · ${t.store}` : ""}
            </button>
          ))}
        </div>
      )}
      {sel ? (
        <ActiveTrip key={sel.id} trip={sel} lists={lists.data ?? []} onCheckedOut={setSummary} />
      ) : (
        <Card className="space-y-3 text-center">
          <p className="font-medium">{tr("trip.none")}</p>
          <p className="text-sm text-muted-foreground">{tr("trip.noneBody")}</p>
          <Button onClick={() => setStarting(true)}><CartIcon className="size-4" />{tr("trip.startA")}</Button>
        </Card>
      )}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase">{tr("trip.recent")}</h2>
        <TripHistory trips={trips.data} />
      </section>
      <StartTripDialog open={starting} onClose={() => setStarting(false)} />
    </div>
  );
}

function Summary({ summary, onDone }: { summary: CheckoutSummary; onDone: () => void }) {
  const h = useHousehold();
  const total = summary.allocations.reduce((s, a) => s + a.amount, 0) + summary.guestAmount;
  const owed = summary.allocations.filter((a) => a.ownerId !== h.me.id && a.amount > 0);
  return (
    <Card className="mx-auto max-w-md space-y-4 text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-success/15 text-success"><CheckIcon className="size-6" /></div>
      <div>
        <p className="text-lg font-semibold">{tr("trip.closed", { amount: h.fmt(total) })}</p>
        <p className="text-sm text-muted-foreground">{tn("trip.bought", summary.boughtCount)}</p>
      </div>
      {owed.length > 0 && (
        <ul className="space-y-1 text-sm">
          {owed.map((a) => <li key={a.ownerId}>{owesYou(h.name(a.ownerId), h.fmt(a.amount))}</li>)}
        </ul>
      )}
      {summary.guests > 0 && summary.guestAmount > 0 && <p className="text-sm text-muted-foreground">{tr(summary.guests === 1 ? "expense.guestNote" : "expense.guestsNote", { amount: h.fmt(summary.guestAmount) })}</p>}
      <Button className="w-full" onClick={onDone}>{tr("trip.done")}</Button>
    </Card>
  );
}

/** "{name} owes you {amount}" with the amount in bold, in whatever word order the language uses. */
function owesYou(name: string, amount: string) {
  const [before, after = ""] = tr("trip.owesYou", { name, amount: "\u0000" }).split("\u0000");
  return <>{before}<span className="font-medium">{amount}</span>{after}</>;
}
