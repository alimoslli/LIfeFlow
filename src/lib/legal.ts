/**
 * Details the Privacy Policy and Terms of Use publish about who runs LifeFlow.
 * Set them in the hosting environment (Vercel → Settings → Environment
 * Variables). Until they're set, the pages use neutral wording rather than
 * made-up details.
 */
export const LEGAL_EFFECTIVE_DATE = "October 28, 2026";

export function legalDetails(env: Record<string, string | undefined> = process.env) {
  const name = env.LEGAL_OPERATOR_NAME?.trim();
  const email = env.LEGAL_CONTACT_EMAIL?.trim();
  const state = env.LEGAL_STATE?.trim();
  return {
    /** "LifeFlow is operated by Jane Doe" or "LifeFlow is operated by an individual developer". */
    operator: name ? name : "an individual developer based in the United States",
    email: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
    /** Governing law. */
    jurisdiction: state ? `the State of ${state.replace(/^state of /i, "")}, United States` : "the U.S. state in which the operator resides",
    configured: !!(name && email && state),
  };
}
