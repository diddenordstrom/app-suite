import type { ReactNode, SVGProps } from "react";
import { cn } from "../ui";

function Icon({ className, children, ...p }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={cn("size-5", className)} {...p}>
      {children}
    </svg>
  );
}

type P = { className?: string };
export const ListsIcon = (p: P) => <Icon {...p}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></Icon>;
export const CartIcon = (p: P) => <Icon {...p}><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /><path d="M2 3h3l2.7 12.4a1.5 1.5 0 0 0 1.5 1.1h8.6a1.5 1.5 0 0 0 1.5-1.2L21 8H6" /></Icon>;
export const ReceiptIcon = (p: P) => <Icon {...p}><path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z" /><path d="M9 8h6M9 12h6" /></Icon>;
export const ScaleIcon = (p: P) => <Icon {...p}><path d="M12 3v18M5 21h14M4 7h16" /><path d="M4 7l-2.5 6a3 3 0 0 0 5 0z" /><path d="M20 7l-2.5 6a3 3 0 0 0 5 0z" /></Icon>;
export const ChartIcon = (p: P) => <Icon {...p}><path d="M4 20h16" /><path d="M7 16v-5M12 16V6M17 16v-8" /></Icon>;
export const GearIcon = (p: P) => <Icon {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></Icon>;
export const PlusIcon = (p: P) => <Icon {...p}><path d="M12 5v14M5 12h14" /></Icon>;
export const CheckIcon = (p: P) => <Icon {...p}><path d="M5 12l5 5L20 7" /></Icon>;
export const TrashIcon = (p: P) => <Icon {...p}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></Icon>;
export const CopyIcon = (p: P) => <Icon {...p}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></Icon>;
export const SkipIcon = (p: P) => <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M6 18L18 6" /></Icon>;
export const CloudOffIcon = (p: P) => <Icon {...p}><path d="M3 3l18 18M8 6.3A6 6 0 0 1 17.7 10H18a4 4 0 0 1 2.2 7.3M17 18H7a5 5 0 0 1-1.8-9.7" /></Icon>;
export const UndoIcon = (p: P) => <Icon {...p}><path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></Icon>;
export const CarIcon = (p: P) => <Icon {...p}><path d="M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11" /><rect x="3" y="11" width="18" height="6" rx="2" /><circle cx="7.5" cy="17" r="2" /><circle cx="16.5" cy="17" r="2" /></Icon>;
