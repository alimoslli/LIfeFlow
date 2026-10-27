# ADR 0002 — Per-request rendering (Cache Components disabled)

**Status:** accepted

Next.js 16 scaffolds with `cacheComponents: true`. Nearly every BudgetFlow page shows one user's private, frequently changing data (balances, deadlines, chat). Caching it adds complexity (`use cache: private`, tags, Suspense boundaries around every session read) and risks showing stale financial or academic data.

**Decision:** set `cacheComponents: false`. Pages render on each request; mutations call `revalidatePath`. Revisit if performance needs it: candidates are static marketing pages and per-user cached aggregates keyed by user ID.
