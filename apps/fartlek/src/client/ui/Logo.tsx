/** fartlek mark: a target with a coral centre (the signature colour). Keep in sync with public/icon.svg. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-label="logo" role="img">
      <rect width="32" height="32" rx="8" fill="var(--brand)" />
      <circle cx="16" cy="16" r="6" fill="var(--brand-foreground)" />
      <circle cx="16" cy="16" r="2.5" fill="var(--signature)" />
    </svg>
  );
}
