import { pool } from "./helpers";

/** A real 1x1 png, the bytes HQ's picture upload accepts. */
export const PNG_BYTES = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHzO3cQAAAABJRU5ErkJggg==", "base64");

/** Stores a picture straight in hq_files (for specs that seed rows with SQL). Returns its id. */
export async function insertPicture(): Promise<string> {
  const r = await pool.query(`insert into hq_files (content_type, size, sha256, data) values ('image/png', $1, 'e2e', $2) returning id`, [
    PNG_BYTES.length,
    PNG_BYTES,
  ]);
  return r.rows[0].id as string;
}

export type CardSeed = {
  role?: string;
  kind?: string;
  title: string;
  threadId?: string;
  version?: number;
  status?: "pending" | "approved" | "declined" | "changes";
  decisionNote?: string;
  changedSinceNote?: string;
  missionId?: string | null;
  /** The mission that builds an approved ask (`approval --start`); its status drives the lifecycle. */
  buildMissionId?: string | null;
  superseded?: boolean;
  createdAt?: string;
  decidedAt?: string;
};

/** A complete decision card (ADR 0028) seeded with SQL. Returns the approval id. */
export async function insertCard(c: CardSeed): Promise<string> {
  const pic = await insertPicture();
  const previews = JSON.stringify([
    { fileId: pic, label: "Today" },
    { fileId: pic, label: "If you say yes" },
  ]);
  const r = await pool.query(
    `insert into hq_approvals (role, kind, title, summary, source, status, decision_note, decided_at, why, changes, on_yes, on_no, effort, risk, recommendation, previews,
        thread_id, version, changed_since_note, mission_id, superseded_at, created_at)
     values ($1, $2, $3, 'e2e', 'agent', $4, $5, $6, 'Students could not find where to add a goal.', $7::jsonb, 'Tonight the developer builds it; tomorrow you get pictures to okay.',
        'Nothing changes.', 'small', 'Low: it moves screens and does not touch anyone''s data.', 'Yes. It fixes the most common first-week confusion.', $8::jsonb,
        $9, $10, $11, $12, $13, coalesce($14::timestamptz, now()))
     returning id`,
    [
      c.role ?? "designer",
      c.kind ?? "design",
      c.title,
      c.status ?? "pending",
      c.decisionNote ?? null,
      c.decidedAt ?? (c.status && c.status !== "pending" ? new Date().toISOString() : null),
      JSON.stringify(["Goals and Habits become one list", "The Habits tab leaves Plan"]),
      previews,
      c.threadId ?? null,
      c.version ?? 1,
      c.changedSinceNote ?? null,
      c.missionId ?? null,
      c.superseded ? new Date().toISOString() : null,
      c.createdAt ?? null,
    ],
  );
  const id = r.rows[0].id as string;
  if (!c.threadId) await pool.query("update hq_approvals set thread_id = id where id = $1", [id]);
  if (c.buildMissionId) await pool.query("update hq_approvals set build_mission_id = $2 where id = $1", [id, c.buildMissionId]);
  return id;
}
