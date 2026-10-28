# ADR 0007 — Motion with GSAP; splash, onboarding and tour

**Status:** accepted (2026-10-28)

**Context.** LifeFlow should feel like a polished paid app: an opening screen, a first-run setup so day one isn't empty, a short tour, and calm motion throughout. Before this, motion was a few CSS keyframes.

**Decision**
- **GSAP 3** (`gsap`, `@gsap/react`) for coordinated motion. It's free for commercial use under GreenSock's standard no-charge license, which restricts only tools competing with Webflow's visual builder. Everything is configured in `src/components/motion/gsap.ts`, with shared tokens `MOTION` (0.28s UI, 0.5s entrances, `power3.out` / `expo.out`). The cost is about 36 kB gzipped, loaded only by client components.
- **CSS for first-paint motion; GSAP for interactive motion.**
  - Entrances of server-rendered sections (`animate-rise`), bar growth (`lf-grow`), the splash draw-in, the skeleton shimmer, the thinking wave and checkmark pops are CSS. They start before JavaScript loads, so server-rendered content never flashes or hides again during hydration.
  - GSAP drives:
    - the splash exit;
    - money count-ups (`CountUp`);
    - the sliding tab indicator;
    - sheet and drawer open/close;
    - page cross-fades (`(app)/template.tsx`);
    - onboarding step transitions;
    - the tour spotlight.
- `motion/intro.ts` coordinates first paint. Effects skip the hydration pass (content is already on screen) and can wait for the splash to finish, so count-ups play once it lifts.
- **Splash:**
  - an inline script adds `html.lf-splash` before first paint;
  - it shows once per session and never with `prefers-reduced-motion`;
  - it's off under automation unless `?splash=1` is set;
  - a CSS failsafe hides it after 3.5s even if JavaScript never runs.
- **Onboarding** (`/welcome`, `services/onboarding.ts`):
  - It applies only to accounts created after launch: `preferences.onboarding = "pending"` is set at sign-up.
  - Answers are saved once at the end, in one transaction, through the normal services (courses, employer, a checking account, profile preferences, a user-confirmed memory), so a refused step saves nothing.
  - "Skip setup" finishes immediately.
- **Tour:** 4 steps over `data-tour` targets. It runs after onboarding (`preferences.tour = "pending"`), can be replayed from Settings, works with Esc, Skip and focus trapping, and adapts to the phone tab bar or the desktop rail.
- **Rules:** animate transform and opacity (SVG stroke for drawings); honour reduced motion everywhere (`prefersReducedMotion()` plus the global CSS safety rule); content never depends on an animation finishing.

**Testing.** e2e covers the full onboarding → tour → data saved flow, splash once per session, no splash with reduced motion, and no horizontal overflow on `/welcome` on phones. The `signUp()` helper skips setup and the tour.
