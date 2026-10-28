import { cookies } from "next/headers";

/** Short-lived httpOnly cookies that carry a passkey challenge token between the two requests of a ceremony. */
export const PASSKEY_COOKIES = { "passkey-register": "lf_pk_reg", "passkey-login": "lf_pk_login", "passkey-unlock": "lf_pk_unlock" } as const;

export async function setChallengeCookie(purpose: keyof typeof PASSKEY_COOKIES, token: string, expiresAt: Date) {
  (await cookies()).set(PASSKEY_COOKIES[purpose], token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api",
    expires: expiresAt,
  });
}

export async function takeChallengeCookie(purpose: keyof typeof PASSKEY_COOKIES) {
  const jar = await cookies();
  const token = jar.get(PASSKEY_COOKIES[purpose])?.value;
  jar.set(PASSKEY_COOKIES[purpose], "", { path: "/api", maxAge: 0 });
  return token;
}
