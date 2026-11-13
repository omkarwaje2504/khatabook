"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { db, type Part } from "@/lib/db";
import { defaultDateFor, isMonth, today } from "@/lib/month";

// Used only for the very first month, when there is no earlier plan to copy.
const STARTER_HEADS: { part: Part; name: string }[] = [
  { part: "home", name: "Ration" },
  { part: "home", name: "Recharge" },
  { part: "home", name: "Train pass" },
];

/** Both pages read the same data, so every change refreshes all of them. */
function refreshAll() {
  revalidatePath("/", "layout");
}

function amount(fd: FormData, key: string): number {
  const n = Number(fd.get(key));
  if (!Number.isFinite(n) || n < 0) throw new Error(`"${key}" must be a positive number.`);
  return Math.round(n * 100) / 100;
}

function text(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim().slice(0, 120);
}

function month(fd: FormData): string {
  const m = fd.get("month");
  if (!isMonth(m)) throw new Error("Invalid month.");
  return m;
}

function part(fd: FormData): Part {
  const p = fd.get("part");
  if (p !== "home" && p !== "mine") throw new Error("Invalid part.");
  return p;
}

function id(fd: FormData, key = "id"): number {
  const raw = String(fd.get(key) ?? "");
  if (!/^\d{1,9}$/.test(raw)) throw new Error(`Invalid ${key}.`);
  return Number(raw);
}

/** An optional account choice; empty means "plain expense". Returns null if the account is gone. */
async function accountId(fd: FormData): Promise<number | null> {
  if (!fd.get("accountId")) return null;
  const pool = await db();
  const { rows } = await pool.query<{ id: number }>(`SELECT id FROM accounts WHERE id = $1`, [id(fd, "accountId")]);
  return rows[0]?.id ?? null;
}

/** One of my savings accounts (including loans given), or null if it is not one. */
async function savingsAccount(fd: FormData, key: string): Promise<{ id: number; name: string } | null> {
  if (!fd.get(key)) return null;
  const pool = await db();
  const { rows } = await pool.query<{ id: number; name: string }>(
    `SELECT id, name FROM accounts WHERE id = $1 AND in_savings`,
    [id(fd, key)],
  );
  return rows[0] ?? null;
}

/** Account kind from a form: a savings account, a loan given, or a home account. */
function accountKind(fd: FormData): { inSavings: boolean; isLoan: boolean } {
  const kind = fd.get("kind");
  if (kind === "loan") return { inSavings: true, isLoan: true };
  if (kind === "outside") return { inSavings: false, isLoan: false };
  return { inSavings: true, isLoan: false };
}

function split(fd: FormData): { salary: number; homeAmount: number } {
  const salary = amount(fd, "salary");
  const homeAmount = amount(fd, "homeAmount");
  if (homeAmount > salary) throw new Error("Home part cannot be more than the salary.");
  return { salary, homeAmount };
}

/** Create the month and carry the home heads forward from the latest earlier month. */
export async function startMonth(fd: FormData) {
  await requireSession();
  const m = month(fd);
  const { salary, homeAmount } = split(fd);
  const client = await (await db()).connect();
  try {
    await client.query("BEGIN");
    const created = await client.query(
      `INSERT INTO months (month, salary, home_amount) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [m, salary, homeAmount],
    );
    if (created.rowCount) {
      const prev = await client.query<{ month: string }>(
        `SELECT month FROM months WHERE month < $1 ORDER BY month DESC LIMIT 1`,
        [m],
      );
      if (prev.rows[0]) {
        await client.query(
          `INSERT INTO heads (month, part, name, planned, account_id)
           SELECT $1, part, name, planned, account_id FROM heads WHERE month = $2 AND part = 'home' ORDER BY id`,
          [m, prev.rows[0].month],
        );
      } else {
        for (const head of STARTER_HEADS) {
          await client.query(`INSERT INTO heads (month, part, name) VALUES ($1, $2, $3)`, [m, head.part, head.name]);
        }
      }
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  refreshAll();
}

export async function updateSplit(fd: FormData) {
  await requireSession();
  const { salary, homeAmount } = split(fd);
  const pool = await db();
  await pool.query(`UPDATE months SET salary = $2, home_amount = $3 WHERE month = $1`, [month(fd), salary, homeAmount]);
  refreshAll();
}

export async function addHead(fd: FormData) {
  await requireSession();
  const name = text(fd, "name");
  if (!name) throw new Error("Head needs a name.");
  const pool = await db();
  await pool.query(`INSERT INTO heads (month, part, name, planned, account_id) VALUES ($1, $2, $3, $4, $5)`, [
    month(fd),
    part(fd),
    name,
    amount(fd, "planned"),
    await accountId(fd),
  ]);
  refreshAll();
}

export async function updateHead(fd: FormData) {
  await requireSession();
  const name = text(fd, "name");
  if (!name) throw new Error("Head needs a name.");
  const pool = await db();
  await pool.query(`UPDATE heads SET name = $2, planned = $3, account_id = $4 WHERE id = $1`, [
    id(fd),
    name,
    amount(fd, "planned"),
    await accountId(fd),
  ]);
  refreshAll();
}

/** Removes the head together with everything recorded against it. */
export async function deleteHead(fd: FormData) {
  await requireSession();
  const pool = await db();
  await pool.query(`DELETE FROM entries WHERE head_id = $1`, [id(fd)]);
  await pool.query(`DELETE FROM heads WHERE id = $1`, [id(fd)]);
  refreshAll();
}

/** Takes back a "Mark paid": removes what was recorded against the head, keeps the head. */
export async function undoHead(fd: FormData) {
  await requireSession();
  const pool = await db();
  await pool.query(`DELETE FROM entries WHERE head_id = $1`, [id(fd)]);
  refreshAll();
}

/** One-click entry for a fixed head: records whatever is still unpaid of its plan. */
export async function payHead(fd: FormData) {
  await requireSession();
  const pool = await db();
  const { rows } = await pool.query<{
    month: string;
    part: Part;
    name: string;
    accountId: number | null;
    remaining: number;
  }>(
    `SELECT h.month, h.part, h.name, h.account_id AS "accountId",
            h.planned - COALESCE((SELECT sum(e.amount) FROM entries e WHERE e.head_id = h.id), 0) AS remaining
       FROM heads h WHERE h.id = $1`,
    [id(fd)],
  );
  const head = rows[0];
  if (!head || head.remaining <= 0) return;

  await pool.query(
    `INSERT INTO entries (month, part, head_id, account_id, title, amount, spent_on)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [head.month, head.part, id(fd), head.accountId, head.name, head.remaining, defaultDateFor(head.month)],
  );
  refreshAll();
}

/** A date from a form as YYYY-MM-DD, or today when it is missing or malformed. */
function dateOrToday(fd: FormData, key: string): string {
  const raw = String(fd.get(key) ?? "");
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) && !Number.isNaN(Date.parse(raw)) ? raw : today();
}

