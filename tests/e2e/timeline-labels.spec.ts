import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { localInstant, pool, signUp } from "./helpers";

const E2E_DB = process.env.E2E_DATABASE_URL ?? "postgresql://budgetflow:budgetflow_dev@localhost:5432/budgetflow_e2e";

// The owner's screenshot (2026-11-10, 1:05 AM, a narrow laptop window): stops' words lay across the horizon line and
// were cut off at the bottom of the window. "Nothing like this can be in the app." On a busy week, at every place the
// line can be scrolled to, by day and at night, on a phone and in a narrow laptop window:
//   - no words lie across the horizon line,
//   - no words are cut off by the window,
//   - no two things' words touch each other.

async function problems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    type Box = { who: string; text: string; l: number; r: number; t: number; b: number };
    const wrap = document.querySelector<HTMLElement>(".dc-trackwrap")!;
    const track = document.querySelector<HTMLElement>(".dc-track")!;
    const w = wrap.getBoundingClientRect();
    const horizon = w.top + Number(track.dataset.horizon);
    const out: string[] = [];
    const boxes: Box[] = [];
    const add = (el: Element, who: string) => {
      const text = (el.textContent ?? "").trim();
      // a day name with no free place is left out of the picture; one that isn't shown can't be over anything
      if (!text || getComputedStyle(el).visibility === "hidden") return;
      // the words themselves, not the box they are centred in
      const range = document.createRange();
      range.selectNodeContents(el);
      for (const r of range.getClientRects()) {
        if (r.width < 1 || r.right < w.left + 2 || r.left > w.right - 2) continue; // scrolled out of the window
        boxes.push({ who, text, l: r.left, r: r.right, t: r.top, b: r.bottom });
      }
    };
    document.querySelectorAll(".dc-node").forEach((n, i) => {
      n.querySelectorAll(".dc-n-t, .dc-n-n").forEach((el) => add(el, `stop ${i}`));
    });
    document.querySelectorAll(".dc-now-t").forEach((el) => add(el, "now"));
    document.querySelectorAll(".dc-mid span").forEach((el, i) => add(el, `day ${i}`));
    for (const b of boxes) {
      if (b.t < horizon - 1 && b.b > horizon + 1) out.push(`"${b.text}" lies across the horizon`);
      if (b.b > w.bottom + 0.5 || b.t < w.top - 0.5) out.push(`"${b.text}" is cut off by the window`);
    }
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const c = boxes[j];
        if (a.who === c.who) continue;
        if (a.l < c.r - 1 && c.l < a.r - 1 && a.t < c.b - 1 && c.t < a.b - 1) out.push(`"${a.text}" touches "${c.text}"`);
      }
    return [...new Set(out)];
  });
}

async function walkTheLine(page: Page) {
  const clock = page.getByTestId("day-clock");
  await expect(clock).toHaveAttribute("data-ready", "true");
  await page.getByRole("button", { name: /^Today\. Now / }).click();
  await expect(clock).toHaveAttribute("data-state", "timeline");
  await expect(page.locator(".dc-node").first()).toBeAttached();
  await page.waitForTimeout(900); // the opening motion
  const found: string[] = [];
  const max = await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>(".dc-trackwrap")!;
    return el.scrollWidth - el.clientWidth;
  });
  // where it opens, then the whole line a window's half at a time
  found.push(...(await problems(page)));
  const step = Math.max(120, Math.floor((page.viewportSize()?.width ?? 390) / 2));
  for (let x = 0; x <= max; x += step) {
    await page.evaluate((to) => (document.querySelector<HTMLElement>(".dc-trackwrap")!.scrollLeft = to), x);
    await page.waitForTimeout(60);
    found.push(...(await problems(page)));
  }
  return [...new Set(found)];
}

/** The same walk along a line that is already open. */
async function walkTheLine2(page: Page) {
  const found: string[] = [];
  const max = await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>(".dc-trackwrap")!;
    return el.scrollWidth - el.clientWidth;
  });
  const step = Math.max(120, Math.floor((page.viewportSize()?.width ?? 390) / 2));
  for (let x = 0; x <= max; x += step) {
    await page.evaluate((to) => (document.querySelector<HTMLElement>(".dc-trackwrap")!.scrollLeft = to), x);
    await page.waitForTimeout(40);
    found.push(...(await problems(page)));
  }
  return [...new Set(found)];
}

