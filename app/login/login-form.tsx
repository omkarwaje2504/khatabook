"use client";

import { useActionState, useState } from "react";
import { AlertIcon, CheckIcon, Spinner } from "../ui/icons";
import { inputCls, labelCls, primaryBtn } from "../ui/styles";
import { requestCode, verifyCode, type LoginState } from "./actions";

function ErrorNote({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <p className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
      <AlertIcon className="mt-0.5 shrink-0" />
      {text}
    </p>
  );
}

export function LoginForm() {
  const [identifier, setIdentifier] = useState("");
  const [askState, ask, asking] = useActionState<LoginState, FormData>(requestCode, { step: "identify" });
  const [checkState, check, checking] = useActionState<LoginState, FormData>(verifyCode, { step: "code" });

  if (askState.step === "identify") {
    return (
      <form action={ask} className="space-y-4">
        <div>
          <label htmlFor="identifier" className={labelCls}>Email or phone number</label>
          <input id="identifier" name="identifier" required autoFocus autoComplete="username" inputMode="email"
            value={identifier} onChange={(e) => setIdentifier(e.target.value)} className={`${inputCls} h-11 sm:h-11`} />
        </div>
        <ErrorNote text={askState.error} />
        <button type="submit" disabled={asking} className={`${primaryBtn} h-11 w-full sm:h-11`}>
          {asking && <Spinner />}
          {asking ? "Sending code…" : "Send code"}
        </button>
      </form>
    );
  }

  const busy = checking || asking;
  return (
    <form action={check} className="space-y-4">
      <input type="hidden" name="identifier" value={identifier} />
      <p className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
        <CheckIcon className="mt-0.5 shrink-0" />
        {checkState.message ?? askState.message}
      </p>
      <div>
        <label htmlFor="code" className={labelCls}>6-digit code</label>
        <input id="code" name="code" required autoFocus inputMode="numeric" autoComplete="one-time-code"
          pattern="\d{6}" maxLength={6} placeholder="••••••"
          className={`${inputCls} h-12 text-center font-mono text-2xl tracking-[0.5em] sm:h-12`} />
      </div>
      <ErrorNote text={checkState.error} />
      <button type="submit" disabled={busy} className={`${primaryBtn} h-11 w-full sm:h-11`}>
        {checking && <Spinner />}
        {checking ? "Checking…" : "Sign in"}
      </button>
      <button type="submit" name="resend" value="1" formNoValidate disabled={busy}
        className="w-full text-center text-xs font-medium text-indigo-600 transition hover:text-indigo-500 disabled:opacity-50">
        Didn&apos;t get it? Send a new code
      </button>
    </form>
  );
}
