import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "./ui/icons";
import { primaryBtn } from "./ui/styles";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main id="main" className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <Logo className="size-12" />
      <p className="mt-6 text-sm font-semibold text-indigo-600">404</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-stone-900">This page isn&apos;t in the khata</h1>
      <p className="mt-2 max-w-sm text-sm text-stone-500">The link may be old or mistyped.</p>
      <Link href="/" className={`${primaryBtn} mt-6`}>Back to Home part</Link>
    </main>
  );
}
