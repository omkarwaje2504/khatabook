import type { Metadata } from "next";
import { connection } from "next/server";
import { requireSession } from "@/lib/auth";
import { addAccount, addExpense, deleteEntry } from "@/app/actions";
import { getSavings, type AccountView, type EntryView, type SavingsData } from "@/lib/data";
import { dayLabel, monthLabel, rupees, today } from "@/lib/month";
import { DbDown, Header, Main } from "../ui/common";
import { AccountCard, AccountKindSelect, Submit, type RepayProps } from "../ui/controls";
import { ActionForm, ConfirmAction, Disclosure, DisclosureCancel } from "../ui/feedback";
import { HandCoinsIcon, PlusIcon, ReceiptIcon, TrashIcon } from "../ui/icons";
import { ACCOUNT_COLORS, card, eyebrow, iconBtn, inputCls, labelCls, primaryBtn } from "../ui/styles";

// Every render reads live data from the database, so there is nothing to prerender.
export const instant = false;

export const metadata: Metadata = {
  title: "My savings",
  description: "Total savings, where they are kept, loans to collect and expenses.",
};

/** My savings is one running view across all months; only the Home part changes by month. */
export default async function SavingsPage() {
  await connection(); // balances and "this month" depend on the request time
  await requireSession();
  let data: SavingsData | null = null;
  let error = "";
  try {
    data = await getSavings();
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <>
      <Header active="savings" />
      <Main>{data ? <SavingsContent data={data} /> : <DbDown error={error} />}</Main>
    </>
  );
}

function SavingsContent({ data }: { data: SavingsData }) {
  const accounts = data.accounts.filter((a) => a.inSavings && !a.isLoan);
  const loans = data.accounts.filter((a) => a.inSavings && a.isLoan);
  const sum = (list: AccountView[]) => list.reduce((total, a) => total + a.balance, 0);
  const inAccounts = sum(accounts);
  const toCollect = sum(loans);
  const total = inAccounts + toCollect;
  const bankId = (accounts.find((a) => /baroda/i.test(a.name)) ?? accounts[0])?.id ?? "";
  const color = (i: number) => ACCOUNT_COLORS[i % ACCOUNT_COLORS.length];
  const repay: RepayProps = { targets: accounts.map(({ id, name }) => ({ id, name })), defaultTargetId: bankId };

  return (
    <div className="space-y-4">
      {/* Total */}
      <section className="relative overflow-hidden rounded-2xl bg-linear-to-br from-indigo-600 via-violet-600 to-purple-600 p-5 text-white shadow-lg shadow-indigo-600/20 sm:p-6">
        <div aria-hidden className="pointer-events-none absolute -top-16 -right-10 size-56 rounded-full bg-white/10 blur-2xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-20 -left-10 size-48 rounded-full bg-fuchsia-400/20 blur-2xl" />
        <p className="relative text-xs font-medium uppercase tracking-wider text-white/70">My total savings</p>
        <p className="relative mt-1 text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">{rupees(total)}</p>

        {total > 0 && (
          <div className="relative mt-5 flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-white/15" aria-hidden>
            {accounts.map((a, i) => (
              <div key={a.id} className={color(i)} style={{ width: `${Math.max(a.balance, 0) / total * 100}%` }} />
            ))}
            {toCollect > 0 && <div className="bg-rose-400" style={{ width: `${toCollect / total * 100}%` }} />}
          </div>
        )}
        <dl className="relative mt-4 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-xl bg-white/10 px-3 py-2 backdrop-blur">
            <dt className="text-[11px] text-white/70">In accounts</dt>
            <dd className="font-semibold tabular-nums">{rupees(inAccounts)}</dd>
          </div>
          <div className="rounded-xl bg-white/10 px-3 py-2 backdrop-blur">
            <dt className="text-[11px] text-white/70">Loans to collect</dt>
            <dd className="font-semibold tabular-nums">{rupees(toCollect)}</dd>
          </div>
        </dl>
      </section>

      {/* Distribution */}
      <section className={card}>
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-stone-900">Savings distribution</h2>
          <p className="text-xs text-stone-500">{accounts.length} accounts</p>
        </div>
        {accounts.length === 0 ? (
          <p className="py-4 text-sm text-stone-500">No accounts yet.</p>
        ) : (
          <ul className="mt-3 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
            {accounts.map((a, i) => (
              <AccountCard key={a.id} account={a} color={color(i)} share={total > 0 ? a.balance / total : 0} />
            ))}
          </ul>
        )}
        <div className="mt-3">
          <Disclosure label={<><PlusIcon /> Add account</>}>
            <ActionForm action={addAccount} success="Account added"
              className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_150px_200px_auto_auto]">
              <input name="name" required autoFocus maxLength={120} aria-label="New account name"
                placeholder="e.g. Mutual fund" className={`${inputCls} col-span-2 sm:col-span-1`} />
              <input name="opening" type="number" inputMode="decimal" min={0} step="any" placeholder="₹ balance now"
                aria-label="Balance now" className={inputCls} />
              <AccountKindSelect kinds={["savings", "loan"]} />
              <Submit>Add</Submit>
              <DisclosureCancel />
            </ActionForm>
          </Disclosure>
        </div>
      </section>

      {/* Loans */}
      <section className={card}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-base font-semibold text-stone-900">
            <span className="inline-flex size-7 items-center justify-center rounded-lg bg-rose-100 text-rose-700">
              <HandCoinsIcon />
            </span>
            Loans to collect
          </h2>
          <p className="text-lg font-semibold tabular-nums text-stone-900">{rupees(toCollect)}</p>
        </div>
        <p className="mt-1 text-xs text-stone-500">Tap &ldquo;Repaid&rdquo; when someone pays back; it goes into Bank of Baroda.</p>
        {loans.length === 0 ? (
          <p className="py-4 text-sm text-stone-500">No loans given. Add one with &ldquo;Add account&rdquo; → Loan given.</p>
        ) : (
          <ul className="mt-3 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
            {loans.map((a) => (
              <AccountCard key={a.id} account={a} color="bg-rose-400" repay={accounts.length > 0 ? repay : undefined} />
            ))}
          </ul>
        )}
      </section>

      <ExpenseTracker accounts={accounts} bankId={bankId} expenses={data.expenses} />
    </div>
  );
}

