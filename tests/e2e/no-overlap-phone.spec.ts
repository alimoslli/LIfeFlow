import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { signUp } from "./helpers";

/**
 * No two visible controls overlap, and no field sticks out of its container, on the phone sizes we support.
 *
 * LIMIT, said plainly: Playwright here has only Chromium; the iPhone app draws pages with WebKit. This spec finds layout
 * mistakes that show up in any engine (a button wider than its row, a field with no min-w-0, long words that push a
 * neighbour). It cannot see WebKit-only rendering, such as iOS drawing date and time fields at their own width (the
 * "Expires (optional)" date under its Add button). Those are covered by the global rules in src/app/globals.css
 * (input[type=date|time|...] { appearance: none; min-width: 0; max-width: 100% }), and by a check on a real iPhone.
 *
 * Checked: every main screen, the forms and dialogs reached by tapping its Add / New / Edit style buttons, and
 * onboarding; at 375x667 and 393x852, at normal and Extra large text.
 */

const SIZES = [
  { width: 375, height: 667 },
  { width: 393, height: 852 },
];
const TEXT = ["normal", "xlarge"] as const;

const SCREENS = [
  "/",
  "/plan",
  "/calendar",
  "/tasks",
  "/milestones",
  "/goals",
  "/habits",
  "/work",
  "/inbox",
  "/jarvis",
  "/jarvis/says",
  "/jarvis/ideas",
  "/jarvis/profile",
  "/jarvis/memory",
  "/jarvis/memory/import",
  "/money",
  "/finances",
  "/finances/accounts",
  "/finances/transactions",
  "/finances/bills",
  "/finances/rules",
  "/school",
  "/school/due",
  "/notes",
  "/settings",
  "/settings/profile",
  "/settings/jarvis",
  "/settings/memory",
  "/settings/integrations",
  "/settings/notifications",
  "/settings/security",
  "/settings/data",
  "/settings/trash",
  "/settings/text",
  "/settings/invite",
  "/settings/feedback",
  "/settings/plan",
];

// Buttons that open a form or dialog. Anything destructive is left out.
const OPENERS = /^(\+\s*)?(add|new|edit|log|create|plan|schedule|capture|quick|set|change|import|rename|filters?|more|customi[sz]e)\b/i;
const NOT_OPENERS = /delete|remove|sign out|log out|clear|reset|archive|discard|cancel|close/i;

type Found = { kind: "overlap" | "outside"; a: string; b?: string };

