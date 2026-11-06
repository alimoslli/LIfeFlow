#!/usr/bin/env bash
# Status line: prints a short line and saves the rate limits for HQ's weekly budget (read by scripts/hq.ts checkin).
# Never fails and never prints errors.
input=$(cat 2>/dev/null)
HQ_INPUT="$input" node -e '
try {
  const fs = require("fs"), path = require("path"), os = require("os");
  const j = JSON.parse(process.env.HQ_INPUT || "{}");
  const rl = j.rate_limits;
  const parts = [];
  if (j.model && j.model.display_name) parts.push(String(j.model.display_name));
  const num = (v) => (typeof v === "number" && isFinite(v) ? Math.round(v) : null);
  const ctx = num(j.context_window && j.context_window.used_percentage);
  if (ctx !== null) parts.push("ctx " + ctx + "%");
  const five = num(rl && rl.five_hour && rl.five_hour.used_percentage);
  const seven = num(rl && rl.seven_day && rl.seven_day.used_percentage);
  if (five !== null) parts.push("5h " + five + "%");
  if (seven !== null) parts.push("week " + seven + "%");
  if (rl && (five !== null || seven !== null)) {
    try {
      const dir = path.join(process.env.HOME || os.homedir(), ".claude");
      fs.mkdirSync(dir, { recursive: true });
      const tmp = path.join(dir, "hq-usage.json.tmp" + process.pid);
      fs.writeFileSync(tmp, JSON.stringify({ saved_at: Math.floor(Date.now() / 1000), five_hour: rl.five_hour || null, seven_day: rl.seven_day || null }));
      fs.renameSync(tmp, path.join(dir, "hq-usage.json"));
    } catch (e) {}
  }
  process.stdout.write(parts.join(" · ") + "\n");
} catch (e) {}
' 2>/dev/null
exit 0
