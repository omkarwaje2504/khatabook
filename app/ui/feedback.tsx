"use client";

import { createContext, useContext, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { AlertIcon, ArrowUpIcon, CheckIcon, MoonIcon, Spinner, SunIcon } from "./icons";
import { ghostBtn, iconBtn, primaryBtn } from "./styles";

/* ---------------------------------------------------------------- toasts */

type Toast = { id: number; message: string; kind: "success" | "error" };
const listeners = new Set<(t: Toast) => void>();
let nextId = 1;

/** Show a short message at the bottom of the screen. */
export function toast(message: string, kind: Toast["kind"] = "success") {
  const t = { id: nextId++, message, kind };
  listeners.forEach((fn) => fn(t));
}

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  // The page is hydrated: colour transitions may run from now on (see THEME_SCRIPT).
  useEffect(() => {
    const id = setTimeout(() => document.documentElement.classList.remove("theme-loading"), 50);
    return () => clearTimeout(id);
  }, []);
  useEffect(() => {
    const add = (t: Toast) => {
      setItems((list) => [...list.slice(-2), t]);
      setTimeout(() => setItems((list) => list.filter((x) => x.id !== t.id)), t.kind === "error" ? 6000 : 3000);
    };
    listeners.add(add);
    return () => void listeners.delete(add);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4" aria-live="polite" role="status">
      {items.map((t) => (
        <div key={t.id}
          className={`animate-toast-in pointer-events-auto flex max-w-sm items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg ${
            t.kind === "error" ? "bg-red-600 text-white" : "bg-stone-900 text-surface"
          }`}>
          {t.kind === "error" ? <AlertIcon className="shrink-0" /> : <CheckIcon className="shrink-0 text-emerald-400" />}
          {t.message}
        </div>
      ))}
    </div>
  );
}

/** A readable message for a failed server action. Framework redirects are passed through. */
function failure(e: unknown): string {
  if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) {
    throw e;
  }
  const message = e instanceof Error ? e.message : "";
  if (!message || /Server Components render|digest|fetch/i.test(message)) return "Something went wrong. Please try again.";
  return message;
}

/** Run a server action with a success toast, or an error toast if it fails. Returns true on success. */
export async function runAction(action: (fd: FormData) => Promise<unknown>, fd: FormData, success?: string) {
  try {
    await action(fd);
    if (success) toast(success);
    return true;
  } catch (e) {
    toast(failure(e), "error");
    return false;
  }
}

/** Closes the surrounding Disclosure; a no-op outside one. */
const CloseDisclosure = createContext<() => void>(() => {});

/** A form for a server action that reports success or failure with a toast. Inside a Disclosure it closes on success. */
export function ActionForm({
  action,
  success,
  onDone,
  className,
  children,
}: {
  action: (fd: FormData) => Promise<unknown>;
  success?: string;
  onDone?: () => void;
  className?: string;
  children: ReactNode;
}) {
  const close = useContext(CloseDisclosure);
  return (
    <form
      className={className}
      action={async (fd) => {
        if (await runAction(action, fd, success)) {
          onDone?.();
          close();
        }
      }}
    >
      {children}
    </form>
  );
}

/* -------------------------------------------------------- confirm dialog */

const DANGER_BTN = primaryBtn
  .replace("bg-stone-900", "bg-red-600")
  .replace("text-surface", "text-white")
  .replace("hover:bg-stone-700", "hover:bg-red-700");

/**
 * A button that asks in a dialog before running a server action with { id }.
 * Used for anything that removes data.
 */
export function ConfirmAction({
  action,
  id,
  title,
  message,
  confirmLabel = "Delete",
  success,
  label,
  className,
  children,
}: {
  action: (fd: FormData) => Promise<unknown>;
  id: string;
  title: string;
  message: string;
  confirmLabel?: string;
  success?: string;
  /** Accessible name of the trigger button. */
  label: string;
  className: string;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [pending, start] = useTransition();
  const danger = confirmLabel === "Delete";

  return (
    <>
      <button type="button" className={className} onClick={() => dialog.current?.showModal()} title={label} disabled={pending}>
        {pending ? <Spinner /> : children}
        <span className="sr-only">{label}</span>
      </button>
      <dialog ref={dialog} onClick={(e) => e.target === dialog.current && dialog.current?.close()}
        className="m-auto w-[min(92vw,380px)] rounded-2xl border border-stone-200 bg-surface p-0 text-stone-900 shadow-2xl">
        <div className="p-5">
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="mt-1.5 text-sm text-stone-500">{message}</p>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className={`${ghostBtn} h-9 px-4 text-sm`} onClick={() => dialog.current?.close()}>
              Cancel
            </button>
            <button type="button" autoFocus
              className={danger ? DANGER_BTN : primaryBtn}
              onClick={() => {
                dialog.current?.close();
                const fd = new FormData();
                fd.set("id", id);
                start(async () => void (await runAction(action, fd, success)));
              }}>
              {confirmLabel}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}

/* ------------------------------------------------------------ theme etc. */

/** Light / dark switch. The choice is remembered on this device; the default follows the system. */
export function ThemeToggle() {
  return (
    <button
      type="button"
      className={iconBtn}
      title="Switch light / dark"
      onClick={() => {
        const dark = !document.documentElement.classList.contains("dark");
        document.documentElement.classList.toggle("dark", dark);
        try {
          localStorage.setItem("theme", dark ? "dark" : "light");
        } catch {}
      }}
    >
      <MoonIcon className="dark:hidden" />
      <SunIcon className="hidden dark:block" />
      <span className="sr-only">Switch between light and dark mode</span>
    </button>
  );
}

/** Runs before first paint (inline in <head>) so the page never flashes the wrong theme. */
export const THEME_SCRIPT = `document.documentElement.classList.add("theme-loading");try{var t=localStorage.getItem("theme");if(t==="dark"||(!t&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){}`;

export function BackToTop() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 600);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  if (!show) return null;
  return (
    <button type="button" onClick={() => window.scrollTo({ top: 0 })} data-print-hide
      className="fixed right-4 bottom-4 z-40 inline-flex size-11 items-center justify-center rounded-full bg-stone-900 text-surface shadow-lg transition hover:bg-stone-700 sm:right-6 sm:bottom-6">
      <ArrowUpIcon />
      <span className="sr-only">Back to top</span>
    </button>
  );
}

/** A "＋ Add …" button that opens a form in place. Forms inside close it when they succeed. */
export function Disclosure({ label, children }: { label: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-stone-300 py-2.5 text-sm font-medium text-stone-500 transition hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-600">
        {label}
      </button>
    );
  }
  return (
    <div className="rounded-xl bg-stone-50 p-3">
      <CloseDisclosure.Provider value={() => setOpen(false)}>{children}</CloseDisclosure.Provider>
    </div>
  );
}

/** Cancel button for a form inside a Disclosure. */
export function DisclosureCancel({ className = "" }: { className?: string }) {
  const close = useContext(CloseDisclosure);
  return (
    <button type="button" onClick={close}
      className={`h-10 px-2 text-sm font-medium text-stone-500 transition hover:text-stone-900 sm:h-9 ${className}`}>
      Cancel
    </button>
  );
}
