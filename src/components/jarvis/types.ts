import type { JarvisModule } from "@/server/db/schema";

export type JarvisAvailability = { available: boolean; reason?: string; model?: string | null; provider?: string };

export type UiSource = { title: string; url: string };
export type UiTool = {
  callId: string;
  name: string;
  label: string;
  status: "running" | "ok" | "error" | "confirm";
  summary?: string;
  viewAt?: string;
  sources?: UiSource[];
};
export type UiConfirmation = { actionId: string; summary: string; status: "pending" | "executed" | "cancelled" | "failed" | "expired"; resultText?: string };
/** A memory Jarvis suggested; the user keeps or dismisses it. */
export type UiMemorySuggestion = { memoryId: string; content: string; replaces?: string; status: "proposed" | "saved" | "dismissed" | "gone"; error?: string };
export type UiAttachment = { id: string; filename: string; mimeType: string };

export type UiMessage =
  | { id: string; role: "user"; text: string; attachments: UiAttachment[] }
  | {
      id: string;
      role: "assistant";
      text: string;
      tools: UiTool[];
      confirmations: UiConfirmation[];
      memories: UiMemorySuggestion[];
      error?: string;
      streaming?: boolean;
    };

export type { JarvisModule };
