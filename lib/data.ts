import type { ObjectId } from "mongodb";
import { db, money, type AccountDoc, type EntryDoc, type Part } from "./db";
import { today } from "./month";

export interface HeadView {
  id: string;
  part: Part;
  name: string;
  planned: number;
  used: number;
  /** Set when this head is money put into an account rather than an expense. */
  accountId: string | null;
  accountName: string | null;
}

export interface EntryView {
  id: string;
  part: Part;
  headName: string | null;
  /** The account the money was taken out of, if any. */
  fromAccountName: string | null;
  /** The account the money went into; null means it was spent. */
  accountName: string | null;
  title: string;
  amount: number;
  date: string;
}

export interface PartView {
  part: Part;
  allotted: number;
  planned: number;
  /** Everything recorded against the part this month. */
  used: number;
  /** The portion of `used` that was put into an account. */
  saved: number;
  /** Used by entries that are not linked to any head. */
  otherUsed: number;
  heads: HeadView[];
}

export interface AccountView {
  id: string;
  name: string;
  /** Balance before any recorded movement. */
  opening: number;
  /** Counts as part of "my savings" (false for home accounts such as Mom's account). */
  inSavings: boolean;
  /** A loan given to someone: still my money, shown separately as "to collect". */
  isLoan: boolean;
  balance: number;
  /** Change during the month being looked at. */
  monthNet: number;
}

export interface MonthView {
  month: string;
  salary: number;
  homeAmount: number;
  home: PartView;
  mine: PartView;
  entries: EntryView[];
  accounts: AccountView[];
}

export interface PreviousMonth {
  month: string;
  salary: number;
  homeAmount: number;
  headCount: number;
}

const key = (id: ObjectId | null | undefined) => (id ? id.toHexString() : null);

/**
 * Account balances: opening + money moved in − money moved out, over the given entries.
 * `inMonth` decides which of those entries count toward `monthNet`.
 */
function accountViews(accounts: AccountDoc[], moves: EntryDoc[], inMonth: (e: EntryDoc) => boolean): AccountView[] {
  const balance = new Map<string, number>();
  const net = new Map<string, number>();
  const add = (map: Map<string, number>, id: string | null, n: number) => {
    if (id) map.set(id, (map.get(id) ?? 0) + n);
  };
  for (const e of moves) {
    add(balance, key(e.accountId), e.amount);
    add(balance, key(e.fromAccountId), -e.amount);
    if (inMonth(e)) {
      add(net, key(e.accountId), e.amount);
      add(net, key(e.fromAccountId), -e.amount);
    }
  }
  return accounts.map((a) => {
    const id = a._id.toHexString();
    return {
      id,
      name: a.name,
      opening: a.opening,
      inSavings: a.inSavings,
      isLoan: a.isLoan,
      balance: money(a.opening + (balance.get(id) ?? 0)),
      monthNet: money(net.get(id) ?? 0),
    };
  });
}

const movesFilter = { $or: [{ accountId: { $ne: null } }, { fromAccountId: { $ne: null } }] };

/** The latest month that was started before `month`, used to carry the plan forward. */
export async function getPreviousMonth(month: string): Promise<PreviousMonth | null> {
  const c = await db();
  const prev = await c.months.find({ _id: { $lt: month } }).sort({ _id: -1 }).limit(1).next();
  if (!prev) return null;
  return {
    month: prev._id,
    salary: prev.salary,
    homeAmount: prev.homeAmount,
    headCount: await c.heads.countDocuments({ month: prev._id }),
  };
}

export async function getMonthView(month: string): Promise<MonthView | null> {
  const c = await db();
  const doc = await c.months.findOne({ _id: month });
  if (!doc) return null;

  const [headDocs, entryDocs, accountDocs, moves] = await Promise.all([
    c.heads.find({ month }).sort({ createdAt: 1, _id: 1 }).toArray(),
    c.entries.find({ month }).sort({ date: -1, _id: -1 }).toArray(),
    c.accounts.find().sort({ createdAt: 1, _id: 1 }).toArray(),
    // Balances as of the end of this month (records without a month are not part of it).
    c.entries.find({ ...movesFilter, month: { $lte: month } }).toArray(),
  ]);

  const accounts = accountViews(accountDocs, moves, (e) => e.month === month);
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));

  const headViews = new Map<string, HeadView>(
    headDocs.map((h) => {
      const id = h._id.toHexString();
      const acc = key(h.accountId);
      return [
        id,
        { id, part: h.part, name: h.name, planned: h.planned, used: 0, accountId: acc, accountName: acc ? accountName.get(acc) ?? null : null },
      ];
    }),
  );

  const partView = (part: Part, allotted: number): PartView => ({
    part,
    allotted,
    planned: 0,
    used: 0,
    saved: 0,
    otherUsed: 0,
    heads: [],
  });
  const parts = {
    home: partView("home", doc.homeAmount),
    mine: partView("mine", money(doc.salary - doc.homeAmount)),
  };

  const entries: EntryView[] = entryDocs.map((e) => {
    const head = e.headId ? headViews.get(e.headId.toHexString()) : undefined;
    const to = key(e.accountId);
    const from = key(e.fromAccountId);
    parts[e.part].used += e.amount;
    if (to) parts[e.part].saved += e.amount;
    if (head) head.used += e.amount;
    else parts[e.part].otherUsed += e.amount;
    return {
      id: e._id.toHexString(),
      part: e.part,
      headName: head?.name ?? null,
      fromAccountName: from ? accountName.get(from) ?? null : null,
      accountName: to ? accountName.get(to) ?? null : null,
      title: e.title,
      amount: e.amount,
      date: e.date,
    };
  });

  for (const head of headViews.values()) {
    head.used = money(head.used);
    parts[head.part].heads.push(head);
    parts[head.part].planned += head.planned;
  }
  for (const p of Object.values(parts)) {
    p.planned = money(p.planned);
    p.used = money(p.used);
    p.saved = money(p.saved);
    p.otherUsed = money(p.otherUsed);
  }

  return {
    month,
    salary: doc.salary,
    homeAmount: doc.homeAmount,
    home: parts.home,
    mine: parts.mine,
    entries,
    accounts,
  };
}

export interface SavingsData {
  accounts: AccountView[];
  /** Expenses paid from savings accounts, newest first. */
  expenses: EntryView[];
}

/**
 * My savings across all time: every account's balance today and every expense.
 * `monthNet` here is the change during the current calendar month.
 */
export async function getSavings(): Promise<SavingsData> {
  const c = await db();
  const thisMonth = today().slice(0, 7);
  const [accountDocs, moves] = await Promise.all([
    c.accounts.find().sort({ createdAt: 1, _id: 1 }).toArray(),
    c.entries.find(movesFilter).toArray(),
  ]);
  const accounts = accountViews(accountDocs, moves, (e) => e.date.startsWith(thisMonth));
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));

  const expenses = moves
    .filter((e) => e.part === "mine" && e.accountId === null && e.fromAccountId !== null)
    .sort((a, b) => b.date.localeCompare(a.date) || b._id.toHexString().localeCompare(a._id.toHexString()))
    .slice(0, 500)
    .map((e) => ({
      id: e._id.toHexString(),
      part: e.part,
      headName: null,
      fromAccountName: accountName.get(key(e.fromAccountId)!) ?? "a deleted account",
      accountName: null,
      title: e.title,
      amount: e.amount,
      date: e.date,
    }));

  return { accounts, expenses };
}
