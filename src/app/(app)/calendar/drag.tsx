"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { moveItemAction } from "./actions";

type Movable = "event" | "task" | "assignment";
const MIME = "application/x-lifeflow-item";

/** A day-list row that can be dragged onto another day (events, to-dos, assignments). */
export function DragItem({
  origin,
  id,
  movable,
  className,
  children,
}: {
  origin: string;
  id: string;
  movable: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <li
      draggable={movable}
      onDragStart={(e) => {
        e.dataTransfer.setData(MIME, JSON.stringify({ origin, id }));
        e.dataTransfer.effectAllowed = "move";
      }}
      className={cn(className, movable && "cursor-grab active:cursor-grabbing")}
      title={movable ? "Drag to another day" : undefined}
    >
      {children}
    </li>
  );
}

/** A day in the month grid: a link, and a drop target. */
export function DropDay({
  date,
  href,
  className,
  children,
  ...rest
}: { date: string; href: string; className?: string; children: ReactNode } & Record<string, unknown>) {
  const router = useRouter();
  const [over, setOver] = useState(false);
  return (
    <Link
      {...rest}
      href={href}
      scroll={false}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(MIME)) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={async (e) => {
        e.preventDefault();
        setOver(false);
        const raw = e.dataTransfer.getData(MIME);
        if (!raw) return;
        const { origin, id } = JSON.parse(raw) as { origin: Movable; id: string };
        const r = await moveItemAction(origin, id, date);
        if (!r?.ok) return void toast(r?.error ?? "Couldn't move it.", { tone: "danger" });
        toast(r.message ?? "Moved.");
        router.push(href, { scroll: false });
        router.refresh();
      }}
      className={cn(className, over && "ring-2 ring-accent")}
    >
      {children}
    </Link>
  );
}
