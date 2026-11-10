import { redirect } from "next/navigation";

/** Category rules open over Activity now (owner's page map, 2026-11-10); old links land on Activity with them open. */
export default function RulesPage() {
  redirect("/finances/transactions?rules=1");
}
