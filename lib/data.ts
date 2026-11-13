import { db, type Part } from "./db";

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
  /** Savings entries only: the account the money was taken out of. */
  fromAccountName: string | null;
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
  /** What was already in it before the khata started. */
  opening: number;
  /** Counts as part of "my savings" (false for e.g. mom's account). */
  inSavings: boolean;
  /** A loan given to someone: still my money, shown separately as "to collect". */
  isLoan: boolean;
  /** Opening + everything moved in − everything taken out, up to the viewed month. */
  balance: number;
  /** In − out during the viewed month. */
  monthNet: number;
}

/**
 * My savings as of the end of the viewed month. The pool grows by "my part" of every
 * month (and home-part money saved into my accounts) and shrinks only when savings are
 * spent or given away. Moving it into an account is distribution, not spending.
 */
export interface SavingsView {
  /** Savings held before the khata started. */
  opening: number;
  before: number;
  partThisMonth: number;
  homeInThisMonth: number;
  outThisMonth: number;
  total: number;
  /** Held in my savings accounts (not counting loans). */
  inAccounts: number;
  /** Given as loans, still to be collected. */
  loans: number;
  /** Total minus accounts and loans. */
  undistributed: number;
  /** Moved from undistributed savings into my accounts during the month. */
  distributedThisMonth: number;
}

export interface MonthView {
  month: string;
  salary: number;
  homeAmount: number;
  home: PartView;
  mine: PartView;
  savings: SavingsView;
  entries: EntryView[];
  accounts: AccountView[];
}

export interface PreviousMonth {
  month: string;
  salary: number;
  homeAmount: number;
  headCount: number;
}

/** The latest month that was started before `month`, used to carry the plan forward. */
export async function getPreviousMonth(month: string): Promise<PreviousMonth | null> {
  const pool = await db();
  const { rows } = await pool.query<PreviousMonth>(
    `SELECT m.month, m.salary, m.home_amount AS "homeAmount",
            (SELECT count(*)::int FROM heads h WHERE h.month = m.month) AS "headCount"
       FROM months m
      WHERE m.month < $1
      ORDER BY m.month DESC
      LIMIT 1`,
    [month],
  );
  return rows[0] ?? null;
}

