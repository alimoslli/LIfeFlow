import "dotenv/config";
import { closeDb, getDb } from "../src/server/db/client";
import { users } from "../src/server/db/schema";
import { withUser } from "../src/server/db/with-user";
import { collapseInboxDuplicates } from "../src/server/services/inbox/cleanup";

/**
 * One-off (and safe to repeat): collapses bills, to-dos and exams the inbox filed more than once from the same email.
 * The original stays and anything pointing at a copy is moved to it. Run once after the 0040 migration:
 * `npm run db:collapse-inbox-dupes`.
 */
async function main() {
  const total = { inboxItems: 0, bills: 0, tasks: 0, exams: 0 };
  for (const u of await getDb().select({ id: users.id }).from(users)) {
    const c = await withUser(u.id, (s) => collapseInboxDuplicates(s));
    for (const k of Object.keys(total) as (keyof typeof total)[]) total[k] += c[k];
  }
  console.log(`Collapsed ${total.inboxItems} repeated emails, ${total.bills} bills, ${total.tasks} to-dos and ${total.exams} exams.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(closeDb);
