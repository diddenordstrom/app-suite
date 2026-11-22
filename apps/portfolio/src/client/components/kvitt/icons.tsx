type P = { className?: string };
const base = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

/** Line icons for the Kvitt page, drawn like ../icons.tsx. Gift, Code, ArrowLeft and Chevron come from ../fartlek/icons. */
export const NoAds = ({ className }: P) => (
  <svg {...base} className={className}><circle cx="12" cy="12" r="9" /><path d="m5.6 5.6 12.8 12.8" /></svg>
);
export const Shield = ({ className }: P) => (
  <svg {...base} className={className}><path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6Z" /><path d="m9 12 2 2 4-4" /></svg>
);
export const Link = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </svg>
);
export const Plane = ({ className }: P) => (
  <svg {...base} className={className}><path d="M3 13.5 21 5l-4.5 15-4-6-6 4 1.5-5.5Z" /></svg>
);
export const Repeat = ({ className }: P) => (
  <svg {...base} className={className}><path d="M17 2l4 4-4 4" /><path d="M3 12V10a4 4 0 0 1 4-4h14M7 22l-4-4 4-4" /><path d="M21 12v2a4 4 0 0 1-4 4H3" /></svg>
);
export const Heart = ({ className }: P) => (
  <svg {...base} className={className}><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" /></svg>
);
export const Phone = ({ className }: P) => (
  <svg {...base} className={className}><rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M11 18h2" /></svg>
);
export const Arrows = ({ className }: P) => (
  <svg {...base} className={className}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);
export const Check = ({ className }: P) => (
  <svg {...base} strokeWidth={2.4} className={className}><path d="m5 12 5 5 9-10" /></svg>
);
