import { Pool, types } from "pg";

/** The Neon PostgreSQL connection (pooled URL), from .env.local or the Vercel project settings. */
const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

export type Part = "home" | "mine";

// Read NUMERIC as a JS number and DATE as a plain "YYYY-MM-DD" string.
types.setTypeParser(types.builtins.NUMERIC, parseFloat);
types.setTypeParser(types.builtins.DATE, (value) => value);

/**
 * months  – one row per month ("YYYY-MM") with the salary and the home part.
 * heads   – budget heads inside a part, e.g. "Ration" in the home part.
 * entries – the khata: every amount that went out of a part.
 * accounts – where saved / invested money goes (bank accounts, wallets, stocks).
 */
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS months (
    month       text PRIMARY KEY CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    salary      numeric(12,2) NOT NULL CHECK (salary >= 0),
    home_amount numeric(12,2) NOT NULL CHECK (home_amount >= 0 AND home_amount <= salary),
    created_at  timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS heads (
    id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    month      text NOT NULL REFERENCES months(month) ON DELETE CASCADE,
    part       text NOT NULL CHECK (part IN ('home', 'mine')),
    name       text NOT NULL,
    planned    numeric(12,2) NOT NULL DEFAULT 0 CHECK (planned >= 0),
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS entries (
    id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    month      text NOT NULL REFERENCES months(month) ON DELETE CASCADE,
    part       text NOT NULL CHECK (part IN ('home', 'mine')),
    head_id    integer REFERENCES heads(id) ON DELETE SET NULL,
    title      text NOT NULL,
    amount     numeric(12,2) NOT NULL CHECK (amount > 0),
    spent_on   date NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  -- Places money is saved or invested into. Seeded once, when the table is first created.
  DO $$ BEGIN
    IF to_regclass('accounts') IS NULL THEN
      CREATE TABLE accounts (
        id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        name       text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      INSERT INTO accounts (name) VALUES ('My account'), ('Mom''s account'), ('Upstox wallet'), ('Stocks');
    END IF;
  END $$;
  -- An entry with an account is money put aside there, not spent.
  -- A head with an account sends its "Mark added" entries to that account.
  ALTER TABLE heads   ADD COLUMN IF NOT EXISTS account_id integer REFERENCES accounts(id) ON DELETE SET NULL;
  ALTER TABLE entries ADD COLUMN IF NOT EXISTS account_id integer REFERENCES accounts(id) ON DELETE SET NULL;
  -- My savings: a running pool (previous savings + my part of every month) that is
  -- distributed across the accounts flagged in_savings. "opening" is what was already
  -- in an account before the khata started.
  ALTER TABLE accounts ADD COLUMN IF NOT EXISTS opening numeric(14,2) NOT NULL DEFAULT 0 CHECK (opening >= 0);
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'accounts' AND column_name = 'in_savings') THEN
      ALTER TABLE accounts ADD COLUMN in_savings boolean NOT NULL DEFAULT true;
      UPDATE accounts SET in_savings = false WHERE name = 'Mom''s account';
    END IF;
  END $$;
  -- A loan given to someone is still my money, but shown separately as "to collect".
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'accounts' AND column_name = 'is_loan') THEN
      ALTER TABLE accounts ADD COLUMN is_loan boolean NOT NULL DEFAULT false;
      UPDATE accounts SET is_loan = true WHERE in_savings AND name ILIKE '%loan%';
    END IF;
  END $$;
  -- Where a savings entry was taken from; NULL means the not-yet-distributed savings.
  ALTER TABLE entries ADD COLUMN IF NOT EXISTS from_account_id integer REFERENCES accounts(id) ON DELETE SET NULL;
  ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_opening_check;
  -- My savings is one running view, so its records (expenses, repayments) have no month.
  ALTER TABLE entries ALTER COLUMN month DROP NOT NULL;
  -- Login: one-time 6-digit codes (stored hashed) and one session per signed-in device.
  CREATE TABLE IF NOT EXISTS login_codes (
    id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code_hash  text NOT NULL,
    attempts   integer NOT NULL DEFAULT 0,
    used       boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    token_hash text NOT NULL UNIQUE,
    user_agent text,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_seen  timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL
  );
  CREATE TABLE IF NOT EXISTS settings (key text PRIMARY KEY, value numeric(14,2) NOT NULL);
  CREATE INDEX IF NOT EXISTS heads_month_idx ON heads(month);
  CREATE INDEX IF NOT EXISTS entries_month_idx ON entries(month);
`;

// Reuse one pool across hot reloads in dev.
const globalForPg = globalThis as unknown as {
  _khata?: { pool: Pool; ready: Promise<void> | null };
};

/** Connection pool, with the tables created on first use. */
export async function db(): Promise<Pool> {
  if (!DATABASE_URL) throw new Error("DATABASE_URL is missing (.env.local locally, Environment Variables on Vercel).");
  const state = (globalForPg._khata ??= {
    // Neon can take a few seconds to wake an idle database, so allow time to connect.
    // Few connections per server instance: Neon's pooler does the real pooling.
    pool: new Pool({ connectionString: DATABASE_URL, connectionTimeoutMillis: 15000, max: 5 }),
    ready: null,
  });
  if (!state.ready) {
    const ready = state.pool.query(SCHEMA).then(() => undefined);
    state.ready = ready;
    // If the server is down, forget the failed attempt so the next request retries.
    ready.catch(() => {
      if (state.ready === ready) state.ready = null;
    });
  }
  await state.ready;
  return state.pool;
}
