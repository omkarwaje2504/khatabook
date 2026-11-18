import Link from "next/link";
import { getMonthView, getPreviousMonth, type MonthView, type PreviousMonth } from "@/lib/data";
import { monthLabel, shiftMonth } from "@/lib/month";
import { logout } from "../login/actions";
import { ThemeToggle } from "./feedback";
import { AlertIcon, ChevronLeftIcon, ChevronRightIcon, HomeIcon, LogOutIcon, Logo, WalletIcon } from "./icons";
import { card, iconBtn } from "./styles";

export type Loaded =
  | { ok: true; view: MonthView | null; previous: PreviousMonth | null }
  | { ok: false; error: string };

export async function loadMonth(month: string): Promise<Loaded> {
  try {
    const view = await getMonthView(month);
    const previous = view ? null : await getPreviousMonth(month);
    return { ok: true, view, previous };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const TABS = [
  { key: "home", label: "Home part", path: "/", Icon: HomeIcon },
  { key: "savings", label: "My savings", path: "/savings", Icon: WalletIcon },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/** Sticky top bar: logo (home link), page tabs, theme switch and log out. */
export function Header({ active, month }: { active: TabKey; month?: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-stone-200/70 bg-page/80 backdrop-blur-lg">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5 sm:flex-nowrap sm:px-6">
        <Link href="/" className="flex items-center gap-2 rounded-lg font-semibold tracking-tight text-stone-900">
          <Logo className="size-8" />
          <span>Khatabook</span>
        </Link>

        <nav aria-label="Pages"
          className="order-last grid w-full grid-cols-2 gap-1 rounded-xl bg-stone-200/60 p-1 sm:order-none sm:mx-auto sm:w-auto">
          {TABS.map(({ key, label, path, Icon }) => (
            <Link key={key} href={key === "home" && month ? `/?m=${month}` : path}
              aria-current={key === active ? "page" : undefined}
              className={`flex items-center justify-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium transition ${
                key === active ? "bg-surface text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-900"
              }`}>
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5 sm:ml-0">
          <ThemeToggle />
          <form action={logout}>
            <button type="submit" className={iconBtn} title="Log out">
              <LogOutIcon />
              <span className="sr-only">Log out</span>
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}

/** Previous / next month, with a shortcut back to the current month. */
export function MonthSwitcher({ month, path = "/" }: { month: string; path?: string }) {
  return (
    <nav aria-label="Month" className="mb-4 flex items-center justify-between gap-2">
      <div className="flex items-center gap-1">
        <Link href={`${path}?m=${shiftMonth(month, -1)}`} className={iconBtn} title="Previous month">
          <ChevronLeftIcon />
          <span className="sr-only">Previous month</span>
        </Link>
        <h1 className="min-w-36 text-center text-lg font-semibold tracking-tight text-stone-900 sm:text-xl">
          {monthLabel(month)}
        </h1>
        <Link href={`${path}?m=${shiftMonth(month, 1)}`} className={iconBtn} title="Next month">
          <ChevronRightIcon />
          <span className="sr-only">Next month</span>
        </Link>
      </div>
      <Link href={path} className="rounded-lg px-2.5 py-1 text-xs font-medium text-indigo-600 transition hover:bg-indigo-50">
        This month
      </Link>
    </nav>
  );
}

/** Page body width and padding, shared by every page. */
export function Main({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-3 pt-4 pb-20 sm:px-6 sm:pt-6">
      {children}
    </main>
  );
}

export function DbDown({ error }: { error: string }) {
  return (
    <section className={`${card} border-red-300`}>
      <h2 className="flex items-center gap-2 text-base font-semibold text-red-600">
        <AlertIcon /> Can&apos;t reach the database
      </h2>
      <p className="mt-2 text-sm text-stone-600">
        The database did not answer. Reload in a moment; if it keeps happening, check{" "}
        <code className="rounded bg-stone-100 px-1.5 py-0.5">DATABASE_URL</code> in{" "}
        <code className="rounded bg-stone-100 px-1.5 py-0.5">.env.local</code>.
      </p>
      <p className="mt-3 break-words font-mono text-xs text-stone-500">{error}</p>
    </section>
  );
}

export function Stat({
  label,
  value,
  warn = false,
  tone = "",
}: {
  label: string;
  value: string;
  warn?: boolean;
  /** Extra classes for the tile, e.g. a tinted background. */
  tone?: string;
}) {
  return (
    <div className={`min-w-0 rounded-xl px-2.5 py-2 sm:px-3 ${tone || "bg-stone-50"}`}>
      <dt className="truncate text-[10px] font-medium text-stone-500 sm:text-xs">{label}</dt>
      <dd className={`truncate text-sm font-semibold tabular-nums sm:text-base ${warn ? "text-red-600" : "text-stone-900"}`}>
        {value}
      </dd>
    </div>
  );
}
