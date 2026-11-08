import { Hammer } from "lucide-react";
import { cn } from "@/lib/utils";

/** The little lines for anything that isn't built yet. Picked by `line`, never random, so the server and the browser agree. */
const LINES = ["Still being built.", "Ali hasn't gotten here yet."] as const;

/**
 * Anything not built yet says so with a small tapping hammer and a friendly line, instead of a flat error.
 * `detail` is the useful part ("You can add accounts by hand meanwhile."). The hammer is CSS (transform only) and still under reduced motion.
 */
export function StillBuilding({
  detail,
  line = 0,
  className,
  ...rest
}: { detail?: string; line?: 0 | 1; className?: string } & React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("flex items-start gap-2.5 text-sm text-text-2", className)} {...rest}>
      <span className="relative mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning" aria-hidden>
        <Hammer className="lf-tap h-3.5 w-3.5" />
        <span className="lf-spark absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-warning" />
      </span>
      <span>
        <span className="font-medium text-text">{LINES[line]}</span>
        {detail ? ` ${detail}` : ""}
      </span>
    </p>
  );
}
