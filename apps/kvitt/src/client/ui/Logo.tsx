import { MarkTile } from "@homelab/ui";
/** kvitt mark: a shopping bag split down the middle (the split in the signature mint). Keep in sync with public/icon.svg. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-label="Kvitt" role="img">
      <MarkTile rx={9} />
      <path d="M12.5 12.5v-1.5a3.5 3.5 0 0 1 7 0v1.5" fill="none" stroke="var(--brand-foreground)" strokeWidth="2" strokeLinecap="round" />
      <rect x="8.5" y="12" width="15" height="12.5" rx="3" fill="var(--brand-foreground)" />
      <path d="M16 14.5v7.5" stroke="var(--signature)" strokeWidth="1.75" strokeLinecap="round" strokeDasharray="2 2.25" />
    </svg>
  );
}
