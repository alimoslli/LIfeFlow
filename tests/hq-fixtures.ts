import { getDb } from "@/server/db/client";
import { storePreview } from "@/server/services/hq-files";
import type { ApprovalInput } from "@/server/services/hq";

/** A real 1x1 png (the bytes a picture upload checks). */
export const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHzO3cQAAAABJRU5ErkJggg==", "base64");

export async function makePreview(): Promise<string> {
  return (await storePreview(getDb(), PNG, "image/png")).id;
}

/** A complete decision card (ADR 0028) with one stored picture; pass overrides for the parts a test cares about. */
export async function card(over: Partial<ApprovalInput> & Pick<ApprovalInput, "role" | "kind" | "title">): Promise<ApprovalInput> {
  return {
    why: "Students could not find where to add a goal.",
    changes: ["Goals and Habits become one list"],
    onYes: "Tonight the developer builds it on its own branch; tomorrow you get pictures to okay.",
    onNo: "Nothing changes.",
    effort: "small",
    risk: "Low: it moves screens and does not touch anyone's data.",
    recommendation: "Yes. It fixes the most common first-week confusion.",
    previews: [{ fileId: await makePreview(), label: "If you say yes" }],
    ...over,
  };
}

/** A card request body for the /api/hq/report route (the same fields, plus the type). */
export async function cardBody(over: Partial<ApprovalInput> = {}) {
  return { type: "approval", ...(await card({ role: "designer", kind: "design", title: "Make Goals one list", ...over })) };
}

/** The decision-card part of a publish ask (content `request`). */
export async function reqCard() {
  const { role: _r, kind: _k, title: _t, ...rest } = await card({ role: "marketing", kind: "publish", title: "x" });
  return rest;
}
