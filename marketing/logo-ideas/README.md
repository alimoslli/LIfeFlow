# Logo ideas (2026-11-10)

Two rounds, drawn from the app's own code and colours (no credits):

- `brand.html`: the morning sun the app uses now (`src/components/brand/morning-mark.ts`), finished five ways: As it is, Flat,
  Pixel, Morning rays, Blush. Each in every form: the mark on light and night, app icon (built like `morningIconSvg`), profile
  picture, small sizes, the lockup (built like `BrandLockup`), stacked, one colour.
- `brand_notsun.html` (+ `options_notsun.js`): five marks that aren't the sun, all on the same blue horizon: Your skyling,
  Little cloud, Sleepy moon, The day's path, Whoever's up. Skylings come from the app's sprite code (`lf.js`, built by
  `../teaser/moved-in/entry.ts`).

Render: copy `lf.js`, `fraunces-var.woff2` (the app's Fraunces from `next/font`) and `geist-latin.woff2` next to the HTML, then
`node render_brand.cjs <dir> 2 <out>` / `node render_notsun.cjs <dir> 2 <out>`. Waiting for Ali's pick; nothing in the app changes
until he says so.
