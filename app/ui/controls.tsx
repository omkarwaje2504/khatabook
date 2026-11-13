"use client";

import { useState, useTransition, type ReactNode, type SelectHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";
import {
  deleteAccount,
  deleteHead,
  payHead,
  repayLoan,
  undoHead,
  updateAccount,
  updateHead,
  updateSplit,
} from "@/app/actions";
import type { AccountView, HeadView } from "@/lib/data";
import { rupees } from "@/lib/month";
import { ActionForm, ConfirmAction, runAction } from "./feedback";
import { CheckIcon, PencilIcon, Spinner, TrashIcon } from "./icons";
import { ghostBtn, iconBtn, inputCls, labelCls, primaryBtn } from "./styles";

/** Submit button that shows a spinner while its form is being saved. */
export function Submit({ children, className = primaryBtn }: { children: ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending && <Spinner />}
      {children}
    </button>
  );
}

function Cancel({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`${ghostBtn} h-10 px-4 text-sm sm:h-9`}>
      Cancel
    </button>
  );
}

export type AccountOption = { id: string; name: string };

/** "Spent" or one of the accounts the money goes into. Submits as accountId. */
export function AccountSelect({
  accounts,
  className = inputCls,
  ...props
}: { accounts: AccountOption[] } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select name="accountId" aria-label="Where the money goes" className={className} {...props}>
      <option value="">Spent (expense)</option>
      {accounts.length > 0 && (
        <optgroup label="Put into">
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

/** Salary + home part inputs with the "my part" remainder worked out live. */
export function SplitFields({ salary, homeAmount }: { salary: number; homeAmount: number }) {
  const [s, setS] = useState(String(salary));
  const [h, setH] = useState(String(homeAmount));
  const mine = Number(s) - Number(h);

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div>
        <label htmlFor="salary" className={labelCls}>Salary this month (₹)</label>
        <input id="salary" name="salary" type="number" inputMode="decimal" min={0} step="any" required
          value={s} onChange={(e) => setS(e.target.value)} className={inputCls} />
      </div>
      <div>
        <label htmlFor="homeAmount" className={labelCls}>Home part (₹)</label>
        <input id="homeAmount" name="homeAmount" type="number" inputMode="decimal" min={0} max={s || 0} step="any" required
          value={h} onChange={(e) => setH(e.target.value)} className={inputCls} />
      </div>
      <div>
        <span className={labelCls}>My part, goes to savings</span>
        <div className="flex h-10 items-center rounded-xl bg-indigo-50 px-3 text-sm font-semibold tabular-nums text-indigo-900 sm:h-9 sm:rounded-lg">
          {Number.isFinite(mine) ? rupees(mine) : "—"}
        </div>
      </div>
    </div>
  );
}

export function SplitEditor({ month, salary, homeAmount }: { month: string; salary: number; homeAmount: number }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={ghostBtn}>
        <PencilIcon /> Change split
      </button>
    );
  }
  return (
    <ActionForm action={updateSplit} success="Split updated" onDone={() => setOpen(false)}
      className="mt-3 w-full rounded-xl bg-stone-50 p-3 sm:p-4">
      <input type="hidden" name="month" value={month} />
      <SplitFields salary={salary} homeAmount={homeAmount} />
      <div className="mt-3 flex gap-2">
        <Submit>Save split</Submit>
        <Cancel onClick={() => setOpen(false)} />
      </div>
    </ActionForm>
  );
}

/**
 * One home head. The round button on the left marks it paid (or undoes that), so the
 * whole list can be ticked off quickly; edit and delete sit on the right.
 */