function ExpenseTracker({ accounts, bankId, expenses }: { accounts: AccountView[]; bankId: string; expenses: EntryView[] }) {
  const now = today();
  const thisMonth = now.slice(0, 7);
  // Group by month, newest first (the list already comes newest first).
  const groups: { month: string; total: number; items: EntryView[] }[] = [];
  for (const e of expenses) {
    const m = e.date.slice(0, 7);
    let g = groups.at(-1);
    if (!g || g.month !== m) groups.push((g = { month: m, total: 0, items: [] }));
    g.items.push(e);
    g.total += e.amount;
  }
  const spentNow = groups.find((g) => g.month === thisMonth)?.total ?? 0;

  return (
    <section className={card}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-stone-900">
          <span className="inline-flex size-7 items-center justify-center rounded-lg bg-amber-100 text-amber-900">
            <ReceiptIcon />
          </span>
          Expense tracker
        </h2>
        <p className="text-right text-xs text-stone-500">
          This month<br />
          <span className="text-lg font-semibold tabular-nums text-stone-900">{rupees(spentNow)}</span>
        </p>
      </div>

      {accounts.length > 0 && (
        <ActionForm action={addExpense} success="Expense added"
          className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-stone-50 p-3 sm:grid-cols-[1fr_120px_170px_150px_auto] sm:items-end">
          <div className="col-span-2 sm:col-span-1">
            <label htmlFor="exp-title" className={labelCls}>Spent on</label>
            <input id="exp-title" name="title" required maxLength={120} placeholder="e.g. Bike EMI" className={inputCls} />
          </div>
          <div>
            <label htmlFor="exp-amount" className={labelCls}>Amount (₹)</label>
            <input id="exp-amount" name="amount" type="number" inputMode="decimal" min={0.01} step="any" required placeholder="0" className={inputCls} />
          </div>
          <div>
            <label htmlFor="exp-from" className={labelCls}>Paid from</label>
            <select id="exp-from" name="fromAccountId" defaultValue={bankId} className={inputCls}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label htmlFor="exp-date" className={labelCls}>Date</label>
            <input id="exp-date" name="date" type="date" required defaultValue={now} className={inputCls} />
          </div>
          <Submit className={`${primaryBtn} col-span-2 sm:col-span-1`}>Add expense</Submit>
        </ActionForm>
      )}

      {groups.length === 0 ? (
        <p className="py-8 text-center text-sm text-stone-500">No expenses yet. They will show up here, newest first.</p>
      ) : (
        <div className="mt-4 space-y-4">
          {groups.map((g) => (
            <div key={g.month}>
              <div className="flex items-baseline justify-between border-b border-stone-100 pb-1.5">
                <h3 className={eyebrow}>{g.month === thisMonth ? "This month" : monthLabel(g.month)}</h3>
                <p className="text-xs font-semibold tabular-nums text-stone-700">{rupees(g.total)}</p>
              </div>
              <ul className="divide-y divide-stone-100">
                {g.items.map((e) => (
                  <li key={e.id} className="group flex items-center gap-3 py-2">
                    <span className="flex w-10 shrink-0 flex-col items-center rounded-lg bg-stone-100 py-1 text-stone-600">
                      <span className="text-sm leading-none font-semibold tabular-nums">{e.date.slice(8)}</span>
                      <span className="mt-0.5 text-[9px] uppercase leading-none">{dayLabel(e.date).split(" ")[1]}</span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-stone-900">{e.title}</p>
                      <p className="truncate text-xs text-stone-500">from {e.fromAccountName}</p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-stone-900">−{rupees(e.amount)}</span>
                    <ConfirmAction action={deleteEntry} id={e.id} title={`Delete "${e.title}"?`}
                      message={`${rupees(e.amount)} goes back to ${e.fromAccountName}.`} success="Expense deleted"
                      label={`Delete ${e.title}`}
                      className={`${iconBtn} hover:border-red-300 hover:bg-red-50 hover:text-red-600 sm:opacity-60 sm:group-hover:opacity-100`}>
                      <TrashIcon />
                    </ConfirmAction>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
