import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { hasSession } from "@/lib/auth";
import { ThemeToggle } from "../ui/feedback";
import { Logo } from "../ui/icons";
import { LoginForm } from "./login-form";

export const instant = false;

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your private Khatabook with a one-time code.",
};

export default async function LoginPage() {
  await connection();
  if (await hasSession()) redirect("/");

  return (
    <main id="main" className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-12">
      <div aria-hidden className="pointer-events-none absolute -top-32 left-1/2 size-[480px] -translate-x-1/2 rounded-full bg-indigo-500/15 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-40 -left-20 size-80 rounded-full bg-amber-400/10 blur-3xl" />
      <div className="absolute top-3 right-3">
        <ThemeToggle />
      </div>

      <section className="relative w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo className="size-12" />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-stone-900">Welcome back</h1>
          <p className="mt-1 text-sm text-stone-500">Sign in to your Khatabook</p>
        </div>
        <div className="rounded-2xl border border-stone-200/80 bg-surface p-5 shadow-xl shadow-stone-900/5 sm:p-6">
          <LoginForm />
        </div>
        <p className="mt-6 text-center text-xs text-stone-400">Private khata · a one-time code is emailed to the owner</p>
      </section>
    </main>
  );
}
