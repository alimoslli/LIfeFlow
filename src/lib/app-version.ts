/**
 * The build that is running (the commit Vercel built). Empty on a local build, which turns the update check off.
 * The server stamps it on <html data-build> when it renders a page, and answers it at /api/version.
 */
export const liveBuild = () => process.env.VERCEL_GIT_COMMIT_SHA ?? "";

/**
 * What an open app should do once it knows which build is live.
 * - "current": nothing to do (same build, or one side doesn't know its build).
 * - "reload": it is behind and hasn't tried for this build yet.
 * - "stuck": it already reloaded for this build and is still behind (a cached page, a pinned deployment), so it
 *   leaves the person alone rather than reloading in a loop.
 */
export function updateDecision(mine: string, live: string | null | undefined, reloadedFor: string | null): "current" | "reload" | "stuck" {
  if (!mine || !live || live === mine) return "current";
  return reloadedFor === live ? "stuck" : "reload";
}
