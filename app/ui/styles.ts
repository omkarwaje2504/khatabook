import type { Part } from "@/lib/db";

export const PART: Record<
  Part,
  { label: string; short: string; dot: string; bar: string; badge: string }
> = {
  home: {
    label: "Home part",
    short: "Home",
    dot: "bg-amber-500",
    bar: "bg-amber-500",
    badge: "bg-amber-100 text-amber-900",
  },
  mine: {
    label: "My part",
    short: "Savings",
    dot: "bg-indigo-500",
    bar: "bg-indigo-500",
    badge: "bg-indigo-100 text-indigo-900",
  },
};

/** One colour per savings account, in order, for its dot, bar and share of the total. */
export const ACCOUNT_COLORS = [
  "bg-indigo-500",
  "bg-sky-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-fuchsia-500",
  "bg-teal-500",
  "bg-orange-500",
  "bg-violet-500",
];

/** Input look without a width, for inputs that size themselves in a row. */
export const inputBase =
  "h-10 min-w-0 rounded-xl border border-stone-200 bg-surface px-3 text-sm text-stone-900 shadow-xs outline-none transition placeholder:text-stone-400 hover:border-stone-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15 sm:h-9 sm:rounded-lg";

export const inputCls = `${inputBase} w-full`;

export const labelCls = "mb-1 block text-xs font-medium text-stone-500";

export const primaryBtn =
  "inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 text-sm font-semibold text-surface shadow-sm transition hover:bg-stone-700 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60 sm:h-9 sm:rounded-lg";

export const ghostBtn =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-stone-200 bg-surface px-3 text-xs font-medium text-stone-700 transition hover:border-stone-300 hover:bg-stone-50 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60";

/** Small square button holding one symbol; pair it with a title and an sr-only label. */
export const iconBtn =
  "inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-stone-200 bg-surface text-sm text-stone-600 transition hover:border-stone-300 hover:bg-stone-50 hover:text-stone-900 active:scale-95 disabled:pointer-events-none disabled:opacity-60 sm:size-7 sm:text-xs";

/** Card frame without padding, for cards whose content runs to the edges. */
export const cardBase = "rounded-2xl border border-stone-200/80 bg-surface shadow-sm shadow-stone-900/[0.03]";

export const card = `${cardBase} p-4 sm:p-5`;

/** Small uppercase heading inside a card. */
export const eyebrow = "text-[11px] font-semibold uppercase tracking-wider text-stone-500";
