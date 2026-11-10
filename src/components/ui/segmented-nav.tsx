import Link from "next/link";

/**
 * Switch between closely related views. Our own control (owner, 2026-11-10: nothing may look like a phone's own controls):
 * plain words on a horizon line, and a little pixel sun rises under the one you're on (.lf-horizon in globals.css).
 */
export function SegmentedNav({ label, items, active }: { label: string; items: { key: string; href: string; label: string }[]; active: string }) {
  return (
    <nav aria-label={label} className="lf-horizon">
      {items.map((i) => (
        <Link key={i.key} href={i.href} aria-current={active === i.key ? "page" : undefined}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

export const UPDATES = [
  { key: "jarvis", href: "/jarvis/says", label: "From your skyling" },
  { key: "filed", href: "/inbox", label: "Filed" },
];

export const LIFE = [
  { key: "milestones", href: "/milestones", label: "Milestones" },
  { key: "goals", href: "/goals", label: "Goals" },
];
