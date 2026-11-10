import { redirect } from "next/navigation";

/** What's due is a section of School now (owner's page map, 2026-11-10); old links land there with their view. */
export default async function DuePage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  redirect(`/school${view && /^[a-z]+$/.test(view) ? `?view=${view}` : ""}#due`);
}
