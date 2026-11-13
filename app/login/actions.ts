"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  checkLoginCode,
  endSession,
  isOwner,
  maskedEmail,
  resendWait,
  sendLoginCode,
  startSession,
} from "@/lib/auth";

export interface LoginState {
  step: "identify" | "code";
  message?: string;
  error?: string;
}

/** Step 1: the owner's email or phone number. The code always goes to the owner's email. */
export async function requestCode(_prev: LoginState, fd: FormData): Promise<LoginState> {
  const identifier = String(fd.get("identifier") ?? "");
  if (!isOwner(identifier)) return { step: "identify", error: "This khatabook is private." };

  const wait = await resendWait();
  if (wait > 0) {
    return { step: "code", message: `A code was just sent to ${maskedEmail()}. You can ask for a new one in ${wait}s.` };
  }
  try {
    await sendLoginCode();
  } catch (e) {
    console.error("[khatabook] Could not send login code:", e);
    return { step: "identify", error: "Could not send the email. Check the SMTP settings in .env.local." };
  }
  return { step: "code", message: `We sent a 6-digit code to ${maskedEmail()}.` };
}

/** Step 2: the 6-digit code. A match signs this device in. */
export async function verifyCode(_prev: LoginState, fd: FormData): Promise<LoginState> {
  if (fd.get("resend")) return requestCode(_prev, fd);

  const result = await checkLoginCode(String(fd.get("code") ?? "").replace(/\s/g, ""));
  if (result === "wrong") return { step: "code", error: "That code is not right. Try again." };
  if (result === "expired") return { step: "code", error: "That code has expired. Ask for a new one." };
  if (result === "locked") return { step: "code", error: "Too many wrong tries. Ask for a new code." };

  await startSession((await headers()).get("user-agent"));
  redirect("/");
}

export async function logout() {
  await endSession();
  redirect("/login");
}