export async function getMonthView(month: string): Promise<MonthView | null> {
  const pool = await db();
  const monthRes = await pool.query<{ salary: number; homeAmount: number }>(
    `SELECT salary, home_amount AS "homeAmount" FROM months WHERE month = $1`,
    [month],
  );
  const doc = monthRes.rows[0];
  if (!doc) return null;

  const [headRes, entryRes, accountRes, flowRes] = await Promise.all([
    pool.query<{ id: number; part: Part; name: string; planned: number; accountId: number | null; accountName: string | null }>(
      `SELECT h.id, h.part, h.name, h.planned, h.account_id AS "accountId", a.name AS "accountName"
         FROM heads h LEFT JOIN accounts a ON a.id = h.account_id
        WHERE h.month = $1 ORDER BY h.id`,
      [month],
    ),
    pool.query<{
      id: number;
      part: Part;
      headId: number | null;
      fromAccountName: string | null;
      accountName: string | null;
      toSavings: boolean | null;
      title: string;
      amount: number;
      date: string;
    }>(
      `SELECT e.id, e.part, e.head_id AS "headId", f.name AS "fromAccountName", a.name AS "accountName", a.in_savings AS "toSavings",
              e.title, e.amount, e.spent_on AS date
         FROM entries e
         LEFT JOIN accounts a ON a.id = e.account_id
         LEFT JOIN accounts f ON f.id = e.from_account_id
        WHERE e.month = $1 ORDER BY e.spent_on DESC, e.id DESC`,
      [month],
    ),
    pool.query<{ id: number; name: string; opening: number; inSavings: boolean; isLoan: boolean; balance: number; monthNet: number }>(
      `SELECT a.id, a.name, a.opening, a.in_savings AS "inSavings", a.is_loan AS "isLoan",
              a.opening
                + COALESCE((SELECT sum(amount) FROM entries WHERE account_id = a.id AND month <= $1), 0)
                - COALESCE((SELECT sum(amount) FROM entries WHERE from_account_id = a.id AND month <= $1), 0) AS balance,
              COALESCE((SELECT sum(amount) FROM entries WHERE account_id = a.id AND month = $1), 0)
                - COALESCE((SELECT sum(amount) FROM entries WHERE from_account_id = a.id AND month = $1), 0) AS "monthNet"
         FROM accounts a ORDER BY a.id`,
      [month],
    ),
    // Money entering my savings from the home part, and money leaving my savings
    // (spent, or sent to an account outside my savings), before and during the month.
    pool.query<{ opening: number; partsBefore: number; homeInBefore: number; homeInNow: number; outBefore: number; outNow: number }>(
      `SELECT
         COALESCE((SELECT value FROM settings WHERE key = 'opening_savings'), 0) AS opening,
         COALESCE((SELECT sum(salary - home_amount) FROM months WHERE month < $1), 0) AS "partsBefore",
         COALESCE(sum(e.amount) FILTER (WHERE e.part = 'home' AND d.in_savings AND e.month < $1), 0) AS "homeInBefore",
         COALESCE(sum(e.amount) FILTER (WHERE e.part = 'home' AND d.in_savings AND e.month = $1), 0) AS "homeInNow",
         COALESCE(sum(e.amount) FILTER (WHERE e.part = 'mine' AND d.in_savings IS NOT TRUE AND e.month < $1), 0) AS "outBefore",
         COALESCE(sum(e.amount) FILTER (WHERE e.part = 'mine' AND d.in_savings IS NOT TRUE AND e.month = $1), 0) AS "outNow"
       FROM (SELECT * FROM entries WHERE month <= $1) e
       LEFT JOIN accounts d ON d.id = e.account_id`,
      [month],
    ),
  ]);

  const headViews = new Map<number, HeadView>(
    headRes.rows.map((h) => [
      h.id,
      {
        id: String(h.id),
        part: h.part,
        name: h.name,
        planned: h.planned,
        used: 0,
        accountId: h.accountId === null ? null : String(h.accountId),
        accountName: h.accountName,
      },
    ]),
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
    mine: partView("mine", doc.salary - doc.homeAmount),
  };

  let distributedThisMonth = 0;
  const entryViews: EntryView[] = entryRes.rows.map((e) => {
    if (e.part === "mine" && e.fromAccountName === null && e.toSavings) distributedThisMonth += e.amount;
    const head = e.headId === null ? undefined : headViews.get(e.headId);
    parts[e.part].used += e.amount;
    if (e.accountName !== null) parts[e.part].saved += e.amount;
    if (head) head.used += e.amount;
    else parts[e.part].otherUsed += e.amount;
    return {
      id: String(e.id),
      part: e.part,
      headName: head?.name ?? null,
      fromAccountName: e.fromAccountName,
      accountName: e.accountName,
      title: e.title,
      amount: e.amount,
      date: e.date,
    };
  });

  for (const head of headViews.values()) {
    parts[head.part].heads.push(head);
    parts[head.part].planned += head.planned;
  }

  const accounts: AccountView[] = accountRes.rows.map((a) => ({ ...a, id: String(a.id) }));
  const flow = flowRes.rows[0];
  const before = flow.opening + flow.partsBefore + flow.homeInBefore - flow.outBefore;
  const total = before + parts.mine.allotted + flow.homeInNow - flow.outNow;
  const sumOf = (list: AccountView[]) => list.reduce((sum, a) => sum + a.balance, 0);
  const inAccounts = sumOf(accounts.filter((a) => a.inSavings && !a.isLoan));
  const loans = sumOf(accounts.filter((a) => a.inSavings && a.isLoan));

  return {
    month,
    salary: doc.salary,
    homeAmount: doc.homeAmount,
    home: parts.home,
    mine: parts.mine,
    savings: {
      opening: flow.opening,
      before,
      partThisMonth: parts.mine.allotted,
      homeInThisMonth: flow.homeInNow,
      outThisMonth: flow.outNow,
      total,
      inAccounts,
      loans,
      undistributed: total - inAccounts - loans,
      distributedThisMonth,
    },
    entries: entryViews,
    accounts,
  };
}

