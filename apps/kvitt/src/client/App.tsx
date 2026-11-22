import { useState } from "react";
import { Link, Route, Routes } from "react-router-dom";
import { AppShell, Badge, DemoBanner, Dialog, Logo, type NavItem } from "./ui";
import { ExpenseForm } from "./components/ExpenseForm";
import { HouseholdProvider, useHousehold, useMe } from "./household";
import { ErrorNotice, HouseholdSwitcher, SyncStatus } from "./components/common";
import { CartIcon, ChartIcon, GearIcon, ListsIcon, PlusIcon, ReceiptIcon, ScaleIcon } from "./components/icons";
import { ErrorScreen, LoadingScreen, Welcome } from "./pages/Welcome";
import { Join } from "./pages/Join";
import { Lists } from "./pages/Lists";
import { TripPage } from "./pages/Trip";
import { History } from "./pages/History";
import { Balances } from "./pages/Balances";
import { Settings } from "./pages/Settings";
import { Stats } from "./pages/Stats";
import { t } from "./i18n";
import { api, clearCache } from "./api";

const nav: NavItem[] = [
  { to: "/", label: t("nav.lists"), icon: <ListsIcon /> },
  { to: "/trip", label: t("nav.trip"), icon: <CartIcon /> },
  { to: "/history", label: t("nav.history"), icon: <ReceiptIcon /> },
  { to: "/balances", label: t("nav.balances"), icon: <ScaleIcon /> },
  { to: "/stats", label: t("nav.stats"), icon: <ChartIcon />, desktopOnly: true }, // phones reach it from Balances
  { to: "/settings", label: t("nav.settings"), icon: <GearIcon />, desktopOnly: true },
];

export function App() {
  return (
    <Routes>
      <Route path="/join/:code" element={<Join />} />
      <Route path="*" element={<Gate />} />
    </Routes>
  );
}

function Gate() {
  const me = useMe();
  if (me.loading) return <LoadingScreen />;
  if (!me.data) return <ErrorScreen message={me.error?.message ?? t("error.generic")} retry={() => void me.refetch()} />;
  if (me.data.households.length === 0) return <Welcome me={me.data} />;
  return (
    <HouseholdProvider
      me={me.data}
      loading={<LoadingScreen />}
      error={(message, retry) => <ErrorScreen message={message} retry={retry} />}
    >
      <Shell />
    </HouseholdProvider>
  );
}

function Shell() {
  const { detail, me, meResponse } = useHousehold();
  const [adding, setAdding] = useState(false);
  return (
    <AppShell
      title="Kvitt"
      logo={Logo}
      nav={nav}
      action={{ label: t("expense.add"), icon: <PlusIcon className="size-6 md:size-4" />, onClick: () => setAdding(true) }}
      header={<><SyncStatus /><HouseholdSwitcher /><Link to="/settings" aria-label={t("nav.settings")} className="inline-flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent md:hidden"><GearIcon /></Link></>}
      footer={
        <div className="space-y-1 text-xs text-muted-foreground">
          {meResponse.authMode === "dev" && <Badge tone="warning">{t("shell.devMode")}</Badge>}
          {meResponse.authMode === "demo" && <Badge tone="signature">{t("demo.mode")}</Badge>}
          <div className="font-medium text-foreground">{detail.name}</div>
          <div>{me.name}{me.role === "admin" ? ` · ${t("role.admin")}` : ""}</div>
        </div>
      }
    >
      {meResponse.authMode === "demo" && <DemoBanner onEnd={endDemo} />}
      <ErrorNotice />
      <Routes>
        <Route path="/" element={<Lists />} />
        <Route path="/trip" element={<TripPage />} />
        <Route path="/history" element={<History />} />
        <Route path="/expenses" element={<History />} />
        <Route path="/balances" element={<Balances />} />
        <Route path="/stats" element={<Stats />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Lists />} />
      </Routes>
      <Dialog open={adding} onClose={() => setAdding(false)} title={t("expense.add")}>
        {adding && <ExpenseForm onDone={() => setAdding(false)} />}
      </Dialog>
    </AppShell>
  );
}

/** Ending the demo deletes the visitor's demo database (server-kit) and drops the cached copy here. */
async function endDemo() {
  try { await api("POST", "/auth/logout"); } catch { /* ignore */ }
  clearCache();
  location.href = "/";
}