export function HeadRow({ head, accounts }: { head: HeadView; accounts: AccountOption[] }) {
  const [editing, setEditing] = useState(false);
  const [paying, startPaying] = useTransition();
  const remaining = head.planned - head.used;
  const over = head.used > head.planned;
  const paid = head.planned > 0 && remaining <= 0;
  const verb = head.accountName ? "added" : "paid";

  if (editing) {
    return (
      <li className="py-2.5">
        <ActionForm action={updateHead} success={`Saved ${head.name}`} onDone={() => setEditing(false)}
          className="grid grid-cols-2 gap-2 rounded-xl bg-stone-50 p-2.5 sm:grid-cols-[1fr_110px_170px_auto_auto]">
          <input type="hidden" name="id" value={head.id} />
          <input name="name" defaultValue={head.name} required maxLength={120} aria-label="Head name"
            className={`${inputCls} col-span-2 sm:col-span-1`} />
          <input name="planned" type="number" inputMode="decimal" min={0} step="any" required defaultValue={head.planned}
            aria-label="Planned amount" className={inputCls} />
          <AccountSelect accounts={accounts} defaultValue={head.accountId ?? ""} />
          <Submit>Save</Submit>
          <Cancel onClick={() => setEditing(false)} />
        </ActionForm>
      </li>
    );
  }

  const ring = paid
    ? "border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600"
    : over
      ? "border-red-400 bg-red-50 text-red-600"
      : "border-stone-300 text-transparent hover:border-emerald-500 hover:text-emerald-500";

  return (
    <li className="group flex items-center gap-3 py-2">
      {head.used > 0 ? (
        <ConfirmAction action={undoHead} id={head.id} confirmLabel="Undo"
          title={`Undo ${head.name}?`} message={`The ${rupees(head.used)} recorded for it will be removed.`}
          success={`${head.name} un-marked`} label={`Undo ${head.name}`}
          className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full border-2 text-[13px] transition ${ring}`}>
          <CheckIcon strokeWidth={3} />
        </ConfirmAction>
      ) : (
        <button type="button" disabled={paying || head.planned <= 0} title={`Mark ${verb}`}
          className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full border-2 text-[13px] transition disabled:cursor-default disabled:hover:border-stone-300 disabled:hover:text-transparent ${ring}`}
          onClick={() => {
            const fd = new FormData();
            fd.set("id", head.id);
            startPaying(async () => void (await runAction(payHead, fd, `${head.name} marked ${verb}`)));
          }}>
          {paying ? <Spinner className="text-emerald-500" /> : <CheckIcon strokeWidth={3} />}
          <span className="sr-only">Mark {head.name} {verb}</span>
        </button>
      )}

      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-medium ${paid ? "text-stone-500" : "text-stone-900"}`}>{head.name}</p>
        {(head.accountName || (head.used > 0 && !paid)) && (
          <p className="truncate text-xs text-stone-500">
            {head.accountName && `→ ${head.accountName}`}
            {head.accountName && head.used > 0 && !paid && " · "}
            {head.used > 0 && !paid && `${rupees(head.used)} ${verb}${over ? `, ${rupees(-remaining)} over` : ""}`}
          </p>
        )}
      </div>

      <p className={`shrink-0 text-sm tabular-nums ${over ? "font-semibold text-red-600" : paid ? "text-stone-400 line-through decoration-stone-300" : "font-semibold text-stone-900"}`}>
        {rupees(head.planned)}
      </p>

      <div className="flex shrink-0 items-center gap-1 sm:opacity-60 sm:transition sm:group-hover:opacity-100 sm:focus-within:opacity-100">
        <button type="button" onClick={() => setEditing(true)} className={iconBtn} title="Edit">
          <PencilIcon />
          <span className="sr-only">Edit {head.name}</span>
        </button>
        <ConfirmAction action={deleteHead} id={head.id} title={`Delete ${head.name}?`}
          message={head.used > 0 ? `The ${rupees(head.used)} recorded for it is removed too.` : "This head is removed from this month."}
          success={`${head.name} deleted`} label={`Delete ${head.name}`}
          className={`${iconBtn} hover:border-red-300 hover:bg-red-50 hover:text-red-600`}>
          <TrashIcon />
        </ConfirmAction>
      </div>
    </li>
  );
}

/** Savings account, loan given, or home account (e.g. Mom's account). Submits as kind. */
export function AccountKindSelect({
  account,
  kinds = ["savings", "loan", "outside"],
  className = inputCls,
}: {
  account?: AccountView;
  kinds?: ("savings" | "loan" | "outside")[];
  className?: string;
}) {
  const current = !account ? kinds[0] : account.isLoan ? "loan" : account.inSavings ? "savings" : "outside";
  const label = { savings: "Savings / investment", loan: "Loan given (to collect)", outside: "Home account" };
  return (
    <select name="kind" aria-label="Kind of account" defaultValue={current} className={className}>
      {kinds.map((k) => (
        <option key={k} value={k}>{label[k]}</option>
      ))}
    </select>
  );
}

export interface RepayProps {
  targets: AccountOption[];
  defaultTargetId: string;
}

/**
 * One account tile. `share` (0–1) shows its portion of total savings; `color` is the
 * account's dot and bar colour; `repay` adds the loan "Mark repaid" flow.
 */
export function AccountCard({
  account,
  share,
  color = "bg-stone-400",
  repay,
}: {
  account: AccountView;
  share?: number;
  color?: string;
  repay?: RepayProps;
}) {
  const [mode, setMode] = useState<"view" | "edit" | "repay">("view");
  const tile = "min-w-0 rounded-xl border border-stone-200/80 bg-surface p-3 transition";

  if (mode === "edit") {
    return (
      <li className={`${tile} col-span-2 sm:col-span-1`}>
        <ActionForm action={updateAccount} success={`Saved ${account.name}`} onDone={() => setMode("view")} className="space-y-2">
          <input type="hidden" name="id" value={account.id} />
          <div>
            <label htmlFor={`acc-name-${account.id}`} className={labelCls}>Name</label>
            <input id={`acc-name-${account.id}`} name="name" required maxLength={120}
              defaultValue={account.name} className={inputCls} />
          </div>
          <div>
            <label htmlFor={`acc-bal-${account.id}`} className={labelCls}>
              {account.isLoan ? "Still to collect (₹)" : "Balance now (₹)"}
            </label>
            <input id={`acc-bal-${account.id}`} name="balance" type="number" inputMode="decimal" step="any" required
              defaultValue={account.balance} className={inputCls} />
          </div>
          <AccountKindSelect account={account} />
          <div className="flex gap-2 pt-1">
            <Submit>Save</Submit>
            <Cancel onClick={() => setMode("view")} />
          </div>
        </ActionForm>
      </li>
    );
  }

  if (mode === "repay" && repay) {
    return (
      <li className={`${tile} col-span-2 sm:col-span-1`}>
        <p className="text-sm font-semibold text-stone-900">{account.name} paid back</p>
        <ActionForm action={repayLoan} success={`Repayment from ${account.name} saved`} onDone={() => setMode("view")}
          className="mt-2 space-y-2">
          <input type="hidden" name="id" value={account.id} />
          <div>
            <label htmlFor={`repay-amt-${account.id}`} className={labelCls}>Amount (₹)</label>
            <input id={`repay-amt-${account.id}`} name="amount" type="number" inputMode="decimal" min={0.01} step="any" required
              defaultValue={account.balance > 0 ? account.balance : undefined} className={inputCls} />
          </div>
          <div>
            <label htmlFor={`repay-to-${account.id}`} className={labelCls}>Received in</label>
            <select id={`repay-to-${account.id}`} name="toAccountId" defaultValue={repay.defaultTargetId} className={inputCls}>
              {repay.targets.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 pt-1">
            <Submit>Save</Submit>
            <Cancel onClick={() => setMode("view")} />
          </div>
        </ActionForm>
      </li>
    );
  }

  return (
    <li className={`${tile} group hover:border-stone-300 hover:shadow-sm`}>
      <div className="flex items-center gap-2">
        <span className={`size-2 shrink-0 rounded-full ${color}`} />
        <p className="min-w-0 flex-1 truncate text-xs font-medium text-stone-600 sm:text-sm" title={account.name}>{account.name}</p>
        {share !== undefined && (
          <span className="shrink-0 rounded-md bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-stone-600">
            {Math.round(share * 100)}%
          </span>
        )}
      </div>
      <p className="mt-2 truncate text-lg font-semibold tracking-tight tabular-nums text-stone-900 sm:text-xl">
        {rupees(account.balance)}
      </p>
      <p className={`text-[11px] tabular-nums ${account.monthNet > 0 ? "text-emerald-700" : account.monthNet < 0 ? "text-red-600" : "text-stone-400"}`}>
        {account.monthNet === 0
          ? "No change this month"
          : `${account.monthNet > 0 ? "+" : "−"}${rupees(Math.abs(account.monthNet))} this month`}
      </p>
      {share !== undefined && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-stone-100">
          <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(Math.max(share, 0), 1) * 100}%` }} />
        </div>
      )}
      <div className="mt-2.5 flex items-center gap-1">
        {repay && account.balance > 0 && (
          <button type="button" onClick={() => setMode("repay")}
            className={`${ghostBtn} flex-1 border-emerald-300 text-emerald-700 hover:border-emerald-400 hover:bg-emerald-50`}>
            <CheckIcon /> Repaid
          </button>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => setMode("edit")} className={iconBtn} title="Edit">
            <PencilIcon />
            <span className="sr-only">Edit {account.name}</span>
          </button>
          <ConfirmAction action={deleteAccount} id={account.id} title={`Delete ${account.name}?`}
            message="Every record that moved money into or out of this account is removed too."
            success={`${account.name} deleted`} label={`Delete ${account.name}`}
            className={`${iconBtn} hover:border-red-300 hover:bg-red-50 hover:text-red-600`}>
            <TrashIcon />
          </ConfirmAction>
        </div>
      </div>
    </li>
  );
}
