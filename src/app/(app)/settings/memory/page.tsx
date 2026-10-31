import { redirect } from "next/navigation";

/** Moved: what Jarvis knows lives under Jarvis → Memory; personality under Settings → Jarvis. */
export default function OldMemorySettings() {
  redirect("/jarvis/memory");
}
