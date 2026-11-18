import { MongoClient, ObjectId, type Collection, type Db } from "mongodb";

export type Part = "home" | "mine";

/** One month: its salary and how much of it is the home part. `_id` is "YYYY-MM". */
export interface MonthDoc {
  _id: string;
  salary: number;
  homeAmount: number;
  createdAt: Date;
}

/** A budget head inside a part, e.g. "Ration" in the home part of one month. */
export interface HeadDoc {
  _id: ObjectId;
  month: string;
  part: Part;
  name: string;
  planned: number;
  /** When set, paying this head puts the money into that account instead of spending it. */
  accountId: ObjectId | null;
  createdAt: Date;
}

/**
 * The khata: every amount that moved. Home-part payments have a month and usually a head.
 * Savings records (expenses, loan repayments) have no month: My savings is one running view.
 */
export interface EntryDoc {
  _id: ObjectId;
  month: string | null;
  part: Part;
  headId: ObjectId | null;
  /** Taken out of this account. */
  fromAccountId: ObjectId | null;
  /** Put into this account; null means spent. */
  accountId: ObjectId | null;
  title: string;
  amount: number;
  /** YYYY-MM-DD */
  date: string;
  createdAt: Date;
}

/** Where money is kept: savings accounts, loans given (to collect), and home accounts. */
export interface AccountDoc {
  _id: ObjectId;
  name: string;
  /** Balance before any recorded movement (set directly when the balance is edited). */
  opening: number;
  /** Counts toward My savings (false for home accounts such as Mom's account). */
  inSavings: boolean;
  /** Money lent to someone, still to be collected. */
  isLoan: boolean;
  createdAt: Date;
}

/** One signed-in device. Only a hash of its cookie token is stored. */
export interface SessionDoc {
  _id: ObjectId;
  tokenHash: string;
  userAgent: string | null;
  createdAt: Date;
  lastSeen: Date;
  expiresAt: Date;
}

/** A 6-digit sign-in code, stored hashed. */
export interface LoginCodeDoc {
  _id: ObjectId;
  codeHash: string;
  attempts: number;
  used: boolean;
  createdAt: Date;
  expiresAt: Date;
}

export interface Collections {
  months: Collection<MonthDoc>;
  heads: Collection<HeadDoc>;
  entries: Collection<EntryDoc>;
  accounts: Collection<AccountDoc>;
  sessions: Collection<SessionDoc>;
  loginCodes: Collection<LoginCodeDoc>;
}

function collections(database: Db): Collections {
  return {
    months: database.collection<MonthDoc>("months"),
    heads: database.collection<HeadDoc>("heads"),
    entries: database.collection<EntryDoc>("entries"),
    accounts: database.collection<AccountDoc>("accounts"),
    sessions: database.collection<SessionDoc>("sessions"),
    loginCodes: database.collection<LoginCodeDoc>("loginCodes"),
  };
}

async function ensureIndexes(c: Collections) {
  await Promise.all([
    c.heads.createIndex({ month: 1, createdAt: 1 }),
    c.entries.createIndex({ month: 1 }),
    c.entries.createIndex({ headId: 1 }),
    c.entries.createIndex({ accountId: 1 }),
    c.entries.createIndex({ fromAccountId: 1 }),
    c.sessions.createIndex({ tokenHash: 1 }, { unique: true }),
    // Expired sessions and day-old codes are removed by MongoDB itself.
    c.sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    c.loginCodes.createIndex({ createdAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 }),
  ]);
}

// One client per server process (and across hot reloads in dev / warm serverless calls).
const globalForMongo = globalThis as unknown as { _khata?: Promise<Collections> };

/** The app's collections, connected and indexed. */
export function db(): Promise<Collections> {
  if (!globalForMongo._khata) {
    const uri = process.env.MONGODB_URI;
    if (!uri) return Promise.reject(new Error("MONGODB_URI is missing from the environment (.env.local)."));
    const pending = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 })
      .connect()
      .then(async (client) => {
        const c = collections(client.db(process.env.MONGODB_DB || "khatabook"));
        await ensureIndexes(c);
        return c;
      });
    globalForMongo._khata = pending;
    // If the connection fails, forget it so the next request retries.
    pending.catch(() => {
      if (globalForMongo._khata === pending) globalForMongo._khata = undefined;
    });
  }
  return globalForMongo._khata;
}

/** A form/URL id as an ObjectId, or null when it is not a valid one. */
export function toId(value: unknown): ObjectId | null {
  const s = String(value ?? "");
  return /^[0-9a-f]{24}$/i.test(s) ? new ObjectId(s) : null;
}

/** Money is kept to the paisa; sums of floats are rounded back to 2 decimals. */
export const money = (n: number) => Math.round(n * 100) / 100;
