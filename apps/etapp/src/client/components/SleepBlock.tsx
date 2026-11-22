import type { DayBody } from "@/shared/api";
import { formatLatLon, hasCoords } from "@/shared/geo";
import { nearbyUrl, SLEEP_SEARCHES } from "@/shared/links";
import { SLEEP_TYPES, type Day } from "@/shared/plan";
import { useAction } from "../hooks";
import { useTrip } from "../trip";
import { ErrorText, Field, SegmentedControl } from "../ui";
import { AutoInput as BlurInput, ChipLink, Chips, Eyebrow, readPosition } from "./bits";
import { t } from "../i18n";

/** The night block at the end of a day: type, place, position, note and searches for somewhere to sleep. */
export function SleepBlock({ day, n, area }: { day: Day; n: number; area: string }) {
  const { call } = useTrip();
  const { run, error, setError } = useAction();
  const s = day.sleep;
  const save = (body: DayBody) => void run(() => call("PATCH", `/days/${day.id}`, body, ["plan"]));
  const lastStop = day.stops.at(-1);
  const ref = hasCoords(s) ? { lat: s.lat, lon: s.lon, name: s.name } : lastStop ?? { name: s.name };
  return (
    <div className="space-y-2.5 rounded-lg border-2 border-tent p-3">
      <Eyebrow className="text-tent">{t("night.n", { n })}</Eyebrow>
      <SegmentedControl
        value={s.type} onChange={(v) => save({ sleepType: v })} className="flex w-full flex-wrap"
        options={SLEEP_TYPES.map((v) => ({ value: v, label: t(`sleep.${v}`) }))}
      />
      <Field label={t("night.where")}>
        <BlurInput value={s.name} onSave={(v) => save({ sleepName: v })} placeholder={t("night.wherePlaceholder")} />
      </Field>
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label={t("day.position")}>
          <BlurInput
            value={formatLatLon(s)} inputMode="decimal" placeholder={t("day.positionPlaceholder")}
            onSave={(v) => {
              const p = readPosition(v);
              if (p === "invalid") setError(t("pos.invalid"));
              else save({ sleepLat: p.lat, sleepLon: p.lon });
            }}
          />
        </Field>
        <Field label={t("night.note")}>
          <BlurInput value={s.note} onSave={(v) => save({ sleepNote: v })} placeholder={t("night.notePlaceholder")} />
        </Field>
      </div>
      <ErrorText>{error}</ErrorText>
      <Chips>
        {SLEEP_SEARCHES.map((x) => (
          <ChipLink key={x.key} href={nearbyUrl(x.query, ref, area, 11)}>{t("near.find", { what: t(`near.${x.key}`).toLowerCase() })}</ChipLink>
        ))}
      </Chips>
    </div>
  );
}
