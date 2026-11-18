"use client"; // Error boundaries must be Client Components

import Link from "next/link";
import { AlertIcon } from "./ui/icons";
import { ghostBtn, primaryBtn } from "./ui/styles";

/** Shown when a page fails on the server, e.g. the database is unreachable or a setting is missing. */
export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && "digest" in error ? String((error as { digest?: string }).digest ?? "") : "";

  return (
    <main id="main" className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-red-50 text-2xl text-red-600">
        <AlertIcon />
      </span>
      <h1 className="mt-5 text-xl font-semibold tracking-tight text-stone-900">This page couldn&apos;t load</h1>
      <p className="mt-2 max-w-sm text-sm text-stone-500">
        The server had a problem, usually the database not answering for a moment. Try again; if it keeps
        happening, check the deployment&apos;s settings and logs.
      </p>
      <div className="mt-6 flex gap-2">
        <button type="button" onClick={() => retry()} className={primaryBtn}>Try again</button>
        <Link href="/login" className={`${ghostBtn} h-10 px-4 text-sm sm:h-9`}>Sign in page</Link>
      </div>
      {digest && <p className="mt-6 font-mono text-xs text-stone-400">Error {digest}</p>}
    </main>
  );
}
