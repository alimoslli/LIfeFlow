import Link from "next/link";
import { Card } from "@/components/ui/surface";

/**
 * For the sources that don't connect automatically: send your assistant a picture or a file,
 * or just tell it. Shown beside the connection it replaces.
 */
export function ManualSourceCard({ title, body, tip }: { title: string; body: string; tip: string }) {
  return (
    <Card className="p-5">
      <h2 className="font-medium">{title}</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-text-2">{body}</p>
      <p className="mt-3 rounded-2xl bg-surface-2 px-3.5 py-2.5 text-[0.8125rem] leading-relaxed text-text-2">{tip}</p>
      <Link href="/jarvis" className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-accent hover:underline">
        Open your assistant
      </Link>
    </Card>
  );
}
