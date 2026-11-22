import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { cn } from "../../../ui";

/**
 * Where a live Fartlek screen sits: Fartlek's tokens (.fartlek-ui), the app background, and a
 * router so its links render (they go nowhere here). "phone" is a narrow device, "card" a wide panel.
 */
export function Frame({ kind, label, className, children }: { kind: "phone" | "card"; label: string; className?: string; children: ReactNode }) {
  return (
    <figure aria-label={label} className={cn("fartlek-ui", kind === "phone" ? "w-full max-w-[360px] rounded-[44px] bg-bezel p-2 shadow-xl" : "w-full rounded-[22px] border border-border shadow-lg", className)}>
      <div className={cn("bg-background text-foreground", kind === "phone" ? "space-y-3 rounded-[36px] px-3 pt-6 pb-5" : "rounded-[21px] p-3 sm:p-4")}>
        <MemoryRouter>{children}</MemoryRouter>
      </div>
    </figure>
  );
}
