# The official LifeFlow logo: "Whoever's up" (Ali, 2026-11-10)

The logo is whichever skyling's time it is, peeking over the horizon, with the real sky of that moment behind it. Animated, it
moves through a whole day (12 s loop: Dawn, Ray, Noon, Goldie, Dusk, Star, 2 s each).

Everything is drawn by the app's own code, bundled from main (15de01c) by `entry.ts` into `lf2.js`:
- the skylings: `drawCompanion` (with Star's moonlit rim at night) and the app's night rule (night = before sunrise or after sunset);
- the sky: `skyAt` and `darkness` (`src/lib/sky.ts`), stars when it's dark;
- who's up when: `skylingAt` (`src/lib/companions.ts`, the same rule as "Changes with the sky");
- the blue horizon line (92% wide, 5.5% thick) and the night-blue ground at 64% from the app icon (`morning-mark.ts`).

Build: `esbuild entry.ts --bundle --format=iife --alias:@=./src --outfile=lf2.js` from an app checkout, then put `lf2.js`,
`fraunces-var.woff2` and `geist-latin.woff2` next to `logo.html` and run `node render_logo.cjs` (stills + 360 frames), then
ffmpeg: MP4 (libx264, crf 14, yuv420p, faststart) and GIF (540 px, 15 fps, palette). `sheet.html` makes the overview page.
Download (zip with the MP4, GIF, six stills, overview, notes): https://d2ol7oe51mr4n9.cloudfront.net/user_303ATRwxPrvQJdn5jZHtWxZlmBa/1e42df2b-4462-46a1-9499-f9c333f5863c.zip

The app still shows the morning sun; putting this logo into the app (icons, splash, header) is app work and waits for Ali.
