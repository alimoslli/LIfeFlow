import { TodaySkeleton } from "@/components/skeletons";

/** Today (and any page without its own skeleton). Shown on first load only; repeat visits come from the client cache. */
export default function Loading() {
  return <TodaySkeleton />;
}
