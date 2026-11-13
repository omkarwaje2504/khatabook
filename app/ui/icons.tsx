import type { SVGProps } from "react";

/** Small stroke icons (24px grid, drawn at 1em by default). Decorative: hidden from screen readers. */
function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false" {...props}>
      {children}
    </svg>
  );
}

type P = SVGProps<SVGSVGElement>;

export const CheckIcon = (p: P) => <Icon {...p}><path d="M20 6 9 17l-5-5" /></Icon>;
export const UndoIcon = (p: P) => <Icon {...p}><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></Icon>;
export const PencilIcon = (p: P) => <Icon {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></Icon>;
export const TrashIcon = (p: P) => <Icon {...p}><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></Icon>;
export const PlusIcon = (p: P) => <Icon {...p}><path d="M12 5v14M5 12h14" /></Icon>;
export const ChevronLeftIcon = (p: P) => <Icon {...p}><path d="m15 18-6-6 6-6" /></Icon>;
export const ChevronRightIcon = (p: P) => <Icon {...p}><path d="m9 18 6-6-6-6" /></Icon>;
export const ArrowUpIcon = (p: P) => <Icon {...p}><path d="M12 19V5M5 12l7-7 7 7" /></Icon>;
export const LogOutIcon = (p: P) => <Icon {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></Icon>;
export const SunIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Icon>
);
export const MoonIcon = (p: P) => <Icon {...p}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></Icon>;
export const HomeIcon = (p: P) => <Icon {...p}><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z" /></Icon>;
export const WalletIcon = (p: P) => (
  <Icon {...p}>
    <path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5" />
    <path d="M17 14h.01" />
  </Icon>
);
export const ReceiptIcon = (p: P) => (
  <Icon {...p}>
    <path d="M5 21V3l2 1.5L9 3l2 1.5L13 3l2 1.5L17 3l2 1.5V21l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5Z" />
    <path d="M9 9h6M9 13h6" />
  </Icon>
);
export const HandCoinsIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="15" cy="7" r="4" />
    <path d="M2 17h3l4 3h6a2 2 0 0 0 0-4h-4M5 17V13h3l3 3" />
  </Icon>
);
export const AlertIcon = (p: P) => <Icon {...p}><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></Icon>;

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" className={`animate-spin ${className}`} aria-hidden>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** The app mark: a ₹ sign in a gradient tile. */
export function Logo({ className = "size-8" }: { className?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-[28%] bg-linear-to-br from-indigo-500 to-purple-500 text-white shadow-sm shadow-indigo-500/30 ${className}`}>
      <svg viewBox="0 0 64 64" className="size-[62%]" aria-hidden>
        <path d="M20 18h24M20 27h24M27 18c8 0 13 3.5 13 9s-5 9-13 9h-6l17 12" fill="none" stroke="currentColor"
          strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
