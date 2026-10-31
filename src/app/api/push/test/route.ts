import { NextResponse } from "next/server";
import { getSessionUser } from "@/server/auth/current-user";
import { withUser } from "@/server/db/with-user";
import { assertSameOrigin, enforceRateLimit, errorResponse, HttpError } from "@/server/http";
import { sendOnce, webPushSender } from "@/server/services/push";

export const dynamic = "force-dynamic";

/** Sends a test notification to every device the user turned on. */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await getSessionUser();
    if (!user) throw new HttpError(401, "Not signed in");
    await enforceRateLimit(`push-test:${user.id}`, 5, 600);
    const send = await webPushSender();
    if (!send) throw new HttpError(503, "Notifications aren't available yet.");
    const delivered = await withUser(user.id, (s) =>
      sendOnce(
        s,
        `test:${Date.now()}`,
        { title: "LifeFlow notifications are on", body: "You'll get reminders, bills and your morning brief here.", url: "/settings" },
        send,
      ),
    );
    if (!delivered) throw new HttpError(502, "No device accepted the notification. Turn notifications on again on this device.");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
