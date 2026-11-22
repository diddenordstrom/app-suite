import { Route, Routes } from "react-router-dom";
import { AppShell, Badge, Button, Card, DemoBanner, DemoSignIn, Logo, WhatsNew, type NavItem } from "./ui";
import { useAuth } from "./auth";
import { t } from "./i18n";
import { SettingsProvider } from "./prefs";
import { SyncProvider } from "./garminSync";
import { GearIcon } from "./bits";
import { FartlekTours, OnboardingAuto } from "./guide";
import { NEWS } from "./news";
import { Home } from "./pages/Home";
import { Plan } from "./pages/Plan";
import { Races } from "./pages/Races";
import { Activities, ActivityPage } from "./pages/Activities";
import { Trends } from "./pages/Trends";
import { Settings } from "./pages/Settings";

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
);

const nav = (): NavItem[] => [
  { to: "/", tour: "nav-home", label: t("nav.home"), icon: <Icon d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /> },
  { to: "/plan", tour: "nav-plan", label: t("nav.plan"), icon: <Icon d="M4 5h16v15H4zM4 9h16M8 3v4M16 3v4" /> },
  { to: "/activities", tour: "nav-activities", label: t("nav.activities"), icon: <Icon d="M3 12h4l3-8 4 16 3-8h4" /> },
  { to: "/trends", tour: "nav-trends", label: t("nav.trends"), icon: <Icon d="M4 19V5M4 19h16M8 15l4-4 3 3 5-6" /> },
  { to: "/settings", tour: "nav-settings", label: t("nav.settings"), icon: <GearIcon className="size-5" />, desktopOnly: true },
];

export function App() {
  const { user, loading, devMode, demoMode, logout } = useAuth();
  if (loading) return <div className="p-8 text-muted-foreground">{t("common.loading")}…</div>;
  if (!user) return <SignIn />;
  return (
    <SettingsProvider>
    <SyncProvider enabled={!demoMode}>
    <FartlekTours>
    <OnboardingAuto demo={demoMode} />
    <WhatsNew app="Fartlek" entries={NEWS} />
      <AppShell
        title="Fartlek"
        logo={Logo}
        nav={nav()}
        mainClassName="max-w-7xl"
        footer={
          <div className="space-y-2 text-xs text-muted-foreground">
            {devMode && <Badge tone="warning">{t("shell.devMode")}</Badge>}
            {demoMode ? <Badge tone="signature">{t("demo.mode")}</Badge> : <div>{user.name ?? user.email}</div>}
            {!devMode && <Button variant="outline" className="h-8 w-full" onClick={logout}>{demoMode ? t("demo.end") : t("settings.signOut")}</Button>}
          </div>
        }
      >
        {demoMode && <DemoBanner onEnd={logout} />}
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/plan" element={<Plan />} />
          <Route path="/plan/races" element={<Races />} />
          <Route path="/activities" element={<Activities />} />
          <Route path="/activities/:id" element={<ActivityPage />} />
          <Route path="/trends" element={<Trends />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<p className="text-muted-foreground">{t("app.notFound")}</p>} />
        </Routes>
      </AppShell>
    </FartlekTours>
    </SyncProvider>
    </SettingsProvider>
  );
}

function SignIn() {
  return (
    <div className="grid min-h-dvh place-items-center p-4">
      <Card className="w-full max-w-sm space-y-4 text-center">
        <h1 className="text-lg font-semibold">Fartlek</h1>
        <p className="text-sm text-muted-foreground">{t("app.tagline")}</p>
        <Button className="w-full" onClick={() => (location.href = "/api/auth/login")}>{t("app.signIn")}</Button>
        <DemoSignIn />
      </Card>
    </div>
  );
}
