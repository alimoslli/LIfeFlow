"use client";
import { useShell } from "@/components/shell/app-shell";

/** The user's own name for their assistant (Settings → assistant). Use it in any text instead of a fixed name. */
export function AssistantName() {
  return <>{useShell().assistantName}</>;
}

/** The same name as a string, for labels and placeholders in client components. */
export const useAssistantName = () => useShell().assistantName;
