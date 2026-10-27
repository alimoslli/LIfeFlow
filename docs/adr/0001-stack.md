# ADR 0001 — Technology stack

**Status:** accepted (2026-10-26)

**Decision:** Next.js 16 (App Router) + TypeScript + React 19, Tailwind CSS 4, PostgreSQL with Drizzle ORM, first-party email/password auth, OpenAI Responses API on the server, Vitest + Playwright.

**Why**
- One framework covers UI, server actions, and streaming API routes, and deploys easily (Vercel or any Node host).
- **Plain PostgreSQL rather than a Supabase-specific setup:** the app only needs a Postgres connection string, so it runs on Supabase, Neon, RDS or a local install with no lock-in. Supabase remains a good hosting choice.
- **Drizzle:** typed SQL, readable migrations, and first-class Postgres features we rely on (RLS policies, partial unique indexes, generated `tsvector`).
- **First-party auth instead of Supabase Auth / Auth.js:** works offline in development and tests, keeps the user table under our control, and is small: scrypt hashing with OWASP parameters, hashed opaque session tokens, and rate limiting. OAuth sign-in can be added later.
- **No component library dependency:** a small in-repo UI kit (`src/components/ui`) keeps the design original and the bundle small.
- **Explicitly not used:** Base44 or any proprietary app builder.

**Consequences:** password reset and email verification need an email provider (planned). Social login isn't available yet.
