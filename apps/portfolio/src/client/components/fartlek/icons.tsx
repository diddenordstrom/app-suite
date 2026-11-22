type P = { className?: string };
const base = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

/** Small line icons for the Fartlek page's four pillars, drawn like ../icons.tsx. */
export const Gift = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M4 11h16v9H4zM3 7h18v4H3zM12 7v13" />
    <path d="M12 7C10.5 4 7 4 7 5.8 7 7 9 7 12 7Zm0 0c1.5-3 5-3 5-1.2C17 7 15 7 12 7Z" />
  </svg>
);
export const Code = ({ className }: P) => (
  <svg {...base} className={className}><path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" /></svg>
);
export const Sigma = ({ className }: P) => (
  <svg {...base} className={className}><path d="M17 5H6l6 7-6 7h11" /></svg>
);
export const Book = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5ZM20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5Z" />
  </svg>
);
export const ArrowLeft = ({ className }: P) => (
  <svg {...base} strokeWidth={2.2} className={className}><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
);
export const Chevron = ({ className }: P) => (
  <svg {...base} strokeWidth={2.2} className={className}><path d="m6 9 6 6 6-6" /></svg>
);
