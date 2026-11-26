import { useSyncExternalStore, type ComponentType, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { cn } from "./cn";
import { SuiteLink } from "./SuiteLink";

export interface NavItem { to: string; label: string; icon: ReactNode; /** Hidden from the phone tab bar (reach it from the header instead). */ desktopOnly?: boolean; /** `data-tour` id, so a guided tour can point at this item. */ tour?: string; /** A short tag after the label in the sidebar, e.g. "New". */ badge?: string }
const desktopQuery = "(min-width: 48rem)";
/** Whether the md+ layout (sidebar) is showing; `header` is mounted only where it is visible. */
function useDesktop() {
  return useSyncExternalStore(
    (cb) => { const m = window.matchMedia(desktopQuery); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); },
    () => window.matchMedia(desktopQuery).matches,
  );
}

export interface ShellAction { label: string; icon: ReactNode; onClick: () => void }

/**
 * Sidebar on md+ screens, bottom tab bar on phones. `header` renders next to the title (switcher, status).
 * `header` is mounted once, in whichever of the two is showing.
 * `action` is the primary global action: a raised button in the middle of the phone tab bar, a button atop the sidebar.
 */
export function AppShell({ title, logo: Logo, nav, header, footer, action, mainClassName, children }: {
  title: string;
  /** The app's mark; rendered at sidebar and header size. */
  logo: ComponentType<{ className?: string }>;
  nav: NavItem[];
  header?: ReactNode;
  footer?: ReactNode;
  action?: ShellAction;
  /** Overrides on <main>, e.g. a wider max width for data-heavy apps. */
  mainClassName?: string;
  children: ReactNode;
}) {
  const link = ({ isActive }: { isActive: boolean }) =>
    cn("flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium", isActive ? "relative bg-accent text-accent-foreground before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:[background:var(--horizon-v)]" : "text-muted-foreground hover:bg-accent");
  const tab = ({ isActive }: { isActive: boolean }) =>
    cn("relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] leading-tight font-medium", isActive ? "text-primary before:absolute before:top-0 before:h-0.5 before:w-6 before:rounded-full before:bg-signature" : "text-muted-foreground");
  const desktop = useDesktop();
  const mobileNav = nav.filter((n) => !n.desktopOnly);
  const half = Math.ceil(mobileNav.length / 2);
  const tabs = (items: NavItem[]) => items.map((n) => <NavLink key={n.to} to={n.to} end={n.to === "/"} className={tab} data-tour={n.tour}>{n.icon}{n.label}</NavLink>);

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15rem_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col gap-4 border-r border-border p-4 md:flex">
        <div className="flex items-center gap-2 font-semibold"><Logo className="size-7" />{title}</div>
        {desktop && header && <div className="space-y-2">{header}</div>}
        {action && (
          <button type="button" onClick={action.onClick} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">
            {action.icon}{action.label}
          </button>
        )}
        <nav className="flex flex-1 flex-col gap-1" data-testid="sidebar-nav">
          {nav.map((n) => <NavLink key={n.to} to={n.to} end={n.to === "/"} className={link} data-tour={n.tour}>{n.icon}{n.label}{n.badge && <span className="ml-auto rounded-full bg-signature-soft px-1.5 py-0.5 text-[10px] font-semibold leading-[14px] text-signature-foreground">{n.badge}</span>}</NavLink>)}
        </nav>
        {footer}
        <SuiteLink className="px-1" />
      </aside>
      <header data-bare={!header || undefined} className="app-topbar sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-background/90 p-3 pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur md:hidden">
        <Logo className="size-6 shrink-0" />
        <span className="font-semibold">{title}</span>
        <div className="ml-auto flex min-w-0 items-center gap-2">{!desktop && header}</div>
      </header>
      <main className={cn("app-main mx-auto w-full max-w-5xl min-w-0 p-4 pb-28 md:p-8", mainClassName)}>
        {children}
        <div className="mt-10 flex justify-center md:hidden"><SuiteLink /></div>
      </main>
      <nav data-testid="bottom-nav" className="fixed inset-x-0 bottom-0 z-30 flex items-end justify-around bg-background/95 shadow-[0_-1px_0_var(--border)] pb-[max(0px,calc(env(safe-area-inset-bottom)-0.5rem))] backdrop-blur md:hidden">
        {tabs(mobileNav.slice(0, half))}
        {action && (
          <div className="flex flex-1 justify-center">
            <button type="button" onClick={action.onClick} aria-label={action.label}
              className="-mt-5 mb-1.5 inline-flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-background active:scale-95 transition">
              {action.icon}
            </button>
          </div>
        )}
        {tabs(mobileNav.slice(half))}
      </nav>
    </div>
  );
}
