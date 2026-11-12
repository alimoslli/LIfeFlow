import { expect, type Locator, type Page } from "@playwright/test";
import { Pool } from "pg";

export const pool = new Pool({ connectionString: process.env.E2E_DATABASE_URL ?? "postgresql://budgetflow:budgetflow_dev@localhost:5432/budgetflow_e2e" });

/** Where sign-up lands: setup on Today (the default) or, through /welcome, the old screens. */
export const afterSignUp = (u: URL) => u.pathname === "/" || u.pathname === "/welcome";

/**
 * Tests that aren't about setup skip it directly: the account's setup is marked done (the birthday is on the account already).
 * The real finish needs one real thing on the sky, so a test of the real finish gives the account one first (giveSomething).
 */
export async function skipSetup(page: Page) {
  await pool.query(
    `update users set preferences = preferences || '{"onboarding":"done","tour":"done"}'::jsonb where preferences->>'onboarding' = 'pending' and preferences ? 'birthDate'`,
  );
  await page.goto("/");
}

/** One real class on the account, so the real finish of setup (which needs something on the sky) can be tested. */
export async function giveSomething(email: string) {
  await queryAsUser(email, "insert into courses (user_id, name) select id, 'BIO 110' from users where email = $1", [email]);
}

export async function signUp(page: Page, name = "Jordan Lee", opts: { onboarding?: "skip" | "stay" | "app"; ai?: boolean } = {}) {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  // Every test signs up from the same IP; reset only the sign-up limiter so the suite can grow past its 10/hour cap.
  await pool.query("delete from rate_limit_buckets where key like 'signup:ip:%'");
  // the old welcome screens, for the tests that are about them (setup in the app is the default)
  if (opts.onboarding === "stay") await page.context().addCookies([{ name: "lf_setup", value: "old", url: "http://localhost:3100" }]);
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(afterSignUp);
  // Sign-up asks only for email and password; the name is asked on the first screen after. Tests set it directly so greetings read the same.
  await pool.query("update users set name = $1 where email = $2", [name, email]);
  // Tests talk to Jarvis; the "Before we start" consent is tested on its own.
  if (opts.ai !== false)
    await pool.query(`update users set preferences = preferences || '{"aiConsentAt":"2026-01-01T00:00:00.000Z"}'::jsonb where email = $1`, [email]);
  if (opts.onboarding === "stay" || opts.onboarding === "app") return email;
  // New accounts start in first-run setup; most tests skip it (no tour follows it since item 7). Setup can only be skipped with a
  // birthday on the account (owner, 2026-11-10), so the test sets one the way it sets the name.
  await pool.query(`update users set preferences = preferences || '{"birthDate":"2000-01-15"}'::jsonb where email = $1`, [email]);
  await skipSetup(page);
  await expect(page.getByRole("dialog", { name: "Welcome to LifeFlow" })).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(name.split(" ")[0]);
  return email;
}

/** The chat's message box. Until the user names their skyling it goes by its own name, Ray by default (owner, 2026-11-10). */
export const COMPOSER = "Message Ray";

/** Sends a message in the skyling's composer and waits for the reply to finish streaming. */
export async function askJarvis(page: Page, text: string) {
  const box = page.getByLabel(COMPOSER);
  await box.fill(text);
  await box.press("Enter");
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible({ timeout: 30_000 });
}

/** Queries as a given user (RLS applies to the e2e database just like the app). */
export async function queryAsUser<T = Record<string, unknown>>(email: string, text: string, params: unknown[] = []): Promise<T[]> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const { rows } = await client.query("select id from users where email = $1", [email]);
    await client.query("select set_config('app.user_id', $1, true)", [rows[0].id]);
    const res = await client.query(text, params);
    await client.query("commit");
    return res.rows as T[];
  } finally {
    client.release();
  }
}

/**
 * Everything a person can see or hear on the page: the page title, the visible text (closed
 * <details> opened first), and aria-label, placeholder, title and alt text, plus meta descriptions.
 */
export async function whatUsersSee(page: Page): Promise<string> {
  return page.evaluate(() => {
    for (const d of document.querySelectorAll("details")) d.open = true;
    const attrs = [...document.querySelectorAll("[aria-label], [placeholder], [title], [alt]")].flatMap((el) =>
      ["aria-label", "placeholder", "title", "alt"].map((a) => el.getAttribute(a) ?? ""),
    );
    const meta = [...document.querySelectorAll("meta[name=description], meta[property^='og:'], meta[name^='twitter:']")].map(
      (m) => m.getAttribute("content") ?? "",
    );
    return [document.title, document.body.innerText, ...attrs, ...meta].join("\n");
  });
}

/** Opens the quick-add sheet (Jarvis → Capture, Add buttons). Retries until the page has hydrated. */
export async function openQuickAdd(page: Page) {
  const sheet = page.getByRole("dialog", { name: "Quick add" });
  await expect(async () => {
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("lf:quick-add", { detail: "todo" })));
    await expect(sheet).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
}

/** A moment today at hour:minute on the clock in `tz` (for page.clock: tests that must not depend on the hour they run). */
export function localInstant(tz: string, hour: number, minute: number) {
  const parts = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).format(d);
  const today = parts(new Date()).slice(0, 10);
  const base = new Date();
  base.setUTCMinutes(minute, 0, 0);
  for (let i = -30; i <= 30; i++) {
    const d = new Date(base.getTime() + i * 3_600_000);
    const p = parts(d);
    if (p.slice(0, 10) === today && Number(p.slice(-2)) === hour) return d;
  }
  throw new Error(`no ${hour}:${minute} today in ${tz}`);
}

/** Picks a birthday ("YYYY-MM-DD") in the month, day and year boxes (components/ui/birthday-field.tsx). */
export async function fillBirthday(scope: Page | Locator, date: string) {
  const [y, m, d] = date.split("-").map(Number);
  await scope.getByLabel("Birthday month").selectOption(String(m));
  await scope.getByLabel("Birthday day").selectOption(String(d));
  await scope.getByLabel("Birthday year").selectOption(String(y));
}
