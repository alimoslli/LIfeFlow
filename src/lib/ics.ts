/**
 * A small iCalendar (RFC 5545) reader for calendar feeds: just VEVENTs and the
 * fields we use. Feed text is untrusted; nothing here runs or follows it.
 */

export type IcsTime = { date: string; time: string | null; utc: boolean; tzid: string | null };
export type IcsEvent = { uid: string; summary: string; start: IcsTime | null; end: IcsTime | null; url: string | null; location: string | null };

const unescape = (v: string) => v.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");

function time(params: string, value: string): IcsTime | null {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})\d{2}(Z)?)?$/);
  if (!m) return null;
  return {
    date: `${m[1]}-${m[2]}-${m[3]}`,
    time: m[4] ? `${m[4]}:${m[5]}` : null,
    utc: !!m[6],
    tzid: params.match(/;TZID=("?)([^;:"]+)\1/i)?.[2] ?? null,
  };
}

export function parseIcs(text: string, maxEvents = 5000): IcsEvent[] {
  // Unfold: a line starting with a space or tab continues the previous one.
  const lines = text
    .replace(/\r\n?/g, "\n")
    .replace(/\n[ \t]/g, "")
    .split("\n");
  const out: IcsEvent[] = [];
  let cur: Partial<IcsEvent> | null = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") cur = { url: null, location: null, start: null, end: null };
    else if (line === "END:VEVENT") {
      if (cur?.uid && cur.summary !== undefined) out.push(cur as IcsEvent);
      cur = null;
      if (out.length >= maxEvents) break;
    } else if (cur) {
      const colon = line.indexOf(":");
      if (colon < 0) continue;
      const [name, ...rest] = line.slice(0, colon).split(";");
      const params = rest.length ? `;${rest.join(";")}` : "";
      const value = line.slice(colon + 1);
      switch (name.toUpperCase()) {
        case "UID":
          cur.uid = value.trim();
          break;
        case "SUMMARY":
          cur.summary = unescape(value).trim();
          break;
        case "DTSTART":
          cur.start = time(params, value.trim());
          break;
        case "DTEND":
          cur.end = time(params, value.trim());
          break;
        case "URL":
          cur.url = value.trim();
          break;
        case "LOCATION":
          cur.location = unescape(value).trim() || null;
          break;
      }
    }
  }
  return out;
}
