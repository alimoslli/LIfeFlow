/**
 * Browser noise that says nothing is wrong, so it never becomes an error report or an email to the owner: the
 * ResizeObserver loop notice (the spec's own "skip and try next frame") and cross-origin "Script error." from
 * extensions. Checked in the browser (ErrorReporter) and again by /api/errors, for app copies that predate the check;
 * a report there reads "<name>: <message>".
 */
export const isNoise = (message: string | undefined) => {
  const m = (message ?? "").replace(/^[A-Za-z]*Error: /, "").trim();
  return !m || m === "Script error." || /^ResizeObserver loop (completed with undelivered notifications|limit exceeded)/.test(m);
};
