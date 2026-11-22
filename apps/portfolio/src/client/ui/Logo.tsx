import { MarkTile } from "@homelab/ui";
/** App-suite mark: four dots, one in the signature colour, on the suite's brand tile. Keep in sync with public/icon.svg. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <MarkTile rx={9} />
      <circle cx="11" cy="11" r="3.2" fill="var(--brand-foreground)" />
      <circle cx="21" cy="11" r="3.2" fill="var(--brand-foreground)" />
      <circle cx="11" cy="21" r="3.2" fill="var(--brand-foreground)" />
      <circle cx="21" cy="21" r="3.2" fill="var(--signature)" />
    </svg>
  );
}
