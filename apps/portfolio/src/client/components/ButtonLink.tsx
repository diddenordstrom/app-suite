import type { AnchorHTMLAttributes } from "react";
import { cn } from "../ui";

/** A link that looks like a button. The inverse variants sit on the primary-coloured hero panel. */
const variants = {
  primary: "bg-primary text-primary-foreground hover:opacity-90",
  outline: "border-border text-foreground hover:bg-accent",
  inverse: "bg-primary-foreground text-primary hover:opacity-90",
  inverseOutline: "border-primary-foreground/50 text-primary-foreground hover:bg-primary-foreground/10",
};

export function ButtonLink({ variant = "primary", className, ...p }: AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: keyof typeof variants }) {
  return (
    <a
      className={cn("inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-transparent px-5 text-[15px] font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring", variants[variant], className)}
      {...p}
    />
  );
}
