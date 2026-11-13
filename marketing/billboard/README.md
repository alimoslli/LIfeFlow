# LifeFlow billboard (mockup, 2026-11-13)

Ali sent two night photos of a highway billboard in San Francisco and asked to "turn this billboard as if it was a
billboard for our app". Nothing AI-made: the art is drawn by the app's own code (`lf2.js` from `marketing/logo/entry.ts`:
`skyAt`, `darkness`, `skylingAt`, `drawCompanion`), and then warped onto the billboard in his photo.

- `billboard.html`: the 2400 x 700 art. The sky of the moment, whoever's up over the horizon (Dreamy floats like the
  moon at night, the app's own rule), "Stop drowning in deadlines, shifts and bills." and "Let's clear your sky." with the
  icon and wordmark. `drawT(t)` is the digital version: the sky flows through the day and each of the five pops up.
- `render.cjs <minute> <out.png>` draws one moment; `render_seq.cjs <dir> <seconds>` draws the digital loop at 30 fps.
- `composite.py <photo> <art> <out> wide|close`: perspective warp, the photo's softness, glow and grain, the lamp post
  redrawn in front and dark rooftop gear kept in front. `composite_seq.py` does the video on the close-up with a slow
  push-in. The photos are Ali's own and are not committed.
- Needs `lf2.js`, the two woff2 fonts and `icon.png` beside the page (see `marketing/logo/v2`).
- No credits used. Not posted; it's a mockup for Ali.

## v3 (2026-11-13): printed, not pasted
Ali: "that looks so fake". The sign glowed like a perfect screen. Now the art is the vinyl's colour and is lit by the
real light measured on the old billboard: `composite2.py` fits a smooth floodlight field (a cubic over the billboard) to
the pixels that were plain white vinyl, multiplies in linear light, adds grain of the photo's own strength, and finishes
with the phone's light sharpening and JPEG. The design is the bright daytime one with Ray (a light printed board reads as
real at night, like the original). `composite2_seq.py` does the digital loop the same way.
