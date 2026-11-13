# The LifeFlow look

## Colors
| Use | Hex |
|---|---|
| Night navy (main dark, text on light) | `#142451` |
| Deep night (dark backgrounds, gradients) | `#0F1C40` |
| Moonlit blue (the app's dark mode) | `#152643` |
| Card on dark | `#1E3150` |
| Evening blue | `#233C6E` |
| Sky blue (labels on light) | `#3A5A8F` |
| Day sky | `#487FC0` |
| Horizon line blue | `#2F7CD2` |
| Gold (sun, highlights, the word "sky") | `#FFD27A` |
| Dawn peach | `#E39568` |
| Soft white (text on dark, light backgrounds) | `#F3F5FA` |
| Body text on dark | `#C9D5EE` |
| Caption box | `#0B1A3A` at 94% |

The app's real skies by time of day (top, middle, horizon):
- Dawn: `#1A3561`, `#506E9C`, `#E39568`
- Golden hour: `#487FC0`, `#A3BED9`, `#FCD599`
- Night: `#142451`, `#233C6E`, `#3A5A8F`

## Type
- **Fraunces** (SemiBold 600 or Bold 700): headlines, captions, the LifeFlow wordmark.
- **Geist** (Regular to SemiBold): small text, labels, anything that looks like app UI.
- Both are free Google Fonts (`assets/fonts/`). Sentence case. No all-caps headlines, except small spaced-out labels.

## The logo and brand art
- App icon: `assets/logo/lifeflow-app-icon.png` (and a transparent version). Keep it square with rounded corners and never recolor it.
- Animated logo "Whoever's up": the skyling whose time it is peeks over the horizon, under that moment's real sky (`LifeFlow_Logo_Loop_WhoeversUp.mp4`).
- Intro (3 s) and ending (3.5 s) logo videos, with their own sound.
- Wordmark: "LifeFlow" typed in Fraunces Bold next to the icon.

## Skylings (`assets/skylings/`)
Transparent PNGs drawn by the app's own code, at 20 screen pixels per art pixel. Scale them only by whole
multiples, with no smoothing ("nearest neighbor"), so the pixels stay crisp. Use the night versions of Twinkle and
Dreamy on dark or night backgrounds. The pixel style is the brand: never smooth, redraw or AI-generate them.

## Pixel clouds (`assets/clouds/`)
The app's own idea clouds (three shapes, day and night). Put short text inside them (a few words, Geist or Fraunces in
navy), like the clouds on the app's Today screen. Stretch only the flat middle part, never the puffs.

## Layout habits
- Smooth and soft around the pixel art: rounded corners, soft glows, frosted glass panels, gradients.
- Text on a frosted or navy rounded panel, never hard boxes with sharp corners.
- One message per frame. Let the app screen breathe.
