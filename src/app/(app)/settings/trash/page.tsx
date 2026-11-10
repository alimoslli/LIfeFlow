import { redirect } from "next/navigation";

/** Recently deleted is part of "Privacy and your data" now (owner's page map, 2026-11-10); old links land there. */
export default function TrashPage() {
  redirect("/settings/data#deleted");
}
