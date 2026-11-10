import { redirect } from "next/navigation";

/** Feedback sits with inviting friends now (owner's page map, 2026-11-10); old links land on it. */
export default function FeedbackPage() {
  redirect("/settings/invite#feedback");
}
