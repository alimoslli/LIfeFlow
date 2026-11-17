import { describe, expect, it } from "vitest";
import { EmailError, sendEmail } from "@/server/integrations/email";
import { scrub } from "@/server/services/error-reports";

/**
 * When the email provider refuses a message, the error says why (owner, 2026-11-17: waitlist codes and password resets
 * failed for everyone but the owner, and the report only said "HTTP 403"). The reason is bounded, and the error report
 * scrubs any address in it.
 */
const cfg = { apiKey: "re_test", from: "LifeFlow <hello@lifeflowweb.com>" };
const msg = { to: "someone@example.com", subject: "s", text: "t", html: "<p>t</p>" };
const reply = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("email provider refusals say why", () => {
  it("names the provider's reason with the status", async () => {
    const f = reply(403, { name: "validation_error", message: "The lifeflowweb.com domain is not verified. Please, add and verify your domain." });
    await expect(sendEmail(cfg, msg, f)).rejects.toThrow(
      "Email provider refused the message (HTTP 403): validation_error: The lifeflowweb.com domain is not verified. Please, add and verify your domain.",
    );
  });

  it("keeps the old wording when the provider gives no reason, and bounds a long one", async () => {
    await expect(sendEmail(cfg, msg, reply(500, {}))).rejects.toThrow("Email provider refused the message (HTTP 500).");
    const long = "x".repeat(500);
    const e = await sendEmail(cfg, msg, reply(403, { name: "n", message: long })).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(EmailError);
    expect((e as Error).message.length).toBeLessThan(220);
  });

  it("an address in the reason is scrubbed before it is stored", async () => {
    const f = reply(403, { name: "validation_error", message: "You can only send testing emails to your own email address (owner@gmail.com)." });
    const e = (await sendEmail(cfg, msg, f).catch((x: unknown) => x)) as Error;
    expect(e.message).toContain("own email address");
    expect(scrub(e.message)).not.toContain("owner@gmail.com");
  });
});