export interface SavingsMonth {
  month: string;
  /** My part of the salary that month. */
  part: number;
  /** Home-part money saved into my savings accounts. */
  homeIn: number;
  /** Moved from undistributed savings into my accounts and loans. */
  distributed: number;
  /** Spent from savings, or sent outside them. */
  spent: number;
  /** Total savings at the end of the month. */
  total: number;
}

/** Month-by-month savings, newest first. */
export async function getSavingsHistory(): Promise<SavingsMonth[]> {
  const pool = await db();
  const [{ rows }, opening] = await Promise.all([
    pool.query<Omit<SavingsMonth, "total">>(
      `SELECT m.month, m.salary - m.home_amount AS part,
              COALESCE(sum(e.amount) FILTER (WHERE e.part = 'home' AND d.in_savings), 0) AS "homeIn",
              COALESCE(sum(e.amount) FILTER (WHERE e.part = 'mine' AND e.from_account_id IS NULL AND d.in_savings), 0) AS distributed,
              COALESCE(sum(e.amount) FILTER (WHERE e.part = 'mine' AND d.in_savings IS NOT TRUE), 0) AS spent
         FROM months m
         LEFT JOIN entries e ON e.month = m.month
         LEFT JOIN accounts d ON d.id = e.account_id
        GROUP BY m.month ORDER BY m.month`,
    ),
    pool.query<{ value: number }>(`SELECT value FROM settings WHERE key = 'opening_savings'`),
  ]);

  let running = opening.rows[0]?.value ?? 0;
  return rows
    .map((r) => {
      running += r.part + r.homeIn - r.spent;
      return { ...r, total: running };
    })
    .reverse();
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
  const pool = await db();
  const [accountRes, expenseRes] = await Promise.all([
    pool.query<{ id: number; name: string; opening: number; inSavings: boolean; isLoan: boolean; balance: number; monthNet: number }>(
      `SELECT a.id, a.name, a.opening, a.in_savings AS "inSavings", a.is_loan AS "isLoan",
              a.opening
                + COALESCE((SELECT sum(amount) FROM entries WHERE account_id = a.id), 0)
                - COALESCE((SELECT sum(amount) FROM entries WHERE from_account_id = a.id), 0) AS balance,
              COALESCE((SELECT sum(amount) FROM entries
                         WHERE account_id = a.id AND date_trunc('month', spent_on) = date_trunc('month', CURRENT_DATE)), 0)
                - COALESCE((SELECT sum(amount) FROM entries
                         WHERE from_account_id = a.id AND date_trunc('month', spent_on) = date_trunc('month', CURRENT_DATE)), 0)
                AS "monthNet"
         FROM accounts a ORDER BY a.id`,
    ),
    pool.query<{ id: number; part: Part; fromAccountName: string | null; title: string; amount: number; date: string }>(
      `SELECT e.id, e.part, f.name AS "fromAccountName", e.title, e.amount, e.spent_on AS date
         FROM entries e JOIN accounts f ON f.id = e.from_account_id
        WHERE e.part = 'mine' AND e.account_id IS NULL
        ORDER BY e.spent_on DESC, e.id DESC
        LIMIT 500`,
    ),
  ]);
  return {
    accounts: accountRes.rows.map((a) => ({ ...a, id: String(a.id) })),
    expenses: expenseRes.rows.map((e) => ({
      ...e,
      id: String(e.id),
      headName: null,
      accountName: null,
    })),
  };
}
