import type { UserScope } from "../db/with-user";
import { auditEvents } from "../db/schema";

export type Actor = "user" | "jarvis" | "system";

/** Records a sensitive or data-changing action. Never put secrets in metadata. */
export async function audit(
  { tx, userId }: UserScope,
  actor: Actor,
  action: string,
  entity?: { type: string; id?: string },
  metadata: Record<string, unknown> = {},
) {
  await tx.insert(auditEvents).values({
    userId,
    actor,
    action,
    entityType: entity?.type,
    entityId: entity?.id,
    metadata,
  });
}
