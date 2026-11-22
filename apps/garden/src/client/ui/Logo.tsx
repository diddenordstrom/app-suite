/** Autarki mark: a sprout with one leaf in the signature moss, on the suite's brand tile. Keep in sync with public/favicon.svg. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-label="Autarki" role="img">
      <rect width="32" height="32" rx="9" fill="var(--brand)" />
      <path d="M16 25v-9" fill="none" stroke="var(--brand-foreground)" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M16 17c0-4.5-3-7-7.5-7 0 4.5 3 7 7.5 7Z" fill="var(--brand-foreground)" />
      <path d="M16 14c0-4 2.7-6.5 7.5-6.5 0 4-2.7 6.5-7.5 6.5Z" fill="var(--signature)" />
    </svg>
  );
}
