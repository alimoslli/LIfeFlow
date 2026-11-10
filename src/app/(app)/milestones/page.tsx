import { redirect } from "next/navigation";

/** Milestones are the Done side of Goals now; old links and bookmarks keep working, with their query. */
export default async function MilestonesIndex({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) for (const x of Array.isArray(v) ? v : v == null ? [] : [v]) q.append(k, x);
  q.set("view", "done");
  redirect(`/goals?${q.toString()}`);
}