/** Runs in the page: returns the overlaps between controls and the fields that stick out of their container. */
async function findProblems(page: Page): Promise<Found[]> {
  return page.evaluate(() => {
    const SEL =
      "a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=radio], [role=switch], [role=checkbox], [role=slider]";
    const TOL = 1;
    type Item = { el: HTMLElement; r: { l: number; t: number; r: number; b: number }; fixed: Element | null };
    const describe = (el: HTMLElement) => {
      const name = (
        el.getAttribute("aria-label") ||
        el.closest("label")?.textContent ||
        el.innerText ||
        el.getAttribute("placeholder") ||
        el.getAttribute("name") ||
        ""
      )
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 40);
      const type = el instanceof HTMLInputElement ? `[${el.type}]` : "";
      const b = el.getBoundingClientRect();
      return `<${el.tagName.toLowerCase()}${type}> "${name}" x ${Math.round(b.left)}-${Math.round(b.right)}, y ${Math.round(b.top + scrollY)}-${Math.round(b.bottom + scrollY)}`;
    };
    // An open dialog covers the page: only its own controls count.
    const dialog = [...document.querySelectorAll<HTMLElement>("dialog[open], [role=dialog], [aria-modal=true]")]
      .filter((d) => getComputedStyle(d).display !== "none" && d.getBoundingClientRect().width > 0)
      .pop();
    const root: ParentNode = dialog ?? document;
    // Floating layers (tab bar, assistant button, menus that open over the page) sit on top of the page by design;
    // their controls are only compared with each other.
    const layered = (s: CSSStyleDeclaration) => s.position === "fixed" || s.position === "sticky" || (s.position === "absolute" && s.zIndex !== "auto");
    const items: Item[] = [];
    for (const el of root.querySelectorAll<HTMLElement>(SEL)) {
      const cs = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      if (cs.visibility === "hidden" || cs.display === "none" || box.width <= 2 || box.height <= 2) continue; // also skips sr-only inputs
      if (el.closest("[aria-hidden=true], [inert]") || cs.pointerEvents === "none") continue;
      if (el.closest("details:not([open])") && !el.closest("summary")) continue;
      if (el.closest("p, li > span") && el.matches("a")) continue; // a link inside a sentence
      // Clip by scrolling containers: what you can't see can't overlap.
      const r = { l: box.left, t: box.top, r: box.right, b: box.bottom };
      let fixed: Element | null = null;
      for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
        const s = getComputedStyle(a);
        if (!fixed && layered(s)) fixed = a;
        if (a === document.body) break;
        if (s.overflowX !== "visible" || s.overflowY !== "visible") {
          const c = a.getBoundingClientRect();
          if (s.overflowX !== "visible") {
            r.l = Math.max(r.l, c.left);
            r.r = Math.min(r.r, c.right);
          }
          if (s.overflowY !== "visible") {
            r.t = Math.max(r.t, c.top);
            r.b = Math.min(r.b, c.bottom);
          }
        }
      }
      if (layered(cs)) fixed = el;
      if (r.r - r.l <= TOL || r.b - r.t <= TOL) continue;
      items.push({ el, r, fixed });
    }
    const out: Found[] = [];
    for (let i = 0; i < items.length; i++)
      for (let j = i + 1; j < items.length; j++) {
        const [x, y] = [items[i], items[j]];
        if (x.el.contains(y.el) || y.el.contains(x.el)) continue;
        if (x.fixed !== y.fixed && !dialog) continue; // the tab bar and assistant button float over content by design
        const w = Math.min(x.r.r, y.r.r) - Math.max(x.r.l, y.r.l);
        const h = Math.min(x.r.b, y.r.b) - Math.max(x.r.t, y.r.t);
        if (w > TOL && h > TOL) out.push({ kind: "overlap", a: describe(x.el), b: describe(y.el) });
      }
    // A field must stay inside its own container (and the screen).
    for (const { el, r } of items) {
      if (!el.matches("input, select, textarea")) continue;
      if (el.matches("input[type=checkbox], input[type=radio], input[type=range]")) continue;
      const p = el.parentElement!;
      const pc = p.getBoundingClientRect();
      const ps = getComputedStyle(p);
      const scrolls = ps.overflowX !== "visible";
      const padL = parseFloat(ps.paddingLeft) || 0;
      const padR = parseFloat(ps.paddingRight) || 0;
      const b = el.getBoundingClientRect();
      if (!scrolls && (b.right > pc.right + TOL || b.left < pc.left - TOL) && pc.width > 0)
        out.push({ kind: "outside", a: `${describe(el)} sticks out of its container (${Math.round(pc.left + padL)}-${Math.round(pc.right - padR)})` });
      else if (b.right > innerWidth + TOL || b.left < -TOL) out.push({ kind: "outside", a: `${describe(el)} sticks out of the screen` });
      void r;
    }
    return out;
  });
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(350); // entrance animations
}

