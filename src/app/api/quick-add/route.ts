import { NextResponse } from "next/server";
import { todayIn } from "@/lib/dates";
import { getSessionUser } from "@/server/auth/current-user";
import { series } from "@/server/db/series";
import { withUser } from "@/server/db/with-user";
import { errorResponse, HttpError } from "@/server/http";
import { listAccounts } from "@/server/services/finance/accounts";
import { listEmployers } from "@/server/services/work";

export const dynamic = "force-dynamic";

/** What the quick-add sheet needs: jobs for shifts and accounts for spending. */
export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) throw new HttpError(401, "Not signed in");
    const d = await withUser(user.id, async (s) => {
      const [employers, accounts] = await series(
        () => listEmployers(s),
        () => listAccounts(s),
      );
      return {
        today: todayIn(user.timezone),
        employers: employers.map((e) => ({ id: e.id, name: e.name })),
        accounts: accounts.filter((a) => a.type !== "investment" && a.type !== "loan").map((a) => ({ id: a.id, name: a.name, type: a.type })),
      };
    });
    return NextResponse.json(d);
  } catch (e) {
    return errorResponse(e);
  }
}
