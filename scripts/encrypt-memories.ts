import "dotenv/config";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "../src/server/db/client";
import { users, memories } from "../src/server/db/schema";
import { withUser } from "../src/server/db/with-user";
import { isSealed } from "../src/server/crypto";
import { sql } from "drizzle-orm";

/** One-time (and safe to repeat): encrypts memories saved before encryption at rest. Runs on deploy. */
async function main() {
  if (!process.env.ENCRYPTION_KEY) return console.log("ENCRYPTION_KEY not set; memories stay as they are.");
  let n = 0;
  for (const u of await getDb().select({ id: users.id }).from(users))
    await withUser(u.id, async (s) => {
      const raw = (await s.tx.execute(sql`select id, content from memories`)).rows as { id: string; content: string }[];
      for (const r of raw.filter((x) => !isSealed(x.content))) {
        await s.tx.update(memories).set({ content: r.content }).where(eq(memories.id, r.id));
        n++;
      }
    });
  console.log(`Encrypted ${n} memories.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(closeDb);
