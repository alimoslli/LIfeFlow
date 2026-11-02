import type { Metadata } from "next";
import { passwordResetAvailable } from "@/server/auth/password-reset";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = { title: "Forgot password" };

/** The address reset emails come from (EMAIL_FROM is "Name <address>" or a bare address), so people know what to look for. */
function senderAddress() {
  const from = process.env.EMAIL_FROM?.trim() ?? "";
  const address = from.match(/<([^>]+)>/)?.[1] ?? from;
  return /^[^\s@]+@[^\s@]+$/.test(address) ? address : null;
}

export default function ForgotPasswordPage() {
  return <ForgotForm available={passwordResetAvailable()} contact={process.env.LEGAL_CONTACT_EMAIL?.trim() || null} sender={senderAddress()} />;
}
