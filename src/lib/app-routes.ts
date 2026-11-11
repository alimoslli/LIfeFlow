/**
 * The pages of the app a reply can point to, by name. Tools return where to see a change (`viewAt`, like "/work"); the
 * chat shows that as a tappable link with this name instead of a path.
 */
const NAMES: Record<string, string> = {
  "/": "Today",
  "/plan": "Plan",
  "/calendar": "Calendar",
  "/tasks": "To-dos",
  "/notes": "Notes",
  "/work": "Work",
  "/school": "School",
  "/school/due": "What's due",
  "/money": "Money",
  "/wealth": "Wealth",
  "/goals": "Goals",
  "/habits": "Health",
  "/milestones": "Milestones",
  "/inbox": "Inbox",
  "/finances": "Money",
  "/finances/accounts": "Accounts",
  "/finances/bills": "Bills",
  "/finances/rules": "Rules",
  "/finances/transactions": "Transactions",
  "/jarvis/memory": "What I remember",
  "/settings": "Settings",
  "/settings/integrations": "Connections",
  "/settings/notifications": "Notifications",
  "/settings/memory": "What I remember",
};

const split = (href: string) => {
  const m = /^([^?#]*)([?#].*)?$/.exec(href.trim());
  return { path: (m?.[1] ?? "").replace(/(.)\/+$/, "$1"), rest: m?.[2] ?? "" };
};

/** The page's name when `href` is exactly one of the app's known pages (a query is allowed), else null. */
export function appRouteName(href: string): string | null {
  const { path } = split(href);
  return NAMES[path] ?? null;
}

/** A name for any in-app address a tool returned: the known name, else a readable form of its last segment. */
export function viewAtName(href: string): string {
  const known = appRouteName(href);
  if (known) return known;
  const last = split(href).path.split("/").filter(Boolean).pop() ?? "";
  if (!last || /^[0-9a-f-]{20,}$/i.test(last)) return "it";
  const words = last.replace(/[-_]/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Only addresses inside the app are links: one slash first, never "//host" or a scheme. */
export const isAppPath = (href: string) => /^\/(?!\/)[\w\-./?=&%#]*$/.test(href);

/**
 * The full-screen chat, by its path or a link to it (Updates, Memory, Profile and Ideas are normal pages). Its content is the
 * live state of the chat (lib/chat-session.ts), so it is never prefetched, by a link or by the router: a prefetched copy is
 * reused for five minutes, and a chat started after the prefetch (on Today, say) would not show when the tab was tapped.
 */
export const isChatPage = (path: string) =>
  path.startsWith("/jarvis") && !["/jarvis/says", "/jarvis/memory", "/jarvis/profile", "/jarvis/ideas"].some((x) => path.startsWith(x));

const PATHS = Object.keys(NAMES)
  .filter((p) => p !== "/")
  .sort((a, b) => b.length - a.length)
  .map((p) => p.replace(/[/]/g, "\\/"))
  .join("|");
const FOUND = new RegExp(`\`(${PATHS})(\\?[\\w=&%-]*)?\`|(^|[\\s(])(${PATHS})(\\?[\\w=&%-]*)?(?=$|[\\s.,;:!?)])`, "g");

/** Turns a known app path written in a reply (plain or in code formatting) into a markdown link with the page's name. Fenced code is left alone. */
export function linkAppPaths(markdown: string): string {
  return markdown
    .split(/(```[\s\S]*?```)/g)
    .map((part, i) => {
      if (i % 2 === 1) return part;
      const noLinks = part.split(/(\]\([^)]*\))/g); // leave existing link targets alone
      return noLinks
        .map((seg, j) => {
          if (j % 2 === 1) return seg;
          return seg.replace(FOUND, (_m, p1?: string, q1?: string, pre?: string, p2?: string, q2?: string) => {
            const path = (p1 ?? p2)!;
            return `${pre ?? ""}[${NAMES[path]}](${path}${q1 ?? q2 ?? ""})`;
          });
        })
        .join("");
    })
    .join("");
}
