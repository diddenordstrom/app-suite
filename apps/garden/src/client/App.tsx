import { useEffect, useState } from "react";
import { Link, Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { AppShell, Badge, Button, Dialog, Logo, Spinner, cn, type NavItem } from "./ui";
import { HouseholdProvider, useHousehold } from "./household";
import { HouseholdSwitcher } from "./components/HouseholdSwitcher";
import { NavIcon, type NavIconName } from "./components/NavIcon";
import { ErrorToasts, reportError } from "./toast";
import { t, type MsgKey } from "./i18n";
import { Dashboard } from "./pages/Dashboard";
import { GardenMap } from "./pages/GardenMap";
import { Locations } from "./pages/Locations";
import { LocationDetail } from "./pages/LocationDetail";
import { Plantings } from "./pages/Plantings";
import { PlantingDetail } from "./pages/PlantingDetail";
import { Calendar } from "./pages/Calendar";
import { Crops } from "./pages/Crops";
import { Seeds } from "./pages/Seeds";
import { Storage } from "./pages/Storage";
import { Suggestions } from "./pages/Suggestions";
import { Finances } from "./pages/Finances";
import { Settings } from "./pages/Settings";
import { Join } from "./pages/Join";

interface GardenNav { to: string; key: string; icon: NavIconName }

/** On the phone tab bar. */
const primary: GardenNav[] = [
  { to: "/", key: "dashboard", icon: "home" },
  { to: "/plantings", key: "plantings", icon: "seedling" },
  { to: "/locations", key: "locations", icon: "map" },
  { to: "/calendar", key: "calendar", icon: "calendar" },
];
/** In the sidebar on larger screens, and behind the menu button on phones. */
const secondary: GardenNav[] = [
  { to: "/garden", key: "garden", icon: "grid" },
  { to: "/storage", key: "storage", icon: "box" },
  { to: "/crops", key: "crops", icon: "leaf" },
  { to: "/seeds", key: "seeds", icon: "seeds" },
  { to: "/suggestions", key: "suggestions", icon: "lightbulb" },
  { to: "/finances", key: "finances", icon: "wallet" },
  { to: "/settings", key: "settings", icon: "settings" },
];
const label = (n: GardenNav) => t(`nav.${n.key}.label` as MsgKey);

const nav: NavItem[] = [
  ...primary.map((n) => ({ to: n.to, label: label(n), icon: <NavIcon icon={n.icon} /> })),
  ...secondary.map((n) => ({ to: n.to, label: label(n), icon: <NavIcon icon={n.icon} />, desktopOnly: true })),
];

// Unhandled failures (a rejected action nobody caught) still reach the user as a toast.
if (typeof window !== "undefined") window.addEventListener("unhandledrejection", (e) => reportError(e.reason));

export function App() {
  return (
    <>
      <ErrorToasts />
      <Routes>
        <Route path="/join/:code" element={<Join />} />
        <Route path="*" element={
          <HouseholdProvider loading={<LoadingScreen />} error={(message, retry) => <ErrorScreen message={message} retry={retry} />}>
            <Shell />
          </HouseholdProvider>
        } />
      </Routes>
    </>
  );
}

function LoadingScreen() {
  return <div className="grid min-h-dvh place-items-center"><Spinner className="size-6" /></div>;
}

function ErrorScreen({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center">
      <div className="space-y-3">
        <Logo className="mx-auto size-10" />
        <p role="alert" className="text-sm text-danger">{message}</p>
        <Button variant="outline" onClick={retry}>{t("common.tryAgain")}</Button>
      </div>
    </div>
  );
}

/** Phones: the menu button in the header opens the pages that don't fit the tab bar. */
function MenuButton() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);
  return (
    <>
      <button type="button" data-testid="hamburger-btn" aria-label={t("header.openMenu.ariaLabel")} onClick={() => setOpen(true)}
        className="inline-flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent md:hidden">
        <svg className="size-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={t("app.title")}>
        <nav data-testid="sidenav-sheet" aria-label={t("sidenav.ariaLabel")} className="flex flex-col gap-1">
          {secondary.map((n) => (
            <NavLink key={n.to} to={n.to} onClick={() => setOpen(false)}
              className={({ isActive }) => cn("flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium", isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent")}>
              <NavIcon icon={n.icon} />{label(n)}
            </NavLink>
          ))}
        </nav>
      </Dialog>
    </>
  );
}

function Shell() {
  const { me, user, current } = useHousehold();
  const { pathname } = useLocation();
  const fullBleed = pathname === "/garden";
  return (
    <AppShell
      title={t("app.title")}
      logo={Logo}
      nav={nav}
      header={<><HouseholdSwitcher /><MenuButton /></>}
      mainClassName={fullBleed ? "max-w-none p-0 md:p-0" : undefined}
      footer={
        <div className="space-y-1 text-xs text-muted-foreground">
          {me.authMode === "dev" && <Badge tone="warning">{t("shell.devMode")}</Badge>}
          <div className="font-medium text-foreground">{current.name}</div>
          <div>{user.name ?? user.email}</div>
        </div>
      }
    >
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/garden" element={<GardenMap />} />
        <Route path="/locations" element={<Locations />} />
        <Route path="/locations/:id" element={<LocationDetail />} />
        <Route path="/plantings" element={<Plantings />} />
        <Route path="/plantings/:id" element={<PlantingDetail />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/crops" element={<Crops />} />
        <Route path="/seeds" element={<Seeds />} />
        <Route path="/storage" element={<Storage />} />
        <Route path="/suggestions" element={<Suggestions />} />
        <Route path="/finances" element={<Finances />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/household" element={<Navigate to="/settings" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppShell>
  );
}

function NotFound() {
  return (
    <div className="space-y-3 py-12 text-center">
      <h1 className="text-xl font-semibold">{t("error.notFound")}</h1>
      <Link to="/" className="text-sm text-primary underline">{t("nav.dashboard.label")}</Link>
    </div>
  );
}
