// Loaded into the e2e server (NODE_OPTIONS --require): answers one made-up Canvas Calendar Feed address with a made-up feed, so
// "paste the link" can be tested without calling a real Canvas. Everything else goes to the real fetch. Test only.
const real = globalThis.fetch;
const FEED = "https://canvas-e2e.example.edu/feeds/calendars/user_E2eFakeFeedLink0123456789.ics";
const ics = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");
globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url === FEED) {
    const day = (n) => ics(new Date(Date.now() + n * 86_400_000));
    const body = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:event-assignment-9001",
      `DTSTART:${day(3)}T235900Z`,
      "SUMMARY:Lab report 2 [BIO 110]",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:event-assignment-9002",
      `DTSTART:${day(5)}T235900Z`,
      "SUMMARY:Essay draft [ENG 101]",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    return new Response(body, { status: 200, headers: { "content-type": "text/calendar" } });
  }
  return real(input, init);
};
