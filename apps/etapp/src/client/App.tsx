import { Link, Route, Routes } from "react-router-dom";
import { AppShell, Badge, DemoBanner, Logo, type NavItem } from "./ui";
import { TripProvider, useMe, useTrip } from "./trip";
import { ErrorNotice, SyncStatus, TripSwitcher } from "./components/common";
import { DaysIcon, GearIcon, IdeaIcon, MapIcon, PackIcon, PlusIcon } from "./components/icons";
import { AddSheet } from "./components/AddSheet";
import { openAdd } from "./addSheet";
import { ErrorScreen, LoadingScreen, Welcome } from "./pages/Welcome";
import { Join } from "./pages/Join";
import { Days } from "./pages/Days";
import { Ideas } from "./pages/Ideas";
import { MapPage } from "./pages/MapPage";
import { Pack } from "./pages/Pack";
import { Settings } from "./pages/Settings";
import { t } from "./i18n";
import { api, clearCache } from "./api";

const nav: NavItem[] = [
  { to: "/", label: t("nav.days"), icon: <DaysIcon /> },
  { to: "/ideas", label: t("nav.ideas"), icon: <IdeaIcon /> },
  { to: "/map", label: t("nav.map"), icon: <MapIcon /> },
  { to: "/pack", label: t("nav.pack"), icon: <PackIcon /> },
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
  if (me.data.trips.length === 0) return <Welcome me={me.data} />;
  return (
    <TripProvider
      me={me.data}
      loading={<LoadingScreen />}
      error={(message, retry) => <ErrorScreen message={message} retry={retry} />}
    >
      <Shell />
    </TripProvider>
  );
}

function Shell() {
  const { detail, me, meResponse } = useTrip();
  return (
    <AppShell
      title="Etapp"
      logo={Logo}
      nav={nav}
      action={{ label: t("shell.add"), icon: <PlusIcon />, onClick: () => openAdd(location.pathname === "/ideas" ? "idea" : "stop") }}
      header={<><SyncStatus /><TripSwitcher /><Link to="/settings" aria-label={t("nav.settings")} className="inline-flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent md:hidden"><GearIcon /></Link></>}
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
        <Route path="/" element={<Days />} />
        <Route path="/ideas" element={<Ideas />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/pack" element={<Pack />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Days />} />
      </Routes>
      <AddSheet />
    </AppShell>
  );
}

/** Ending the demo deletes the visitor's demo database (server-kit) and drops the cached copy here. */
async function endDemo() {
  try { await api("POST", "/auth/logout"); } catch { /* ignore */ }
  clearCache();
  location.href = "/";
}
