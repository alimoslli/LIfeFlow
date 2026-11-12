/**
 * Which setup a new account sees (owner, 2026-11-12: "why is the setup not how the app is?"; yes to setup inside the app).
 * Setup on the real Today is the default. `/setup?old=1` still shows the separate /welcome screens for the owner's comparison,
 * under the same rules (a real birthday and one real thing on the sky). Nothing else reads the cookie.
 */
export const SETUP_COOKIE = "lf_setup";
export const inAppSetup = (cookie: string | undefined) => cookie !== "old";
