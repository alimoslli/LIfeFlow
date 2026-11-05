"use client";
import { useShell } from "@/components/shell/app-shell";
import { nameAtStart } from "@/lib/assistant";

/**
 * The user's own name for their assistant (Settings → assistant). Use it in any text instead of a fixed name.
 * Until they choose one it reads "your assistant"; pass `start` at the start of a sentence ("Your assistant").
 */
export function AssistantName({ start }: { start?: boolean }) {
  const name = useShell().assistantName;
  return <>{start ? nameAtStart(name) : name}</>;
}

/** The same name as a string, for labels and placeholders in client components. */
export const useAssistantName = () => useShell().assistantName;
