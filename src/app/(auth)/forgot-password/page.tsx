import type { Metadata } from "next";
import { passwordResetAvailable } from "@/server/auth/password-reset";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return <ForgotForm available={passwordResetAvailable()} contact={process.env.LEGAL_CONTACT_EMAIL?.trim() || null} />;
}
