/** Etapp mark: a road winding off towards an apricot sunset dot, on the suite's brand tile. Keep in sync with public/icon.svg. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-label="Etapp" role="img">
      <rect width="32" height="32" rx="9" fill="var(--brand)" />
      <path d="M10.5 25c0-5.5 9-6.5 9-11.5 0-2.5-2-3.5-2-6" fill="none" stroke="var(--brand-foreground)" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="17.5" cy="7" r="2" fill="var(--signature)" />
    </svg>
  );
}
