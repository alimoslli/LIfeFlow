import { redirect } from "next/navigation";

type Params = Record<string, string | string[] | undefined>;

/**
 * Old admin URLs (ADR 0027) go to their new place with the query string kept. Call it after `requireAdmin()` so anyone
 * else still gets a 404. `rename` maps a param whose name changed to avoid a clash on the new page.
 */
export async function redirectKeeping(searchParams: Promise<Params>, to: string, hash?: string, rename: Record<string, string> = {}): Promise<never> {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    for (const one of Array.isArray(v) ? v : v === undefined ? [] : [v]) qs.append(rename[k] ?? k, one);
  }
  redirect(`${to}${qs.size ? `?${qs}` : ""}${hash ? `#${hash}` : ""}`);
}
