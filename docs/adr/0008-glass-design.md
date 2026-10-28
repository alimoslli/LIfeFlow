# ADR 0008 — Glass design (phone and desktop)

**Status:** accepted (2026-10-28)

**Context.** The owner wanted a glossy, frosted "glass dashboard" with 3D depth (from a reference design), in LifeFlow's own colors, on the phone app first and on desktop.

**Decision**
- **Scoped tokens, not new components.** `.lf-glass` (on the app shell) redefines `--surface*`, `--border` and `--shadow*` as translucent glass. Every existing `bg-surface` card becomes frosted (backdrop blur + saturate, a gloss gradient, a bright top edge and soft depth shadows) without per-page changes. Auth and `/welcome` keep the solid theme.
- **Scene.** `.lf-scene` is a fixed layer behind the shell, made of soft radial gradients in the brand palette: deep green, mint, warm sand and cream, with a darker version. No images. The shell uses `isolation: isolate` so the layer sits above the page background, which also works on iOS, where `background-attachment: fixed` doesn't.
- **Hero cards** (`bg-hero`) become glossy green glass. `.lf-sheen` adds a slow light sweep on the two key ones.
- **3D:** `motion/tilt.tsx` is one delegated listener. Cards marked `data-tilt` lean toward the mouse, or press toward a finger on touch, and spring back. Disabled with reduced motion. Don't put `data-tilt` on an element that also has `animate-rise`: the CSS animation's fill would override the tilt transform. Put it on an inner element.
- **Phone:** a floating, frosted tab bar (`.lf-bar`, more opaque for legibility) and a translucent blurred section-tab band.
- **Desktop (≥768px):** a floating glass top bar (greeting, "Ask Jarvis" search with ⌘J, sample-data badge), a glass icon rail, and the page inside one large frosted panel. At ≥1024px, Today and Money become two-column dashboards. Phone order is preserved with `contents` wrappers plus `max-lg:order-*`.

**Consequences.** Backdrop blur costs GPU time, but it applies only to visible cards and bars. Text contrast was checked visually in both themes; muted text stays on light glass or on the light part of the scene.
