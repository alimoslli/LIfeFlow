import { expect, type Page } from "@playwright/test";
import { Pool } from "pg";

export const pool = new Pool({ connectionString: process.env.E2E_DATABASE_URL ?? "postgresql://budgetflow:budgetflow_dev@localhost:5432/budgetflow_e2e" });

export async function signUp(page: Page, name = "Jordan Lee") {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(name.split(" ")[0]);
  return email;
}

/** Sends a message in the Jarvis composer and waits for the reply to finish streaming. */
export async function askJarvis(page: Page, text: string) {
  const box = page.getByLabel("Message Jarvis");
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
