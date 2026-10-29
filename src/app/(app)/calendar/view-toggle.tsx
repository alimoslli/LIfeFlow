import { SegmentedNav } from "@/components/ui/segmented-nav";

/** One calendar, two views: the week list (Plan) and the month grid. */
export function CalendarViewToggle({ active }: { active: "week" | "month" }) {
  return (
    <SegmentedNav
      label="Calendar view"
      active={active}
      items={[
        { key: "week", href: "/plan", label: "Week" },
        { key: "month", href: "/calendar", label: "Month" },
      ]}
    />
  );
}