/** An expense paid from one of my savings accounts; it lowers that account's balance. */
export async function addExpense(fd: FormData) {
  await requireSession();
  const value = amount(fd, "amount");
  if (value === 0) throw new Error("Amount must be more than zero.");
  const title = text(fd, "title");
  if (!title) throw new Error("Say what the money was spent on.");
  const from = await savingsAccount(fd, "fromAccountId");
  if (!from) throw new Error("Pick the account it was paid from.");

  const pool = await db();
  await pool.query(
    `INSERT INTO entries (month, part, from_account_id, title, amount, spent_on) VALUES (NULL, 'mine', $1, $2, $3, $4)`,
    [from.id, title, value, dateOrToday(fd, "date")],
  );
  refreshAll();
}

/** A loan was (partly) paid back: move that amount from the loan into an account. */
export async function repayLoan(fd: FormData) {
  await requireSession();
  const value = amount(fd, "amount");
  if (value === 0) throw new Error("Amount must be more than zero.");

  const pool = await db();
  const loan = (
    await pool.query<{ id: number; name: string }>(`SELECT id, name FROM accounts WHERE id = $1 AND is_loan`, [id(fd)])
  ).rows[0];
  const to = await savingsAccount(fd, "toAccountId");
  if (!loan || !to || to.id === loan.id) throw new Error("Pick the account the money came back to.");

  await pool.query(
    `INSERT INTO entries (month, part, from_account_id, account_id, title, amount, spent_on)
     VALUES (NULL, 'mine', $1, $2, $3, $4, $5)`,
    [loan.id, to.id, `Repaid: ${loan.name}`, value, today()],
  );
  refreshAll();
}

export async function addAccount(fd: FormData) {
  await requireSession();
  const name = text(fd, "name");
  if (!name) throw new Error("Account needs a name.");
  const pool = await db();
  const kind = accountKind(fd);
  await pool.query(`INSERT INTO accounts (name, opening, in_savings, is_loan) VALUES ($1, $2, $3, $4)`, [
    name,
    fd.get("opening") ? amount(fd, "opening") : 0,
    kind.inSavings,
    kind.isLoan,
  ]);
  refreshAll();
}

export async function updateAccount(fd: FormData) {
  await requireSession();
  const name = text(fd, "name");
  if (!name) throw new Error("Account needs a name.");
  const pool = await db();
  const kind = accountKind(fd);
  const balance = Number(fd.get("balance"));
  if (!Number.isFinite(balance)) throw new Error("Balance must be a number.");
  // Store the balance as "opening", net of everything recorded into and out of the account.
  await pool.query(
    `UPDATE accounts
        SET name = $2, in_savings = $4, is_loan = $5,
            opening = $3
              - COALESCE((SELECT sum(amount) FROM entries WHERE account_id = $1), 0)
              + COALESCE((SELECT sum(amount) FROM entries WHERE from_account_id = $1), 0)
      WHERE id = $1`,
    [id(fd), name, Math.round(balance * 100) / 100, kind.inSavings, kind.isLoan],
  );
  refreshAll();
}

/** Removes the account together with every record that moved money into or out of it. */
export async function deleteAccount(fd: FormData) {
  await requireSession();
  const pool = await db();
  await pool.query(`DELETE FROM entries WHERE account_id = $1 OR from_account_id = $1`, [id(fd)]);
  await pool.query(`DELETE FROM accounts WHERE id = $1`, [id(fd)]);
  refreshAll();
}

export async function deleteEntry(fd: FormData) {
  await requireSession();
  const pool = await db();
  await pool.query(`DELETE FROM entries WHERE id = $1`, [id(fd)]);
  refreshAll();
}
