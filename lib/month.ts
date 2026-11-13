const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const pad = (n: number) => String(n).padStart(2, "0");

export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isMonth(value: unknown): value is string {
  return typeof value === "string" && MONTH_RE.test(value);
}

export function parseMonth(value: unknown): string {
  return isMonth(value) ? value : today().slice(0, 7);
}

export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + by, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

export function monthBounds(month: string): { first: string; last: string } {
  const [y, m] = month.split("-").map(Number);
  return { first: `${month}-01`, last: `${month}-${pad(new Date(y, m, 0).getDate())}` };
}

/** Today if it falls in the month, otherwise the 1st of that month. */
export function defaultDateFor(month: string): string {
  const t = today();
  return t.startsWith(month) ? t : `${month}-01`;
}

export function dayLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const sameYear = y === new Date().getFullYear();
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "2-digit" }),
  });
}

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
export const rupees = (n: number) => (n < 0 ? `-₹${inr.format(-n)}` : `₹${inr.format(n)}`);
