"use client";
import {
  browserSupportsWebAuthn,
  browserSupportsWebAuthnAutofill,
  platformAuthenticatorIsAvailable,
  startAuthentication,
  startRegistration,
  WebAuthnError,
} from "@simplewebauthn/browser";

/**
 * Browser side of passkeys. The server makes every challenge and checks every
 * answer; this only passes them to the phone's Face ID / Touch ID prompt.
 */

export class PasskeyCancelled extends Error {}

const post = async <T>(url: string, body?: unknown): Promise<T> => {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Something went wrong. Please try again.");
  return json;
};

/** The person dismissed the system sheet (or another prompt replaced it): not an error to show. */
const cancelled = (e: unknown) =>
  (e instanceof WebAuthnError && (e.code === "ERROR_CEREMONY_ABORTED" || e.code === "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY")) ||
  (e instanceof Error && (e.name === "NotAllowedError" || e.name === "AbortError"));

async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (cancelled(e)) throw new PasskeyCancelled();
    throw e;
  }
}

export const passkeysSupported = () => typeof window !== "undefined" && browserSupportsWebAuthn();
export const passkeyAutofillSupported = () => browserSupportsWebAuthnAutofill();
export const deviceHasBiometrics = () => platformAuthenticatorIsAvailable();

/** What to call the unlock on this device. */
export function biometricName() {
  if (typeof navigator === "undefined") return "a passkey";
  const ua = navigator.userAgent;
  if (/iPhone|iPad/.test(ua)) return "Face ID";
  if (/Mac/.test(ua)) return "Touch ID";
  if (/Android/.test(ua)) return "your fingerprint or screen lock";
  if (/Windows/.test(ua)) return "Windows Hello";
  return "a passkey";
}

/** Sign in. With `autofill`, waits for the person to pick a passkey from the email field's suggestions. */
export async function signInWithPasskey(next = "/", autofill = false) {
  const { options } = await post<{ options: Parameters<typeof startAuthentication>[0]["optionsJSON"] }>("/api/auth/passkey/options");
  const response = await run(() => startAuthentication({ optionsJSON: options, useBrowserAutofill: autofill }));
  return post<{ ok: true; next: string }>("/api/auth/passkey/verify", { response, next });
}

export async function addPasskey() {
  const { options } = await post<{ options: Parameters<typeof startRegistration>[0]["optionsJSON"] }>("/api/passkeys/register-options");
  const response = await run(() => startRegistration({ optionsJSON: options }));
  return post<{ ok: true; passkey: { id: string; name: string } }>("/api/passkeys/register-verify", { response });
}

export async function unlockWithPasskey() {
  const { options } = await post<{ options: Parameters<typeof startAuthentication>[0]["optionsJSON"] }>("/api/passkeys/unlock-options");
  const response = await run(() => startAuthentication({ optionsJSON: options }));
  return post<{ ok: true }>("/api/passkeys/unlock-verify", { response });
}
