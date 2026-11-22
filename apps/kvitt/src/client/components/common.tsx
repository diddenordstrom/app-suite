import { Fragment, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { Badge, Button, Card, Input, Select } from "../ui";
import { useOnline } from "../hooks";
import { selectHousehold, useHousehold } from "../household";
import { usePendingOps } from "../tripQueue";
import { CheckIcon, CloudOffIcon, CopyIcon } from "./icons";
import { t } from "../i18n";

export function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable: user can select manually */ }
  };
  return (
    <div className="flex gap-2">
      <Input readOnly value={value} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
      <Button type="button" variant="outline" onClick={copy} className="shrink-0">
        {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
        {copied ? t("common.copied") : t("common.copy")}
      </Button>
    </div>
  );
}

export function HouseholdSwitcher() {
  const { meResponse, hid } = useHousehold();
  if (meResponse.households.length < 2) return null;
  return (
    <Select aria-label={t("nav.household")} value={hid} onChange={(e) => selectHousehold(Number(e.target.value))} className="h-8 max-w-40 md:max-w-none">
      {meResponse.households.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
    </Select>
  );
}

/** "offline · N pending" / "syncing N" indicator. */
export function SyncStatus() {
  const { hid } = useHousehold();
  const online = useOnline();
  const { count } = usePendingOps(hid);
  if (online && count === 0) return null;
  return (
    <Badge tone="warning" className="items-center gap-1 whitespace-nowrap">
      {!online && <CloudOffIcon className="size-3.5" />}
      {online ? t("sync.syncing", { count }) : count ? t("sync.offlinePending", { count }) : t("sync.offline")}
    </Badge>
  );
}

const NOTICES: Record<string, () => string> = {
  "invalid-recovery": () => t("notice.invalidRecovery"),
};

/** Shows a notice for `?error=` set by server redirects. */
export function ErrorNotice() {
  const [params, setParams] = useSearchParams();
  const code = params.get("error");
  if (!code) return null;
  const dismiss = () => setParams((p) => { p.delete("error"); return p; }, { replace: true });
  return (
    <Card className="mb-4 flex items-start gap-3 border-warning/40 bg-warning/10 text-sm">
      <p className="flex-1">{NOTICES[code]?.() ?? t("notice.generic", { code })}</p>
      <Button variant="ghost" className="h-7 px-2" onClick={dismiss}>{t("common.dismiss")}</Button>
    </Card>
  );
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <h1 className="mr-auto text-2xl font-semibold">{title}</h1>
      {children}
    </div>
  );
}

/** Renders a translated string, replacing `{key}` placeholders with React nodes (e.g. bold names or amounts). */
export function Rich({ text, values }: { text: string; values: Record<string, ReactNode> }) {
  const parts = text.split(/\{(\w+)\}/g);
  return <>{parts.map((p, i) => <Fragment key={i}>{i % 2 ? (p in values ? values[p] : `{${p}}`) : p}</Fragment>)}</>;
}
