import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import nodemailer from "nodemailer";
import { DATABASE_URL, db, isLocalDatabase } from "./db";

/** Only this person can sign in; every code is emailed to OWNER_EMAIL. */
export const OWNER_EMAIL = (process.env.AUTH_EMAIL ?? "").trim().toLowerCase();
const OWNER_PHONE = digits(process.env.AUTH_PHONE ?? "");

export const SESSION_COOKIE = "khata_session";
/** A signed-in device stays signed in this long without using it. */
export const SESSION_DAYS = 180;
const CODE_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const RESEND_SECONDS = 60;

function digits(value: string): string {
  return value.replace(/\D/g, "").replace(/^(91|0)(?=\d{10}$)/, "");
}

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) throw new Error("AUTH_SECRET is missing from .env.local.");
  return value;
}

/** Codes and session tokens are only ever stored hashed. */
function hash(value: string): string {
  return createHash("sha256").update(`${secret()}:${value}`).digest("hex");
}

/**
 * Server settings that sign-in cannot work without, by name, so a fresh deployment
 * (e.g. on Vercel) can say exactly what is missing instead of failing with a blank error.
 */
export function missingSettings(): string[] {
  const missing: string[] = [];
  if (!DATABASE_URL) missing.push("DATABASE_URL");
  // On a live server, a database on "this computer" is a leftover local setting.
  else if (process.env.VERCEL && isLocalDatabase()) missing.push("DATABASE_URL (it points to 127.0.0.1; use the Neon URL)");
  if (!process.env.AUTH_EMAIL) missing.push("AUTH_EMAIL");
  if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) missing.push("AUTH_SECRET");
  if (process.env.NODE_ENV === "production") {
    for (const name of ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"]) if (!process.env[name]) missing.push(name);
  }
  return missing;
}

/** True when the email or phone number typed on the login page is the owner's. */
export function isOwner(identifier: string): boolean {
  const value = identifier.trim().toLowerCase();
  if (!value || !OWNER_EMAIL) return false;
  if (value.includes("@")) return value === OWNER_EMAIL;
  return OWNER_PHONE.length > 0 && digits(value) === OWNER_PHONE;
}

/** "om****@gmail.com", so the login page can say where the code went. */
export function maskedEmail(): string {
  const [name, domain] = OWNER_EMAIL.split("@");
  return `${name.slice(0, 2)}****${name.slice(-2)}@${domain}`;
}

/** Seconds until another code may be sent, or 0 when one can be sent now. */
export async function resendWait(): Promise<number> {
  const pool = await db();
  const { rows } = await pool.query<{ wait: number }>(
    `SELECT GREATEST(0, CEIL($1 - EXTRACT(EPOCH FROM now() - max(created_at))))::int AS wait FROM login_codes`,
    [RESEND_SECONDS],
  );
  return rows[0]?.wait ?? 0;
}

/** Make a new 6-digit code (replacing any earlier one) and email it to the owner. */
export async function sendLoginCode(): Promise<void> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const pool = await db();
  await pool.query(`UPDATE login_codes SET used = true WHERE NOT used`);
  await pool.query(
    `INSERT INTO login_codes (code_hash, expires_at) VALUES ($1, now() + make_interval(mins => $2))`,
    [hash(code), CODE_MINUTES],
  );
  // Keep the table small: old codes are useless.
  await pool.query(`DELETE FROM login_codes WHERE created_at < now() - interval '1 day'`);
  await deliver(code);
}

async function deliver(code: string): Promise<void> {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    if (process.env.NODE_ENV === "production") throw new Error("Email is not set up (SMTP_* in .env.local).");
    // Local development without email set up: show the code in the dev server log only.
    console.log(`\n[khatabook] Login code: ${code} (set SMTP_PASS in .env.local to email it instead)\n`);
    return;
  }
  const port = Number(SMTP_PORT ?? 465);
  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  await transport.sendMail({
    from: `Khatabook <${SMTP_USER}>`,
    to: OWNER_EMAIL,
    subject: `${code} is your Khatabook sign-in code`,
    text: `Your Khatabook sign-in code is ${code}.\n\nIt works once and expires in ${CODE_MINUTES} minutes. If you did not try to sign in, ignore this email.`,
    html: `<p>Your Khatabook sign-in code is</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>It works once and expires in ${CODE_MINUTES} minutes. If you did not try to sign in, ignore this email.</p>`,
  });
}

export type CodeCheck = "ok" | "wrong" | "expired" | "locked";

/** Check a typed code against the latest one; the code is used up when it matches. */
export async function checkLoginCode(typed: string): Promise<CodeCheck> {
  const pool = await db();
  const { rows } = await pool.query<{ id: number; codeHash: string; attempts: number; expired: boolean }>(
    `SELECT id, code_hash AS "codeHash", attempts, expires_at < now() AS expired
       FROM login_codes WHERE NOT used ORDER BY id DESC LIMIT 1`,
  );
  const latest = rows[0];
  if (!latest || latest.expired) return "expired";
  if (latest.attempts >= MAX_ATTEMPTS) return "locked";

  const matches =
    /^\d{6}$/.test(typed) && timingSafeEqual(Buffer.from(hash(typed)), Buffer.from(latest.codeHash));
  if (!matches) {
    await pool.query(`UPDATE login_codes SET attempts = attempts + 1 WHERE id = $1`, [latest.id]);
    return latest.attempts + 1 >= MAX_ATTEMPTS ? "locked" : "wrong";
  }
  await pool.query(`UPDATE login_codes SET used = true WHERE id = $1`, [latest.id]);
  return "ok";
}

/** Sign this device in: a new random token, kept hashed in the database and raw in a cookie. */
export async function startSession(userAgent: string | null): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const pool = await db();
  await pool.query(
    `INSERT INTO sessions (token_hash, user_agent, expires_at) VALUES ($1, $2, now() + make_interval(days => $3))`,
    [hash(token), userAgent?.slice(0, 300) ?? null, SESSION_DAYS],
  );
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

/** True when this request comes from a signed-in device. Using it keeps the session alive. */
export async function hasSession(): Promise<boolean> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return false;
  const pool = await db();
  const { rowCount } = await pool.query(
    `UPDATE sessions SET last_seen = now(), expires_at = now() + make_interval(days => $2)
      WHERE token_hash = $1 AND expires_at > now()`,
    [hash(token), SESSION_DAYS],
  );
  return (rowCount ?? 0) > 0;
}

/** For pages and server actions: send anyone who is not signed in to the login page. */
export async function requireSession(): Promise<void> {
  if (!(await hasSession())) redirect("/login");
}

/** Sign this device out; other devices stay signed in. */
export async function endSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    const pool = await db();
    await pool.query(`DELETE FROM sessions WHERE token_hash = $1`, [hash(token)]);
  }
  store.delete(SESSION_COOKIE);
}
