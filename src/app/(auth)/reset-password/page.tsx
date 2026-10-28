import type { Metadata } from "next";
import { ResetForm } from "./reset-form";

// The token is in the URL fragment (#…), which browsers never send to servers or in the Referer header.
export const metadata: Metadata = { title: "Choose a new password", referrer: "no-referrer" };

export default function ResetPasswordPage() {
  return <ResetForm />;
}
