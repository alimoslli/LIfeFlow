import { requireAdmin } from "@/server/auth/require-admin";
import { getDb } from "@/server/db/client";
import { getPreview } from "@/server/services/hq-files";

export const dynamic = "force-dynamic";

const notFound = () => new Response("Not found", { status: 404 });

/** A decision card's picture, for the owner only. Anyone else, and any unknown id, gets the same 404. This is the only route that serves them. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
  } catch {
    return notFound();
  }
  const { id } = await ctx.params;
  const f = await getPreview(getDb(), id);
  if (!f) return notFound();
  return new Response(new Uint8Array(f.data), {
    headers: {
      "content-type": f.contentType,
      "content-length": String(f.data.length),
      "cache-control": "private, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      etag: `"${f.sha256}"`,
    },
  });
}