for (const size of SIZES)
  for (const text of TEXT) {
    test(`${size.width}x${size.height}, ${text} text: no controls overlap or stick out`, async ({ page, context, baseURL }) => {
      test.setTimeout(900_000);
      await page.setViewportSize(size);
      const problems: string[] = [];
      const seen = new Set<string>();
      const opened = new Set<string>();
      const where = (w: string) => `${w} @ ${size.width}x${size.height}, ${text} text`;
      const check = async (w: string) => {
        for (const f of await findProblems(page)) {
          const line = f.kind === "overlap" ? `OVERLAP on ${where(w)}\n    ${f.a}\n    ${f.b}` : `OUTSIDE on ${where(w)}\n    ${f.a}`;
          const key = `${w}|${f.a}|${f.b}`;
          if (!seen.has(key)) {
            seen.add(key);
            problems.push(line);
          }
        }
      };
      /** Opens each Add / New / Edit style button on the current page, one at a time, and checks what opens. */
      const checkOpeners = async (path: string) => {
        const names = await page.locator("main button, main summary").evaluateAll(
          (bs, [yes, no]) =>
            bs
              .filter((b) => {
                const r = b.getBoundingClientRect();
                const t = ((b as HTMLElement).getAttribute("aria-label") || (b as HTMLElement).innerText || "").trim().split("\n")[0];
                return r.width > 0 && (b as HTMLButtonElement).type !== "submit" && new RegExp(yes, "i").test(t) && !new RegExp(no, "i").test(t);
              })
              .map((b) => ((b as HTMLElement).getAttribute("aria-label") || (b as HTMLElement).innerText || "").trim().split("\n")[0]),
          [OPENERS.source, NOT_OPENERS.source],
        );
        for (const name of [...new Set(names)].slice(0, 8)) {
          await page.goto(path);
          await settle(page);
          const btn = page.locator("main").getByRole("button", { name, exact: true }).first();
          const target = (await btn.count()) ? btn : page.locator("main summary", { hasText: name }).first();
          try {
            await target.click({ timeout: 3000 });
          } catch {
            continue; // covered or gone: other specs own that
          }
          await settle(page);
          opened.add(`${path} > ${name}`);
          await check(`${path} after "${name}"`);
          for (const d of await page.locator("main details:not([open]) > summary").all()) await d.click({ timeout: 1000 }).catch(() => {});
          await check(`${path} after "${name}" (sections open)`);
        }
      };

      /** Opens the editor behind each calendar row (events, shifts, assignments), a few of each, and checks it. */
      const checkRows = async (path: string) => {
        const rows = page.locator("main button.w-full.text-left");
        const count = Math.min(await rows.count(), 6);
        for (let i = 0; i < count; i++) {
          await page.goto(path);
          await settle(page);
          try {
            await rows.nth(i).click({ timeout: 3000 });
          } catch {
            continue;
          }
          await settle(page);
          opened.add(`${path} > row ${i + 1} editor`);
          await check(`${path} row ${i + 1} editor`);
        }
      };

      // Sign-in pages, signed out.
      for (const p of ["/login", "/signup", "/forgot-password"]) {
        await page.goto(p);
        await settle(page);
        await check(p);
      }
      await context.addCookies([{ name: "lf_text", value: text, url: baseURL! }]);

      // Onboarding, every step.
      const email = await signUp(page, "Olive Overlap", { onboarding: "stay" });
      await context.addCookies([{ name: "lf_text", value: text, url: baseURL! }]);
      await page.reload();
      await check("welcome/skyling");
      await page.getByRole("button", { name: "Continue" }).click();
      await page.getByLabel("What should I call you?").fill("Tara");
      await page.getByLabel("Your birthday").fill("2004-03-15");
      await page.getByRole("radio", { name: /Both/ }).click();
      await page.getByLabel("Your school").fill("Introduction to Organic Chemistry University");
      await page.getByLabel("Where you work").fill("Campus Coffee and Bakery Downtown");
      await check("welcome/about");
      await page.getByRole("button", { name: "Connect my sky" }).click();
      await check("welcome/connect");
      await page.getByRole("button", { name: "I'll connect later" }).click();
      await check("welcome/learn");
      await page.getByRole("button", { name: "Skip setup" }).click();
      await page.waitForURL((u) => u.pathname === "/");
      // no tour after the welcome (item 7); the replayed one is checked the same way
      await page.goto("/settings");
      await page.getByRole("button", { name: "Replay the tour" }).click();
      await page.waitForURL((u) => u.pathname === "/");
      await expect(page.getByRole("dialog", { name: "Welcome to LifeFlow" })).toBeVisible();
      await check("tour");
      await page.getByRole("button", { name: "Skip tour" }).click();

      execFileSync("npx", ["tsx", "--conditions=react-server", "scripts/seed-coach.ts", email], {
        env: { ...process.env, DATABASE_URL: "postgresql://budgetflow:budgetflow_dev@localhost:5432/budgetflow_e2e" },
      });

      // Detail pages are found from their lists.
      const paths = [...SCREENS];
      for (const list of ["/tasks", "/notes", "/school", "/jarvis"]) {
        await page.goto(list);
        await settle(page);
        const hrefs = await page.locator("main a[href]").evaluateAll((as) => as.map((a) => new URL((a as HTMLAnchorElement).href).pathname));
        const detail = hrefs.find(
          (h) => new RegExp(`^${list}/[^/]+$`).test(h) && !["/jarvis/says", "/jarvis/ideas", "/jarvis/profile", "/jarvis/memory"].includes(h),
        );
        if (detail) paths.push(detail);
      }
      const courses = await page.evaluate(() => [...document.querySelectorAll("a[href^='/school/courses/']")].map((a) => (a as HTMLAnchorElement).pathname));
      await page.goto("/school");
      paths.push(
        ...(await page.locator("a[href^='/school/courses/']").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).pathname))).slice(0, 1),
        ...courses.slice(0, 1),
      );

      for (const path of new Set(paths)) {
        await page.goto(path);
        await settle(page);
        await check(path);
        await checkOpeners(path);
        if (["/plan", "/calendar", "/work", "/school/due"].includes(path)) await checkRows(path);
      }

      // The memory form, and the edit dialog of a memory that was just added.
      await page.goto("/jarvis/memory");
      await settle(page);
      await page.locator("#m-c").fill("I work at the campus library on Tuesdays and Thursdays.");
      await page.locator("#m-e").fill("2027-01-15");
      await check("/jarvis/memory add form, filled in");
      await page.getByRole("button", { name: "Add", exact: true }).click();
      await page.getByRole("button", { name: "Edit memory" }).first().click();
      await settle(page);
      opened.add("/jarvis/memory > Edit memory");
      await check("/jarvis/memory edit dialog");

      // Quick add (the Capture sheet), every kind it offers.
      for (const kind of ["todo", "event", "note", "expense", "habit", "goal"]) {
        await page.goto("/");
        await settle(page);
        await page.evaluate((k) => window.dispatchEvent(new CustomEvent("lf:quick-add", { detail: k })), kind);
        await page.waitForTimeout(500);
        if (await page.getByRole("dialog", { name: "Quick add" }).isVisible()) await check(`quick add (${kind})`);
      }

      console.log(`Opened ${opened.size} forms and dialogs:\n  ${[...opened].join("\n  ")}`);
      console.log(problems.length ? `PROBLEMS:\n${problems.join("\n")}` : "NO OVERLAPS");
      expect(problems, problems.join("\n")).toEqual([]);
    });
  }

// The check itself must catch the bug it is here for: a date field running under the Add button on the memory form.
test("the check flags a date field that runs under its Add button", async ({ page }) => {
  await page.setViewportSize(SIZES[0]);
  await signUp(page, "Dana Detector");
  await page.goto("/jarvis/memory");
  await settle(page);
  const date = page.getByLabel(/Expires/).first();
  await expect(date).toBeVisible();
  expect(await findProblems(page), "the memory form is clean as shipped").toEqual([]);
  // What iOS does: the field is drawn wider than the box the layout gave it.
  await date.evaluate((el) => {
    const box = el.parentElement as HTMLElement;
    box.style.width = "11rem";
    box.style.flex = "none";
    el.style.width = "20rem";
    el.style.maxWidth = "none";
  });
  const found = await findProblems(page);
  expect(found.length, "an Expires field that wide is reported").toBeGreaterThan(0);
  expect(JSON.stringify(found)).toMatch(/Expires|Add/);
});
