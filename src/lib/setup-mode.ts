/**
 * Which setup a new account sees (owner, 2026-11-12: "why is the setup not how the app is?"). The owner is comparing the two:
 * "app" is setup on the real Today (the skyling guides it), "old" is the separate /welcome screens. `SETUP_IN_APP=1` makes the
 * app one the default; the cookie (set by /setup) picks either one for the person looking. Nothing else reads it.
 */
export const SETUP_COOKIE = "lf_setup";
export const inAppSetup = (cookie: string | undefined, env: string | undefined = process.env.SETUP_IN_APP) =>
  cookie === "app" ? true : cookie === "old" ? false : env === "1";
