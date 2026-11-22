/** Brygga's mark: a bridge arc in the signature colour over a deck, on the suite's brand tile. Keep in sync with public/icon.svg. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--brand)" />
      <path d="M6 20 Q16 6 26 20" fill="none" stroke="var(--signature)" strokeWidth="3" strokeLinecap="round" />
      <path d="M5 21h22" stroke="var(--brand-foreground)" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M11 15v6M16 12.5v8.5M21 15v6" stroke="var(--brand-foreground)" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
