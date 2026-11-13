import type { Metadata } from "next";
import { connection } from "next/server";
import { requireSession } from "@/lib/auth";
import { addAccount, addHead, startMonth } from "@/app/actions";
import type { AccountView, MonthView, PreviousMonth } from "@/lib/data";
import { monthLabel, parseMonth, rupees } from "@/lib/month";
import { DbDown, Header, Main, MonthSwitcher, Stat, loadMonth } from "./ui/common";
import { AccountCard, AccountSelect, HeadRow, SplitEditor, SplitFields, Submit, type AccountOption } from "./ui/controls";
import { ActionForm, Disclosure, DisclosureCancel } from "./ui/feedback";
import { HomeIcon, PlusIcon } from "./ui/icons";
import { PART, card, cardBase, eyebrow, inputCls, labelCls, primaryBtn } from "./ui/styles";

// Every render reads live data from the database, so there is nothing to prerender.
export const instant = false;

export const metadata: Metadata = {
  title: "Home part",
  description: "This month's salary split and the home part's heads.",
};

const DEFAULT_SALARY = 84000;
const DEFAULT_HOME = 54000;

export default async function HomePage({ searchParams }: PageProps<"/">) {
  await connection(); // "this month" depends on the request time
  await requireSession();
  const month = parseMonth((await searchParams).m);
  const data = await loadMonth(month);

  return (
    <>
      <Header active="home" month={month} />
      <Main>
        <MonthSwitcher month={month} />
        {!data.ok ? (
          <DbDown error={data.error} />
        ) : !data.view ? (
          <StartMonth month={month} previous={data.previous} />
        ) : (
          <HomeContent view={data.view} />
        )}
      </Main>
    </>
  );
}

function HomeContent({ view }: { view: MonthView }) {
  // Home heads can only send money to home accounts, e.g. Mom's account.
  const homeAccounts = view.accounts.filter((a) => !a.inSavings);
  const options: AccountOption[] = homeAccounts.map(({ id, name }) => ({ id, name }));

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <HomePanel view={view} accounts={options} />
      <HomeAccounts accounts={homeAccounts} />
    </div>
  );
}

function StartMonth({ month, previous }: { month: string; previous: PreviousMonth | null }) {
  return (
    <section className={`${card} mx-auto max-w-xl`}>
      <span className="inline-flex size-10 items-center justify-center rounded-xl bg-amber-100 text-lg text-amber-900">
        <HomeIcon />
      </span>
      <h2 className="mt-3 text-lg font-semibold text-stone-900">Start {monthLabel(month)}</h2>
      <p className="mt-1 text-sm text-stone-500">
        {previous
          ? `Enter this month's salary. The split and home heads are copied from ${monthLabel(previous.month)}; you can change them afterwards.`
          : "Enter this month's salary and how much of it goes to home."}{" "}
        The rest goes to My savings.
      </p>
      <ActionForm action={startMonth} success={`${monthLabel(month)} started`} className="mt-5">
        <input type="hidden" name="month" value={month} />
        <SplitFields
          salary={previous?.salary ?? DEFAULT_SALARY}
          homeAmount={previous?.homeAmount ?? DEFAULT_HOME}
        />
        <Submit className={`${primaryBtn} mt-5 w-full sm:w-auto`}>Start month</Submit>
      </ActionForm>
    </section>
  );
}

