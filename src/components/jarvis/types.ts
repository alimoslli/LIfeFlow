import type { JarvisModule } from "@/server/db/schema";

export type JarvisAvailability = { available: boolean; reason?: string; model?: string | null; provider?: string };

export type UiTool = { callId: string; name: string; label: string; status: "running" | "ok" | "error" | "confirm"; summary?: string; viewAt?: string };
export type UiConfirmation = { actionId: string; summary: string; status: "pending" | "executed" | "cancelled" | "failed" | "expired"; resultText?: string };
export type UiAttachment = { id: string; filename: string; mimeType: string };

export type UiMessage =
  | { id: string; role: "user"; text: string; attachments: UiAttachment[] }
  | { id: string; role: "assistant"; text: string; tools: UiTool[]; confirmations: UiConfirmation[]; error?: string; streaming?: boolean };

export type { JarvisModule };
