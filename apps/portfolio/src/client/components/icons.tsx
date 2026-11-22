type P = { className?: string };
const base = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

export const ArrowUpRight = ({ className }: P) => (
  <svg {...base} strokeWidth={2.2} className={className}><path d="M7 17 17 7M8 7h9v9" /></svg>
);
export const Check = ({ className }: P) => (
  <svg {...base} strokeWidth={2.4} className={className}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
);
export const Coffee = ({ className }: P) => (
  <svg {...base} strokeWidth={2} className={className}>
    <path d="M5 9h12v5a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5V9Z" />
    <path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H17" />
    <path d="M9 3v2M13 3v2" />
  </svg>
);
export const Pen = ({ className }: P) => (
  <svg {...base} strokeWidth={2} className={className}>
    <path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
    <path d="m14.5 7.5 3 3" />
  </svg>
);