for (const size of [
  { name: "phone", viewport: { width: 390, height: 844 } },
  { name: "narrow laptop window", viewport: { width: 990, height: 1100 } },
]) {
  for (const when of ["now", "1:05 AM", "8:10 PM"] as const) {
    test(`timeline words never lie across the horizon, get cut off or touch: ${size.name}, ${when}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: size.viewport, isMobile: size.name === "phone", hasTouch: size.name === "phone" });
      const page = await context.newPage();
      const email = await signUp(page, "Label Lee");
      execFileSync("npx", ["tsx", "--conditions=react-server", "scripts/dev/seed-clock-look.ts", email, "--busy"], {
        env: { ...process.env, DATABASE_URL: E2E_DB },
      });
      if (when !== "now") {
        // the same day at another hour: the night's low line and the evening's line near the horizon
        const d = new Date();
        const [h, m] = when === "1:05 AM" ? [1, 5] : [20, 10];
        d.setHours(h, m, 0, 0);
        await page.clock.setFixedTime(d);
      }
      await page.goto("/");
      expect(await walkTheLine(page)).toEqual([]);
      // the check itself sees the old layout as broken: with every stop's words back under it, something is wrong
      const moved = await page.evaluate(() => {
        const up = document.querySelectorAll(".dc-up");
        up.forEach((el) => el.classList.remove("dc-up"));
        return up.length;
      });
      // at night the line runs low: some stop must have had its words moved, or this proves nothing
      if (when === "1:05 AM") expect(moved).toBeGreaterThan(0);
      if (moved) expect((await problems(page)).length + (await walkTheLine2(page)).length).toBeGreaterThan(0);
      await context.close();
    });
  }
}

// The owner's rule (2026-11-10): nothing lies over anything. At night the things you finished today shine as gold stars on
// the wheel; a star must never sit on a stop's words or on the "N stars today" line.
for (const size of [
  { name: "phone", viewport: { width: 390, height: 844 } },
  { name: "narrow laptop window", viewport: { width: 990, height: 1100 } },
]) {
  test(`the stars you earned and the lines to the wheel never sit on words: ${size.name}, 9:30 PM`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: size.viewport, isMobile: size.name === "phone", hasTouch: size.name === "phone" });
    const page = await context.newPage();
    const email = await signUp(page, "Star Sky");
    execFileSync("npx", ["tsx", "--conditions=react-server", "scripts/dev/seed-clock-look.ts", email, "--busy"], {
      env: { ...process.env, DATABASE_URL: E2E_DB },
    });
    // 9:30 PM on the person's own today, in their time zone (the wheel follows their zone, not the browser's)
    const { rows } = await pool.query<{ timezone: string }>("select timezone from users where email = $1", [email.toLowerCase()]);
    await page.clock.setFixedTime(localInstant(rows[0].timezone, 21, 30));
    await page.goto("/");
    await expect(page.getByTestId("day-clock")).toHaveAttribute("data-ready", "true");
    await expect(page.getByRole("button", { name: /^Today\. Now 9:30 PM/ })).toBeVisible();
    await page.waitForTimeout(600);
    const r = await page.evaluate(() => {
      const dome = document.querySelector("[data-dc=dome]")!;
      const stars = [...dome.querySelectorAll<SVGPathElement>('path[fill="#ffd166"]')].map((e) => e.getBoundingClientRect()).filter((b) => b.width > 0);
      const words = [...dome.querySelectorAll<SVGTextElement>("text")]
        .filter((e) => (e.textContent ?? "").trim() && Number(e.getAttribute("opacity") ?? 1) > 0.05)
        .map((e) => ({ text: (e.textContent ?? "").trim(), b: e.getBoundingClientRect() }));
      const out: string[] = [];
      for (const s of stars)
        for (const w of words)
          if (s.left < w.b.right - 1 && w.b.left < s.right - 1 && s.top < w.b.bottom - 1 && w.b.top < s.bottom - 1) out.push(`a star sits on "${w.text}"`);
      // nor does the thin line from a stop's words to the wheel cross any words ("Tomorrow" was struck through)
      const ctm = (dome as SVGSVGElement).getScreenCTM()!;
      const at = (x: number, y: number) => new DOMPoint(x, y).matrixTransform(ctm);
      const cross = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number) => {
        const d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
        if (d === 0) return false;
        const u = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d;
        const v = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d;
        return u > 0.02 && u < 0.98 && v >= 0 && v <= 1;
      };
      for (const line of dome.querySelectorAll<SVGLineElement>("line")) {
        if (Number(line.getAttribute("stroke-opacity") ?? 1) < 0.05) continue;
        const p1 = at(Number(line.getAttribute("x1")), Number(line.getAttribute("y1")));
        const p2 = at(Number(line.getAttribute("x2")), Number(line.getAttribute("y2")));
        for (const w of words) {
          const { left: l, right: r, top: t, bottom: b } = w.b;
          // a line ends at its own stop's words; only someone else's words count
          const near = (q: DOMPoint) => q.x > l - 28 && q.x < r + 28 && q.y > t - 28 && q.y < b + 28;
          if (near(p1) || near(p2)) continue;
          const hit =
            cross(p1.x, p1.y, p2.x, p2.y, l, t, r, t) ||
            cross(p1.x, p1.y, p2.x, p2.y, r, t, r, b) ||
            cross(p1.x, p1.y, p2.x, p2.y, l, b, r, b) ||
            cross(p1.x, p1.y, p2.x, p2.y, l, t, l, b);
          if (hit) out.push(`a line crosses "${w.text}"`);
        }
      }
      return { stars: stars.length, line: words.some((w) => / stars? today$/.test(w.text)), out: [...new Set(out)] };
    });
    // the seeded day has finished things, so there are stars to check (otherwise this proves nothing)
    expect(r.line).toBe(true);
    expect(r.stars).toBeGreaterThan(0);
    expect(r.out).toEqual([]);
    await context.close();
  });
}
