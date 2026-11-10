import { redirect } from "next/navigation";

/** Investments live on Accounts now (owner's page map, 2026-11-10: one place for what you have); old links land there. */
export default function WealthPage() {
  redirect("/finances/accounts#investments");
}
