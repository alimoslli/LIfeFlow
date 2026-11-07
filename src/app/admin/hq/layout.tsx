import type { ReactNode } from "react";

/** Scopes the HQ colours (light and dark) and animations. Pages and actions check the admin themselves. */
export default function HqLayout({ children }: { children: ReactNode }) {
  return <div className="hq">{children}</div>;
}
