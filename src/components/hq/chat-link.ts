/**
 * Which Claude Code link to follow on this device (ADR 0029 addendum 2). A new chat has two pre-fill links: the web's
 * (`claude.ai/code?prompt=…`) and the Claude app's (`claude.ai/code/new?q=…`, a universal link that opens the app). Phones
 * and tablets get the app's; everything else the web's. iPadOS reports itself as a Mac, so a touch screen on "Macintosh"
 * counts as a tablet.
 */
export function onPhoneOrTablet(
  nav: Pick<Navigator, "userAgent" | "maxTouchPoints"> | undefined = typeof navigator === "undefined" ? undefined : navigator,
): boolean {
  if (!nav) return false;
  return /iPhone|iPad|iPod|Android/i.test(nav.userAgent) || (/Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1);
}

export const pickChatHref = (href: string, appHref?: string | null): string => (appHref && onPhoneOrTablet() ? appHref : href);
