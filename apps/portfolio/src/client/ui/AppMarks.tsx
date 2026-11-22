import type { ComponentType } from "react";
import type { AppId } from "@/shared/apps";

/**
 * Copies of the other apps' marks (each lives in its own apps/<id>/src/client/ui/Logo.tsx).
 * The accent reads --sg, so wrap a mark in an element with the app's `.app-<id>` class.
 * Keep in sync with the originals.
 */
type Props = { className?: string };

export function EtappMark({ className }: Props) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--brand)" />
      <path d="M10.5 25c0-5.5 9-6.5 9-11.5 0-2.5-2-3.5-2-6" fill="none" stroke="var(--brand-foreground)" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="17.5" cy="7" r="2" fill="var(--sg)" />
    </svg>
  );
}

export function FartlekMark({ className }: Props) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--brand)" />
      <circle cx="16" cy="16" r="6" fill="var(--brand-foreground)" />
      <circle cx="16" cy="16" r="2.5" fill="var(--sg)" />
    </svg>
  );
}

export function KvittMark({ className }: Props) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--brand)" />
      <path d="M12.5 12.5v-1.5a3.5 3.5 0 0 1 7 0v1.5" fill="none" stroke="var(--brand-foreground)" strokeWidth="2" strokeLinecap="round" />
      <rect x="8.5" y="12" width="15" height="12.5" rx="3" fill="var(--brand-foreground)" />
      <path d="M16 14.5v7.5" stroke="var(--sg)" strokeWidth="1.75" strokeLinecap="round" strokeDasharray="2 2.25" />
    </svg>
  );
}

/** Autarki: a sprout, one leaf white and one deep green, on the brand tile like the others. */
export function GardenMark({ className }: Props) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--brand)" />
      <path d="M16 25v-9" fill="none" stroke="var(--brand-foreground)" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M16 17c0-4.5-3-7-7.5-7 0 4.5 3 7 7.5 7Z" fill="var(--brand-foreground)" />
      <path d="M16 14c0-4 2.7-6.5 7.5-6.5 0 4-2.7 6.5-7.5 6.5Z" fill="var(--garden-leaf)" />
    </svg>
  );
}

/** Brygga: a bridge arc in its signature colour over a deck. */
export function BryggaMark({ className }: Props) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--brand)" />
      <path d="M6 20 Q16 6 26 20" fill="none" stroke="var(--sg)" strokeWidth="3" strokeLinecap="round" />
      <path d="M5 21h22" stroke="var(--brand-foreground)" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M11 15v6M16 12.5v8.5M21 15v6" stroke="var(--brand-foreground)" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export const MARKS: Record<AppId, ComponentType<Props>> = {
  etapp: EtappMark,
  fartlek: FartlekMark,
  kvitt: KvittMark,
  garden: GardenMark,
  brygga: BryggaMark,
};
