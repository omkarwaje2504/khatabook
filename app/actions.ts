"use server";

import { ObjectId } from "mongodb";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { db, money, toId, type HeadDoc, type Part } from "@/lib/db";
import { defaultDateFor, isMonth, today } from "@/lib/month";

// Used only for the very first month, when there is no earlier plan to copy.
const STARTER_HEADS = ["Ration", "Recharge", "Train pass"];

/** Both pages read the same data, so every change refreshes all of them. */
function refreshAll() {
  revalidatePath("/", "layout");
}

function amount(fd: FormData, key: string): number {
  const n = Number(fd.get(key));
  if (!Number.isFinite(n) || n < 0) throw new Error(`"${key}" must be a positive number.`);
  return money(n);
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

function id(fd: FormData, key = "id"): ObjectId {
  const value = toId(fd.get(key));
  if (!value) throw new Error(`Invalid ${key}.`);
  return value;
}

/** An optional account choice; empty means "plain expense". Returns null if the account is gone. */
async function accountId(fd: FormData): Promise<ObjectId | null> {
  if (!fd.get("accountId")) return null;
  const c = await db();
  const found = await c.accounts.findOne({ _id: id(fd, "accountId") }, { projection: { _id: 1 } });
  return found?._id ?? null;
}

/** One of my savings accounts (including loans given), or null if it is not one. */
async function savingsAccount(fd: FormData, key: string) {
  if (!fd.get(key)) return null;
  const c = await db();
  return c.accounts.findOne({ _id: id(fd, key), inSavings: true }, { projection: { _id: 1, name: 1 } });
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
  const c = await db();

  const created = await c.months.updateOne(
    { _id: m },
    { $setOnInsert: { salary, homeAmount, createdAt: new Date() } },
    { upsert: true },
  );
  if (created.upsertedCount) {
    const prev = await c.months.find({ _id: { $lt: m } }).sort({ _id: -1 }).limit(1).next();
    const now = Date.now();
    const heads: HeadDoc[] = prev
      ? (await c.heads.find({ month: prev._id, part: "home" }).sort({ createdAt: 1, _id: 1 }).toArray()).map((h, i) => ({
          _id: new ObjectId(),
          month: m,
          part: h.part,
          name: h.name,
          planned: h.planned,
          accountId: h.accountId,
          createdAt: new Date(now + i),
        }))
      : STARTER_HEADS.map((name, i) => ({
          _id: new ObjectId(),
          month: m,
          part: "home" as const,
          name,
          planned: 0,
          accountId: null,
          createdAt: new Date(now + i),
        }));
    if (heads.length) await c.heads.insertMany(heads);
  }
  refreshAll();
}

export async function updateSplit(fd: FormData) {
  await requireSession();
  const { salary, homeAmount } = split(fd);
  const c = await db();
  await c.months.updateOne({ _id: month(fd) }, { $set: { salary, homeAmount } });
  refreshAll();
}

export async function addHead(fd: FormData) {
  await requireSession();
  const name = text(fd, "name");
  if (!name) throw new Error("Head needs a name.");
  const c = await db();
  await c.heads.insertOne({
    _id: new ObjectId(),
    month: month(fd),
    part: part(fd),
    name,
    planned: amount(fd, "planned"),
    accountId: await accountId(fd),
    createdAt: new Date(),
  });
  refreshAll();
}

export async function updateHead(fd: FormData) {
  await requireSession();
  const name = text(fd, "name");
  if (!name) throw new Error("Head needs a name.");
  const c = await db();
  await c.heads.updateOne(
    { _id: id(fd) },
    { $set: { name, planned: amount(fd, "planned"), accountId: await accountId(fd) } },
  );
  refreshAll();
}

/** Removes the head together with everything recorded against it. */
export async function deleteHead(fd: FormData) {
  await requireSession();
  const c = await db();
  await c.entries.deleteMany({ headId: id(fd) });
  await c.heads.deleteOne({ _id: id(fd) });
  refreshAll();
}

/** Takes back a "Mark paid": removes what was recorded against the head, keeps the head. */
export async function undoHead(fd: FormData) {
  await requireSession();
  const c = await db();
  await c.entries.deleteMany({ headId: id(fd) });
  refreshAll();
}

/** One-click entry for a fixed head: records whatever is still unpaid of its plan. */
export async function payHead(fd: FormData) {
  await requireSession();
  const c = await db();
  const head = await c.heads.findOne({ _id: id(fd) });
  if (!head) return;
  const paid = await c.entries
    .aggregate<{ total: number }>([{ $match: { headId: head._id } }, { $group: { _id: null, total: { $sum: "$amount" } } }])
    .next();
  const remaining = money(head.planned - (paid?.total ?? 0));
  if (remaining <= 0) return;

  await c.entries.insertOne({
    _id: new ObjectId(),
    month: head.month,
    part: head.part,
    headId: head._id,
    fromAccountId: null,
    accountId: head.accountId,
    title: head.name,
    amount: remaining,
    date: defaultDateFor(head.month),
    createdAt: new Date(),
  });
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

  const c = await db();
  await c.entries.insertOne({
    _id: new ObjectId(),
    month: null,
    part: "mine",
    headId: null,
    fromAccountId: from._id,
    accountId: null,
    title,
    amount: value,
    date: dateOrToday(fd, "date"),
    createdAt: new Date(),
  });
  refreshAll();
}

/** A loan was (partly) paid back: move that amount from the loan into an account. */
export async function repayLoan(fd: FormData) {
  await requireSession();
  const value = amount(fd, "amount");
  if (value === 0) throw new Error("Amount must be more than zero.");

  const c = await db();
  const loan = await c.accounts.findOne({ _id: id(fd), isLoan: true });
  const to = await savingsAccount(fd, "toAccountId");
  if (!loan || !to || to._id.equals(loan._id)) throw new Error("Pick the account the money came back to.");

  await c.entries.insertOne({
    _id: new ObjectId(),
    month: null,
    part: "mine",
    headId: null,
    fromAccountId: loan._id,
    accountId: to._id,
    title: `Repaid: ${loan.name}`,
    amount: value,
    date: today(),
    createdAt: new Date(),
  });
  refreshAll();
}

export async function addAccount(fd: FormData) {
  await requireSession();
  const name = text(fd, "name");
  if (!name) throw new Error("Account needs a name.");
  const c = await db();
  await c.accounts.insertOne({
    _id: new ObjectId(),
    name,
    opening: fd.get("opening") ? amount(fd, "opening") : 0,
    ...accountKind(fd),
    createdAt: new Date(),
  });
  refreshAll();
}

export async function updateAccount(fd: FormData) {
  await requireSession();
  const name = text(fd, "name");
  if (!name) throw new Error("Account needs a name.");
  const balance = Number(fd.get("balance"));
  if (!Number.isFinite(balance)) throw new Error("Balance must be a number.");
  const accId = id(fd);

  // Store the typed balance as "opening", net of everything recorded into and out of the account.
  const c = await db();
  const [moved] = await c.entries
    .aggregate<{ net: number }>([
      { $match: { $or: [{ accountId: accId }, { fromAccountId: accId }] } },
      { $group: { _id: null, net: { $sum: { $cond: [{ $eq: ["$accountId", accId] }, "$amount", { $multiply: ["$amount", -1] }] } } } },
    ])
    .toArray();
  await c.accounts.updateOne(
    { _id: accId },
    { $set: { name, ...accountKind(fd), opening: money(balance - (moved?.net ?? 0)) } },
  );
  refreshAll();
}

/** Removes the account together with every record that moved money into or out of it. */
export async function deleteAccount(fd: FormData) {
  await requireSession();
  const accId = id(fd);
  const c = await db();
  await c.entries.deleteMany({ $or: [{ accountId: accId }, { fromAccountId: accId }] });
  await c.heads.updateMany({ accountId: accId }, { $set: { accountId: null } });
  await c.accounts.deleteOne({ _id: accId });
  refreshAll();
}

export async function deleteEntry(fd: FormData) {
  await requireSession();
  const c = await db();
  await c.entries.deleteOne({ _id: id(fd) });
  refreshAll();
}
