import { useRef, useState } from "react";
import type { Scenario } from "@/shared/scenario";
import { exportScenario, importScenario } from "../storage";
import { t } from "../i18n";
import { Button, Card, ErrorText } from "../ui";

/** Where the numbers live, and moving them: export, import, back to the example. */
export function DataPanel({ scenario, persisted, onLoad, onReset }: { scenario: Scenario; persisted: boolean; onLoad: (s: Scenario) => void; onReset: () => void }) {
  const file = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const s = await importScenario(f);
    if (file.current) file.current.value = "";
    if (!s) { setError(t("data.importFailed")); setDone(false); return; }
    setError(null);
    setDone(true);
    onLoad(s);
  };

  return (
    <Card className="space-y-3 p-5">
      <h2 className="text-sm font-semibold">{t("data.title")}</h2>
      <p className={persisted ? "text-xs text-muted-foreground" : "text-xs text-warning"}>{persisted ? t("data.local") : t("data.noStorage")}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => exportScenario(scenario)}>{t("data.export")}</Button>
        <Button variant="outline" onClick={() => file.current?.click()}>{t("data.import")}</Button>
        <Button variant="ghost" onClick={() => { if (confirm(t("data.confirmReset"))) { setDone(false); onReset(); } }}>{t("data.reset")}</Button>
        <input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
      </div>
      {done && <p role="status" className="text-xs text-success">{t("data.imported")}</p>}
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}
