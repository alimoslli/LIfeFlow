import { redirect } from "next/navigation";

/** Subscriptions live on Bills now (owner, 2026-11-10: they don't get their own page); old links land there. */
export default function SubscriptionsPage() {
  redirect("/finances/bills");
}