/** Salary, its split, and the home part's heads, all in one card. */
function HomePanel({ view, accounts }: { view: MonthView; accounts: AccountOption[] }) {
  const { month, home: part } = view;
  const left = part.allotted - part.used;
  const unassigned = part.allotted - part.planned;
  const usedPct = part.allotted > 0 ? Math.round((part.used / part.allotted) * 100) : 0;
  const done = part.heads.filter((h) => h.planned > 0 && h.used >= h.planned).length;
  const homePct = view.salary > 0 ? (view.homeAmount / view.salary) * 100 : 0;

  return (
    <section className={`${cardBase} overflow-hidden`}>
      {/* Salary banner */}
      <div className="bg-linear-to-br from-amber-50 via-amber-50/60 to-transparent p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className={eyebrow}>Salary</p>
            <p className="mt-0.5 text-3xl font-semibold tracking-tight tabular-nums text-stone-900 sm:text-4xl">
              {rupees(view.salary)}
            </p>
          </div>
          <SplitEditor month={month} salary={view.salary} homeAmount={view.homeAmount} />
        </div>
        <div className="mt-4 flex h-2 gap-0.5 overflow-hidden rounded-full bg-stone-200/60">
          <div className={PART.home.bar} style={{ width: `${homePct}%` }} />
          <div className={`${PART.mine.bar} flex-1`} />
        </div>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs tabular-nums text-stone-500">
          {[view.home, view.mine].map((p) => (
            <p key={p.part} className="flex items-center gap-1.5">
              <span className={`size-2 shrink-0 rounded-full ${PART[p.part].dot}`} />
              {p.part === "home" ? "Home part" : "My savings"}
              <span className="font-semibold text-stone-900">{rupees(p.allotted)}</span>
            </p>
          ))}
        </div>
      </div>

      <div className="p-4 pt-3 sm:p-5 sm:pt-4">
        <dl className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 sm:gap-2">
          <Stat label="Spent" value={rupees(part.used - part.saved)} />
          <Stat label="Put aside" value={rupees(part.saved)} />
          <Stat label="Left" value={rupees(left)} warn={left < 0} tone={left < 0 ? "bg-red-50" : "bg-emerald-50"} />
          <Stat
            label={unassigned < 0 ? "Over-planned" : "Unplanned"}
            value={rupees(Math.abs(unassigned))}
            warn={unassigned < 0}
          />
        </dl>
        <div className="mt-3">
          <div className="flex justify-between text-[11px] tabular-nums text-stone-500">
            <span>{rupees(part.used)} used of {rupees(part.allotted)}</span>
            <span className={left < 0 ? "font-semibold text-red-600" : ""}>{usedPct}%</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-100">
            <div className={`h-full rounded-full transition-all ${left < 0 ? "bg-red-500" : PART.home.bar}`}
              style={{ width: `${Math.min(usedPct, 100)}%` }} />
          </div>
        </div>

        <div className="mt-5 flex items-baseline justify-between">
          <h2 className={eyebrow}>Home heads</h2>
          <p className="text-xs tabular-nums text-stone-500">
            <span className="font-semibold text-stone-900">{done}</span> of {part.heads.length} done
          </p>
        </div>
        <ul className="mt-1 divide-y divide-stone-100">
          {part.heads.map((head) => (
            <HeadRow key={head.id} head={head} accounts={accounts} />
          ))}
          {part.otherUsed > 0 && (
            <li className="flex items-center justify-between py-2 pl-9 text-sm">
              <span className="text-stone-500">Other (no head)</span>
              <span className="font-semibold tabular-nums text-stone-900">{rupees(part.otherUsed)}</span>
            </li>
          )}
          {part.heads.length === 0 && part.otherUsed === 0 && (
            <li className="py-6 text-center text-sm text-stone-500">No heads yet. Add rent, ration, bills…</li>
          )}
        </ul>

        <div className="mt-3">
          <Disclosure label={<><PlusIcon /> Add head</>}>
              <ActionForm action={addHead} success="Head added"
                className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_110px_170px_auto_auto]">
                <input type="hidden" name="month" value={month} />
                <input type="hidden" name="part" value="home" />
                <input name="name" required autoFocus maxLength={120} aria-label="New head name" placeholder="e.g. Electricity"
                  className={`${inputCls} col-span-2 sm:col-span-1`} />
                <input name="planned" type="number" inputMode="decimal" min={0} step="any" required placeholder="₹ planned"
                  aria-label="Planned amount" className={inputCls} />
                <AccountSelect accounts={accounts} defaultValue="" />
                <Submit>Add</Submit>
                <DisclosureCancel />
              </ActionForm>
          </Disclosure>
        </div>
      </div>
    </section>
  );
}

/** Accounts the home part puts money aside into, e.g. Mom's account. */
function HomeAccounts({ accounts }: { accounts: AccountView[] }) {
  return (
    <section className={card}>
      <h2 className="text-base font-semibold text-stone-900">Home accounts</h2>
      <p className="mt-0.5 text-xs text-stone-500">Link a head to one of these to send its amount there.</p>
      {accounts.length === 0 ? (
        <p className="py-4 text-sm text-stone-500">No home accounts yet.</p>
      ) : (
        <ul className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-1">
          {accounts.map((a) => (
            <AccountCard key={a.id} account={a} color={PART.home.dot} />
          ))}
        </ul>
      )}
      <div className="mt-3">
        <Disclosure label={<><PlusIcon /> Add home account</>}>
            <ActionForm action={addAccount} success="Account added" className="space-y-2">
              <input type="hidden" name="kind" value="outside" />
              <label htmlFor="home-acc" className={labelCls}>Name</label>
              <input id="home-acc" name="name" required autoFocus maxLength={120} placeholder="e.g. Mom's account" className={inputCls} />
              <div className="flex gap-2 pt-1">
                <Submit>Add</Submit>
                <DisclosureCancel />
              </div>
            </ActionForm>
        </Disclosure>
      </div>
    </section>
  );
}
