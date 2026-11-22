import { tShared } from "@homelab/i18n";
import { cn } from "./cn";

export const SUITE_URL = "https://didrik.dev";

/** A small "part of didrik.dev" link back to the portfolio, for the bottom of every app. */
export function SuiteLink({ className }: { className?: string }) {
  return (
    <a href={SUITE_URL} className={cn("group inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground", className)}>
      <svg viewBox="0 0 24 24" className="size-3.5 text-signature transition-transform group-hover:rotate-12" fill="currentColor" aria-hidden>
        <path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z" />
      </svg>
      <span>{tShared("shell.partOf")}</span>
    </a>
  );
}
