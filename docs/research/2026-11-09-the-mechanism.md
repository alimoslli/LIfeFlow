# The mechanism: making the Today wheel and its timeline feel effortless

Date: 2026-11-09. Asked by: the owner, through the product chat. Written by: a research agent (read-only on product code).
Code read: `origin/main` at d988772 ("Wheel: labels inside the rim read inward"). `v3-day-clock` has the same `src/components/day-clock/`.

## 1. Question

The owner calls the Today screen "the mechanism". It is a half-circle sky card that works like a wheel: one full turn is one day, a pixel companion walks on top, your things ride the rim, and the sky is the real sky for the time on top. A tap unrolls it into a horizontal timeline that should keep the same sunrise-to-sunset sky and an up-and-down line (hills by day, valleys by night).

His complaints:

1. Scrolling needs far too much mouse movement to see where things are. People will scroll it a lot, to play and to find their way.
2. The wheel-to-timeline animation is not smooth.
3. On a MacBook it looks tiny.

It must feel great with a mouse wheel, a trackpad and touch.

## 2. Short answer

- **Mouse wheels and trackpads are not handled at all.** There is no `wheel` listener anywhere in `src/`. On the wheel, a scroll scrolls the page. On the open line, a plain mouse wheel does nothing (only Shift+wheel or a trackpad moves it), and a mouse drag sideways does nothing while a small drag down closes the line. This is the main reason it "needs too much mouse movement": for a mouse user most movement does nothing.
- **The line has no steady time scale.** Stops are spaced by count, not by time (44 to 134 px per gap whatever the hours between them), so one swipe can move 15 minutes or 8 hours. You can't learn how far to move.
- **The morph is a crossfade between two different drawings, rebuilt from scratch every frame.** The dome deletes and recreates its whole SVG on every frame, reads layout every frame, and moves each rim point in a straight line toward a non-uniform line. The sky card fades out in the first third, so the sky the owner wants on the timeline is gone. For 45% of the motion two lines show at once.
- **On a laptop the wheel is capped at 138 px radius** in a card about 1,080 px wide, and the companion sprite is scaled by 2.25, which blurs pixel art.
- **Fix, in order:** one input layer (wheel, trackpad, drag, keys) on one time scale (12 hours across the card, so a ~300 px trackpad swipe moves about 3 hours on a laptop); real momentum with projection and snapping to now and events; a time-linear line whose sky and hills are painted once and scroll on the compositor; a morph that "uncurls" the same curve (arc length kept, curvature to zero) with no crossfade and a hand-off that is pixel-identical; and a laptop layout where the wheel is about 2x larger.

## 3. What the code does today (with file:line)

Paths are in `src/components/day-clock/` unless noted. Line numbers are from `origin/main` d988772.

### 3.1 Input on the wheel (closed state)

| What | Where | Behaviour today |
|---|---|---|
| Hit area | `engine.ts:413-416` | In dome mode the hit area is the full width, from y=48 to 62% of the height, `touch-action: pan-y` (`day-clock.css:249-255`). |
| Drag start | `engine.ts:1725-1737`, `1743-1747` | Pointer down presses the card. A drag counts once it moves more than 8 px sideways and more sideways than down. |
| Drag scale | `engine.ts:1658`, `dome.ts:45` | `minPerPx = 1440 / (2π · wheelR(W))`. `wheelR` is `clamp(W/2 - 56, 96, 138)`, so on any screen wider than 388 px R = 138: **1.66 min per px, about 36 px per hour, 867 px for a full day.** The rim moves exactly with the finger. |
| Drag velocity | `engine.ts:1752` | Smoothed 60/40 per pointer move, in min per ms. Not time-weighted, so a burst of fast events at 120 Hz skews it. |
| Fling | `engine.ts:1700-1720` | Velocity capped to ±2 min/ms, decays `0.93` per 16 ms (time-based, good), stops below 0.004. Coast is about `v · 16 / 0.07`: the hardest flick coasts about 7.6 hours. Release counts as a flick only if the last move was within 90 ms (`engine.ts:1790`). |
| Snap | `engine.ts:1713` | Only to now, and only if the fling ends within 12 minutes of it. No snapping to events. No edge resistance: it hard-stops at the first and last loaded day (`engine.ts:1659-1663`). |
| Mouse wheel / trackpad | none | **No `wheel` listener in `src/`** (checked with `git grep`). A vertical scroll over the wheel scrolls the page. A sideways two-finger swipe does nothing to the wheel and, with no `overscroll-behavior` on the card, can trigger the browser's swipe-back. |
| Keys | `engine.ts:1807-1814` | Left/Right turn one hour, Home goes back to now. No smoothing (jumps). |
| Back to now | `engine.ts:1678-1698` | Cubic in-out, 380 ms to 1.4 s, 0.3 ms per minute away. Good. |

### 3.2 Input on the open line

| What | Where | Behaviour today |
|---|---|---|
| Scroller | `day-clock.css:462-475` | Native `overflow-x: auto`, `touch-action: pan-x`, scrollbar hidden, `overscroll-behavior-x: contain`. Touch and trackpad sideways swipes get the OS's own momentum (good). |
| Mouse wheel | none | A vertical wheel is not turned into sideways scroll. **With a mouse, the line only moves with Shift+wheel**, the day picker or the arrows. The hidden scrollbar removes the last mouse affordance. |
| Mouse drag | `engine.ts:1826-1870` | Pointer handlers only look for a pull down (more than 10 px down, `1847`) or a pinch. A sideways mouse drag does nothing; a mouse drag that drifts 10 px down starts closing the line. |
| Time scale | `engine.ts:827-844` | Gaps between stops: 96 to 126 px between things, 44 to 134 px at midnights (the most beside "Tomorrow" next to now), 66 to 90 px beside now, 58 px at month marks, plus half a screen of padding at each end (`839`). Time between stops does not set the distance. **Example: two classes 15 minutes apart are 96 px apart; an empty 8-hour night is 126 px.** The px per hour changes by up to 30 times along the same line. |
| Snap | none | No snapping. `goDay` and card taps use `scrollTo({behavior: "smooth"})` (`engine.ts:1059`, `1127`), whose speed the browser picks. |
| Look | `day-clock.css:496-508` | A flat 2 px accent line. No sky, no hills or valleys. |

### 3.3 The morph (wheel to line and back)

| What | Where | Behaviour today |
|---|---|---|
| Driver | `engine.ts:1553-1583`, `1608`, `1653` | One progress value `p` (0 wheel, 1 line), played with `ePlay` (quadratic in-out) over **900 ms open, 860 ms close** in dome mode. rAF timestamps are used (good, frame-rate independent). |
| Per frame | `engine.ts:1372-1375` | In dome mode `render()` runs `renderReduced(P)` (the reduced-motion crossfade) and then `drawDome()`. |
| Dome draw | `dome.ts:98-347` | **Rebuilds the whole SVG every frame**: `svg.textContent = ""` (`dome.ts:144`), then new `defs`, gradient, clip path, every rim piece, every label. Each rim piece samples a point every 4 minutes (`dome.ts:134`), about 180 points per piece. It also redraws the companion canvas every frame (`dome.ts:346`). The same full rebuild runs on every pointer move and every fling frame (`setView` → `drawDome`, `engine.ts:1661-1665`). |
| Layout reads | `dome.ts:100-101`, `engine.ts:1370` | `root.clientWidth/clientHeight` are read inside every draw, right after `renderReduced` wrote styles (`engine.ts:1505-1530`), and `trackWrap.scrollLeft` is written in `render()`. That is a forced layout per frame (read after write). |
| Rim path | `dome.ts:123-129` | Each point on the half wheel is lerped in a straight line to `lineX(t)`. Points move along chords, so the arc sags and bunches instead of unrolling. Because `lineX` is the count-spaced line (3.2), the 12 hours on the rim land on a stretch of line that can be 2 hours or 2 days wide; points fly off screen. |
| Double easing | `dome.ts:110` | The rim uses its own cubic in-out on `seg(p, 0, 0.7)` on top of `ePlay`. Two in-out curves stacked give a slow start, a rush in the middle and a long tail: this reads as "not smooth". |
| Crossfade | `dome.ts:145`, `engine.ts:1519` | The dome fades out from p 0.66 to 1 while the real line fades in from 0.55 to 1. Between 0.55 and 1 both lines are on screen, in slightly different places. |
| Sky | `dome.ts:157` | The sky card fades out by p 0.35. The timeline has no sky, so the owner's "same sky gradient" is lost at the start of the motion. |
| Companion | `dome.ts:341-345`, `day-clock.css:839-849` | It slides to its line position and fades out from 0.55 to 0.9. The 16 px sprite is shown at 36 px (2.25x), so pixels come out uneven. |

### 3.4 Size on a laptop

- `day-clock.css:13-16`: at 768 px and wider, `.dc` is a fixed 620 px tall, whatever the window height.
- The Today section sits in `max-w-6xl` with `md:px-6` (`src/components/shell/app-shell.tsx:192`) beside an 88 px sidebar (`app-shell.tsx:151`). On a 1440 to 1470 px wide MacBook window the clock is about **1,104 px wide**.
- `dome.ts:45`: the wheel radius stops at 138 px. The half wheel is 276 px wide, **about 25% of the card's width**.
- `dome.ts:113-119`: the card runs from y=48 to about y=259. On a MacBook Air with the usual "looks like 1470 x 956" setting, the browser shows roughly 830 px of page height, so the hero is about **211 px, a quarter of the first screen**.
- Text in the dome is fixed px (`day-clock.css`: 10.5 px day labels, 17 px emoji, 17 px "now" line), so nothing scales with the card. 10.5 px labels are below a comfortable laptop reading size, and px sizes ignore the app's Text size setting (CLAUDE.md asks for rem).

## 4. What good looks like (research, with sources)

### 4.1 Wheel and trackpad input on the web

- **Three units.** `WheelEvent.deltaMode` is 0 (pixels), 1 (lines) or 2 (pages). Firefox can report lines for a mouse wheel. Facebook's `normalizeWheel` (used by fixed-data-table) converts lines with 40 px and pages with 800 px, and notes that the same physical notch gives very different numbers per browser: a small pixel delta in Chrome on macOS, a fraction of a line in Firefox, about 100 px in Chrome on Windows [S1]. Lesson: never use raw `deltaY` as distance.
- **Trackpads send many small pixel deltas, mice send few large steps** [S1]. A trackpad two-finger swipe also gives `deltaX`; Shift+wheel turns a mouse wheel into `deltaX` [S1].
- **macOS momentum is in the event stream.** After the fingers lift, macOS keeps sending wheel events with shrinking deltas about every 20 ms. Browsers don't expose the momentum phase in the standard event (WebKit bug 151093 asks for it), so libraries such as Lethargy and `wheel-gestures` detect it from shrinking deltas and time gaps [S2][S3]. Lesson: do not add your own momentum on top of trackpad input. Apply the deltas as they come (the OS already did the physics), and only add friction for pointer drags and for discrete mouse notches.
- **Pinch on a trackpad arrives as a `wheel` event with `ctrlKey: true`** in Chrome and Firefox; Safari sends `gesturestart/gesturechange/gestureend` instead. `preventDefault()` stops the page zoom [S4]. A ctrl-wheel with zero deltas can be macOS smart zoom [S4].
- **To cancel scrolling you must register the listener with `{passive: false}` on the element.** Since Chrome 73, wheel listeners on window, document and body are passive by default and `preventDefault()` there is ignored [S5].
- **Swipe-back.** `overscroll-behavior-x: contain` (or `none`) on a horizontally scrolling element should stop macOS two-finger history navigation in Chrome and Firefox; Safari did not honour it at the time of WebKit bug 240183, where a non-passive `wheel` handler that calls `preventDefault()` on sideways deltas is the fallback [S6].

### 4.2 Drag, inertia, rubber-banding, snapping

- **Exponential decay per millisecond.** UIScrollView's normal deceleration rate is 0.998 (velocity loses 0.2% per ms); the "fast" rate is 0.99 [S7][S8]. At 60 Hz, 0.998 per ms is 0.967 per frame; at 120 Hz it is 0.983. Today's wheel uses 0.93 per 16 ms (about 0.9955 per ms), which stops about twice as fast as iOS.
- **Projection.** Apple's "Designing Fluid Interfaces" (WWDC18 session 803) teaches projecting where a flick would come to rest, then choosing the snap target from that projected point, and animating there with a spring, instead of letting friction stop it wherever it stops [S9][S10]. Projected distance = `v · r / (1 - r)` with v in px per ms and r the per-ms rate; for r = 0.998 that is about `499 · v`.
- **Rubber band.** The classic iOS formula is `f(x) = (1 - 1 / (x · c / d + 1)) · d` with c = 0.55 and d the view size; it gives about 52 px of travel for a 100 px pull on a 960 px view [S11][S12]. Release springs back.
- **Detents.** Apple's Digital Crown gives linear haptic detents as you turn a set distance, and row detents as items scroll in; Apple says to update the interface at the speed people turn the crown and to drop detents that don't match your animation [S13]. Lesson for us: one gentle tick per hour passed and a slightly firmer one when an event or now passes the centre.

### 4.3 Scroll-linked animation at 60 and 120 fps

- Animate only `transform` and `opacity`; layout is the expensive step and its cost grows with DOM size [S14]. Read all geometry first, then write (no read-after-write in a frame) [S14].
- FLIP (First, Last, Invert, Play) turns a layout change into a transform animation that the compositor can play cheaply: measure the start and end rectangles, apply the inverse transform, then release it [S15].
- **Frame budget:** 16.7 ms at 60 Hz, 8.3 ms at 120 Hz. Safari on ProMotion Macs and iPhones caps page rendering near 60 fps by default (a feature flag), while Chrome on a ProMotion MacBook runs rAF at 120 Hz [S16]. So all motion must be time-based (rAF timestamp), which the engine already does, and the 120 Hz budget is the one to design for.
- Coalesce input: wheel and pointer events can arrive faster than frames. Add deltas into a pending value and apply once in the next rAF.

### 4.4 How the best time-scrubbing UIs feel effortless

- **Apple Watch, Digital Crown:** one control, linear detents, the view tracks the crown at its speed, and every turn has visual feedback [S13]. Our wheel already has the "rim moves with the finger" part. It lacks detents and lacks mouse and trackpad paths.
- **Weather apps' hourly strips:** one fixed time scale (each hour the same width), snap to the hour, now is always the first item and one tap returns to it. People learn "one swipe is about half a day" in seconds because the scale never changes.
- **Calendar week and day views:** the time axis is linear inside a day; empty time is shown, not hidden, so you can tell 9 AM from 5 PM by position alone. Long empty stretches are handled by zoom levels (day, week, month), not by squeezing gaps.
- **Video editors' timelines:** fixed scale, a playhead, and a zoom (Alt+wheel in Premiere, Ctrl+wheel or pinch in Vimeo's editor) that zooms toward the cursor, not the playhead. When Premiere 24.4 zoomed toward the centre instead, users filed it as a bug [S17].
- **Maps:** pan is 1:1 under the finger or cursor, flicks coast, pinch and ctrl-wheel zoom around the cursor, and the edge pushes back.

The common thread: **one steady scale, 1:1 tracking, momentum that the user caused, snapping only at rest, zoom for distance, and a single way home.**

### 4.5 Sizing a phone-first hero on a 1440 px laptop

- A 13-inch MacBook Air's usual setting "looks like" 1470 x 956 [S18]; with the browser's top bar the page is about 1,470 x 830. A 14-inch MacBook Pro defaults to 1512 x 982.
- Laptop users sit about 50 to 60 cm away, versus 30 to 35 cm for a phone. To look the same size to the eye, things need about 1.6x their phone size. Today's wheel is the same 138 px radius on both.
- Practical rule for this card: the hero should take **about 45 to 55% of the first screen's height** and the wheel **about 40 to 45% of the card's width** on a laptop, with text scaled with it, and should never need scrolling to see the whole wheel.

## 5. What to change, prioritised

Numbers are starting values to tune with the owner on real devices. Items marked "fix" are bugs under the owner's 2026-11-05 rule (mouse wheel and trackpad doing nothing). Everything that changes how it works or looks needs the owner's yes on a picture or a build first.

### P0. One input layer, one time scale (fix, then tune)

1. **Add one non-passive `wheel` listener** on the card (`{passive: false}`, on the `.dc` element, not on window) [S5]. Normalise with `deltaMode`: lines x 40 px, pages x 800 px [S1]. Coalesce into one rAF.
2. **Pick one time scale for everything: 12 hours across the card width**, the same 12 hours the half wheel shows (`dome.ts:37-38`). So `pxPerHour = cardWidth / 12`:
   - phone 390 px: 32 px per hour; laptop 1,104 px: 92 px per hour.
   - **One trackpad swipe of about 300 px moves about 3 hours on a laptop** (about 9 hours on a phone, where a trackpad is rare). This replaces today's 36 px per hour on the wheel (an 867 px drag for a day) and the count-spaced line.
   - On the wheel, touch and pointer drags keep moving the rim 1:1 under the finger (the arc length per hour grows with the bigger laptop wheel from P2).
3. **Map deltas:** `deltaX` and `deltaY` both move time (right or down is later). Use the axis with the larger total in the current gesture and ignore the other, so diagonal trackpad drift doesn't add up.
4. **Mouse notches** (deltaMode 1, or deltaMode 0 with no `deltaX` in the gesture and steps of 40 px or more spaced more than 50 ms apart) become **one notch = 30 minutes**, each eased over 140 ms (`cubic-bezier(.2,.8,.2,1)`), adding up if the user spins faster. This is what makes a mouse feel deliberate instead of jumpy.
5. **Trackpad pixel deltas are applied 1:1** (with the scale above). No extra momentum: macOS already sends its momentum tail [S2][S3]. When the tail is under 2 px per event and within 20 minutes of a snap target, hand over to the snap spring (P1.3).
6. **Page scroll is not trapped.** Vertical deltas turn the day only when the gesture started over the card. A wheel gesture that started as a page scroll keeps scrolling the page until 300 ms without wheel events (the same "latching" browsers use). Sideways deltas over the card always turn the day.
7. **Stop swipe-back:** `overscroll-behavior-x: contain` on the card and the line, plus `preventDefault()` on sideways wheel deltas over the card for Safari [S6].
8. **On the open line, mouse users get drag-to-pan.** A mouse (`pointerType === "mouse"`) drag sideways pans the line 1:1 with momentum (P1.1); `cursor: grab` and `grabbing`. Keep the pull-down-to-wrap for touch only, or require 40 px down and more than 2x the sideways move for a mouse, so a sloppy drag never closes the line.
9. **Keys:** Left/Right 1 hour (eased 160 ms), Shift+Left/Right 15 minutes, Page Up/Down 6 hours, Home now. The same keys on the open line.
10. **Pinch and ctrl-wheel zoom** (P2 if time is short): on the open line, `ctrlKey` wheel and Safari gesture events change the span between 6 hours and 3 days across the card, **anchored at the cursor** [S4][S17]. Double-tap or `0` resets to 12 hours.

### P1. Momentum, snapping, edges that feel physical

1. **Fling decay 0.998 per ms** (iOS normal [S7]); stop below 0.02 px per ms. Velocity from a time-weighted fit of the last 80 ms of pointer samples (not the last event), so 120 Hz bursts don't skew it. Cap the projected coast at 24 hours (one turn), not 7.6 hours.
2. **Project, then snap** [S9]. On release, compute `rest = position + 499 · v`. Then:
   - if now is within **45 minutes** of `rest`, land on now;
   - else if an event start is within **20 minutes** (or 24 px, whichever is larger), land on it;
   - else land on the nearest quarter hour.
   Animate there with a critically damped spring (about 380 ms, no overshoot) that starts at the release velocity, so there is no visible "brake then move".
3. **Snapping at rest only.** Never snap while a finger is down or while trackpad deltas are still arriving. After 140 ms without wheel events, settle onto an event start if it is within 10 minutes, in 180 ms.
4. **Rubber band at the first and last loaded day** with c = 0.55 and d = card width [S11]; spring back in 300 ms on release. Today it hard-stops (`engine.ts:1662`).
5. **Detents** [S13]: a visual tick on the rim and one light haptic per hour that passes the top while dragging slowly (under 0.5 px per ms); a firmer one when now or an event passes the top. No haptics during a fast fling (they'd buzz).
6. **"Back to now" stays** (`engine.ts:1678`) but uses the same spring, and shows after the view is more than 30 minutes from now.

### P2. Big enough on a laptop

1. **Wheel radius from the card, not a 138 px cap:** `R = clamp(min(cardWidth · 0.22, cardHeight · 0.45), 96, 280)`. On a 1,104 x 620 clock that is about 243 px (a 486 px wide wheel, 44% of the card).
2. **Card height about 50% of the first screen:** `.dc` at 768 px and wider becomes `height: clamp(560px, calc(100svh - 160px), 860px)` and the sky card about 60% of it (about 400 px on a 1470 x 830 window, up from 211 px).
3. **Scale the dome's text with R** (`fontScale = clamp(R / 138, 1, 1.5)`) and write it in rem so the Text size setting still applies (CLAUDE.md "Text size"). Minimum 13 px for rim labels on a laptop.
4. **Companion at an integer multiple of its 16 px sprite:** 32 px on phones, 48 or 64 px on laptops. Today's 36 px (2.25x) gives uneven pixels with `image-rendering: pixelated`.
5. **Laptop affordances:** `cursor: grab` over the card, a one-time hint "Scroll or drag to move through your day" (gone after the first turn, remembered per viewer), and hover arrows at the card's left and right edges that move 3 hours.

### P3. A line that is the same object as the wheel

1. **Time-linear line** at the P0 scale (12 hours across by default). Things closer than 44 px join the existing stacks (`nodeFor`, `engine.ts:789`); labels that collide step to a second row. **Nights are compressed to 40%** of the day scale from 11 PM to the hour before the first thing next morning, which is also where the valleys sit, so nights stay short without breaking the scale by day. Beyond the loaded week, keep today's month and year marks.
2. **Sky on the line:** one CSS `linear-gradient` on the track with a stop every 30 minutes from `skyAt` (`src/lib/sky.ts:36`), so each x has the sky of its time (dawn gold at sunrise, blue by day, gold before sunset, deep blue at night). Built once per data change. It scrolls with the content on the compositor with zero JS per frame.
3. **Hills and valleys:** one static SVG path inside the track: `y = lineY - A · sin(π · (t - rise) / (set - rise))` by day (A = 22 px on a phone, 36 px on a laptop) and a shallower valley at night (A · 0.5). Things sit on the curve at their time. Built once per data change, never per frame.
4. **Keep the native scroller for the line.** Touch and trackpad momentum are then the OS's own, at the display's rate. JS only listens for the day picker (already rAF-throttled, `engine.ts:1913-1932`) and the P0 mouse wheel and drag.

### P4. The morph

See section 6 for the method. Targets: **open in 480 ms, close in 420 ms**, `cubic-bezier(.2,.8,.2,1)` (fast start, soft landing; no stacked in-out curves); drag-to-open and pull-to-wrap still scrub the same `p`; zero DOM nodes created or removed per frame; zero layout reads per frame; no frame over 8 ms of script at 120 Hz.

## 6. Recommended morph approach

**Principle: one curve, two shapes, no crossfade.** The rim and the line are the same parametric curve of time `C(t, e)`, and `e` goes from 0 (wheel) to 1 (line). At e = 1 the curve must equal the static line from P3 to within 0.5 px, so the hand-off is a swap with nothing to fade.

1. **Shared time window.** The wheel shows `view ± 6 h`. With the P0 scale the line also shows `view ± 6 h` across the card. The 12 hours on the rim map onto the same 12 hours on the line, so no point flies off screen.
2. **Uncurl, don't lerp.** Keep the top point (the time `view`) fixed on screen and keep the curve's length per hour, then lower the curvature from `1/R` to 0:
   - radius `r(e) = R / max(1 - e, 0.0001)`, centre moving down by `r(e) - R` so the top stays put;
   - arc length per minute goes from the rim's `2πR/1440` to the line's `pxPerMin` (lerp in e);
   - a point at `t` sits at angle `θ = arcLen(t - view) / r(e)` on that circle;
   - add the hills `e · hill(t)` and the vertical ellipse factor `hF` (`dome.ts:115`) eased to 1.
   This looks like a strip of paper unrolling from the top. Points never travel along chords, spacing stays even, and there is no sag.
3. **Sky without a cut.** Two layers, both built before the motion starts: the card's vertical sky at `view` (today's) and the line's horizontal time sky (P3.2). Grow the card's clip from the half-dome rectangle to the line's band with a FLIP transform (`scale` and `translate` on a wrapper) [S15], and fade the vertical sky into the horizontal one between e 0.2 and 0.8. Both are flat paint layers, so this is opacity only.
4. **Things ride the curve.** Each icon, dot and block is an element positioned by `transform: translate3d(x, y, 0)` from `C(t, e)`. Elements are created once in `prepMorph` and only their transforms change. The rim path's `d` is the only attribute rewritten per frame (one path, a point every 10 minutes: 72 points).
5. **The companion walks** from the top of the wheel to its place on the line's hill at `view`, with an integer scale and two or three steps of its walk cycle, instead of fading out.
6. **Labels.** Rim labels fade out by e 0.3; the line's labels fade in from e 0.75 on their final positions (opacity only).
7. **Turning without rebuilding.** For the closed wheel, draw the rim for the whole loaded range once in wheel coordinates inside a `<g>`, and turn it with `transform: rotate()` as `view` changes; counter-rotate labels. Only the sky stops' colours (three `stop-color` writes) and the companion change per frame. Cache `W` and `H` from the ResizeObserver (`engine.ts:1985`) instead of reading `clientWidth` in `draw` (`dome.ts:100`).
8. **Reduced motion:** a 200 ms crossfade, as today.

The View Transitions API is not the right tool here: it snapshots and crossfades rectangles, while this is a curve changing shape. FLIP fits the card's frame; the curve needs the parametric approach.

## 7. Test plan

### 7.1 Unit (Vitest, pure functions to extract from engine.ts)

- `normalizeWheel`: deltaMode 1 with 3 lines gives 120 px; deltaMode 2 gives 800 px per page; a Chrome-on-Windows notch (100 px) is classed as a notch and gives 30 minutes; a trackpad stream totalling 300 px gives 3 hours ±5% at a 1,104 px card; `ctrlKey` deltas zoom, never pan; Shift+wheel pans.
- `project(v)` with r = 0.998: `499 · v` within 1%.
- `snapTarget(rest, now, events)`: now within 45 minutes wins; an event within 20 minutes next; else the nearest quarter hour.
- `rubber(x, d)`: 100 px on 960 gives about 52 px.
- Morph curve `C(t, e)`: at e = 0 it equals the wheel point (0.5 px); at e = 1 it equals the static line point (0.5 px); the top point never moves; spacing between neighbouring minutes is monotonic in e (no bunching).
- Sky stops: the line gradient's colour at x for time t equals `skyAt(t)`.

### 7.2 e2e (Playwright, `tests/e2e/clock-phone.spec.ts` plus a laptop spec at 1470 x 830)

Expose `data-view` (minutes) and `data-px-per-hour` on the clock root for tests, as `data-state` is today.

- `page.mouse.wheel(0, 300)` over the card moves `data-view` forward by about 3 hours (laptop) and `window.scrollY` stays the same.
- `page.mouse.wheel(300, 0)` moves it the same and does not navigate back (URL unchanged).
- A wheel that starts below the card scrolls the page, then continues scrolling the page when the pointer passes over the card within 300 ms.
- Open line: `page.mouse.wheel(0, 300)` changes `scrollLeft` by about 300 px; a mouse drag of 200 px sideways pans by 200 px and does not close the line; a drag 200 px down (touch) still wraps it.
- Fling: a fast drag release lands exactly on an event start when the projection is within 20 minutes of it; lands on now within 45 minutes.
- Rubber band: dragging past the last day moves less than the pointer and springs back.
- Keys: Right then Home returns `data-view` to now.
- Smoothness: during open, a page-side rAF loop records frame gaps; assert p95 under 20 ms and no long task over 50 ms (PerformanceObserver). A MutationObserver on the dome sees zero child-list mutations per frame while turning and while morphing.
- Hand-off: screenshot at p = 1 just before and just after the swap to the static line (a `?p=` test hook) differs by less than 0.5% of pixels.
- Size: at 1470 x 830 the wheel's bounding box is at least 440 px wide and the card at least 380 px tall; at 390 x 844 nothing changes from today's approved phone pictures.
- `mobile.spec.ts` at Extra large text: dome labels scale and don't overlap.

### 7.3 Manual (owner and auditor, before asking for the yes)

Devices: MacBook trackpad in Safari, Chrome and Firefox; Magic Mouse; a notched mouse on macOS and on Windows Chrome; iPhone Safari; an Android phone.

Tasks, each should take one or two gestures without looking at the controls:

1. "Look 3 hours ahead" in one swipe or a few notches.
2. "Find tomorrow at 9 AM" in at most two gestures.
3. Fling far, then get back with one tap.
4. Spin it for fun for 10 seconds: no stutter, the companion keeps walking, nothing flickers.
5. Open and close the line five times quickly, and interrupt it halfway: it reverses from where it is, never jumps.
6. Two-finger swipe sideways hard on the card: the browser never goes back.
7. Reduced motion on: crossfades only, everything still reachable.

## 8. Things to avoid (rules for whoever builds this)

1. Never use raw `deltaY` as a distance; always normalise `deltaMode` first.
2. Never add JS momentum on top of trackpad wheel events.
3. Never rebuild SVG or DOM per frame; build once, then change transforms, opacity and at most one path's `d`.
4. Never read layout (`clientWidth`, `getBoundingClientRect`, `scrollLeft` reads) after a style write in the same frame.
5. Never snap while the user is still moving it.
6. Never let the scale change along the line by day; compress only nights and only in the valleys.
7. Never crossfade two versions of the same line; hand off only when they match.
8. Never trap page scroll that started outside the card.
9. Never scale pixel art by a non-integer.
10. Never attach a wheel listener to window or document (it is passive and can't cancel) [S5].

## 9. Yes or no for the owner

1. One time scale everywhere: 12 hours across the card (about 3 hours per trackpad swipe on a laptop). Yes or no.
2. Mouse wheel and trackpad turn the wheel and scroll the line; one mouse notch = 30 minutes. Yes or no. (The "does nothing" part is a bug fix.)
3. A flick lands on now or on the nearest thing when it ends close to one. Yes or no.
4. The open line becomes time-true, with the sky colours of each hour behind it and hills by day, valleys by night (short nights). Yes or no, on a picture.
5. The wheel unrolls like a strip of paper in about half a second, the sky stays, the companion walks onto the line. Yes or no, on a picture.
6. On a laptop the wheel is about twice as big and the card about half the screen. Yes or no, on a picture.
7. Pinch or ctrl-scroll to zoom the line from 6 hours to 3 days. Yes, later, or no.

## 10. Sources

- [S1] Facebook `normalizeWheel.js` (fixed-data-table), constants and per-browser notes: https://github.com/facebookarchive/fixed-data-table/blob/master/src/vendor_upstream/dom/normalizeWheel.js (read 2026-11-09). MDN's `WheelEvent.deltaMode` page (https://developer.mozilla.org/en-US/docs/Web/API/WheelEvent/deltaMode) is the standard reference; its host was blocked in this session's network, so it was not re-read.
- [S2] Lethargy (inertial scroll detection): https://github.com/d4nyll/lethargy ; README: https://cdn.jsdelivr.net/npm/lethargy@1.0.9/README.md
- [S3] wheel-gestures (momentum detection, macOS browsers): https://npmjs.org/package/wheel-gestures ; WebKit bug 151093 (momentum phase not exposed): https://bugs.webkit.org/show_bug.cgi?id=151093
- [S4] Pinch as ctrl-wheel and Safari gesture events: https://dev.to/danburzo/pinch-me-i-m-zooming-gestures-in-the-dom-a0e ; Chromium PSA: https://groups.google.com/a/chromium.org/g/chromium-dev/c/L_kaBhYFi5U/m/RIMFBx12dJoJ
- [S5] Chrome, "Making wheel scrolling fast by default" (passive root listeners, Chrome 73): https://developer.chrome.com/blog/scrolling-intervention-2/
- [S6] Preventing history navigation on horizontal scrollers: https://dev.to/danburzo/css-micro-tip-prevent-history-navigation-on-horizontally-scrolling-elements-3iil ; WebKit bug 240183: https://bugs.webkit.org/show_bug.cgi?id=240183
- [S7] Ilya Lobanov, "Deceleration mechanics of UIScrollView": https://medium.com/@esskeetit/scrolling-mechanics-of-uiscrollview-142adee1142c
- [S8] Ilya Lobanov, "How UIScrollView works": https://medium.com/@esskeetit/how-uiscrollview-works-e418adc47060
- [S9] Christian Schnorr, "Gestures in Fluid Interfaces: On Intent and Projection": https://medium.com/ios-os-x-development/gestures-in-fluid-interfaces-on-intent-and-projection-36d158db7395
- [S10] Apple, WWDC18 session 803 "Designing Fluid Interfaces": https://developer.apple.com/videos/play/wwdc2018/803/ ; notes: https://wwdcnotes.com/documentation/wwdc18-803-designing-fluid-interfaces/ ; Nathan Gitter's write-up and code: https://medium.com/@nathangitter/building-fluid-interfaces-ios-swift-9732bb934bf5
- [S11] Rubber band formula (Grant Paul), gist: https://gist.github.com/originell/6961057 ; Holko, "UIScrollView's inertia, bouncing and rubber-banding": https://www.holko.pl/2014/07/06/inertia-bouncing-rubber-banding-uikit-dynamics/
- [S12] Ole Begemann, "Inertia, bouncing, and rubber-banding": https://oleb.net/blog/2014/05/scrollview-inertia-bouncing-rubberbanding/
- [S13] Apple Human Interface Guidelines, Digital Crown: https://developer.apple.com/design/human-interface-guidelines/digital-crown
- [S14] web.dev, "Avoid large, complex layouts and layout thrashing": https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing
- [S15] Paul Lewis, "FLIP your animations": https://aerotwist.com/blog/flip-your-animations/
- [S16] 120 Hz in Safari is behind a flag: https://www.macrumors.com/how-to/enable-smoother-120hz-browsing-in-safari/ ; WebKit bug 173434 (120 Hz rAF): https://lists.webkit.org/pipermail/webkit-unassigned/2024-May/1166041.html
- [S17] Timeline zoom toward the cursor: Premiere Pro 24.4.1 bug report: https://community.adobe.com/t5/premiere-pro-bugs/24-4-1-alt-scroll-zoom-function-in-timeline-not-zooming-to-mouse-cursor/idc-p/14638842 ; Vimeo editor shortcuts: https://help.vimeo.com/hc/en-us/articles/31822428466577-How-do-I-use-keyboard-shortcuts-in-the-video-editor
- [S18] MacBook Air scaled resolutions (1470 x 956 option and default reports): https://www.itmedia.co.jp/news/article/2403/08/1240308110/2 ; https://forums.macrumors.com/threads/does-display-resolution-matter.2393064

## 11. Gaps

- No device testing was done in this session; the numbers in section 5 are starting points from the code's geometry and published constants, to be tuned on real hardware.
- The "notch vs trackpad" heuristic is known to misread some devices (Magic Mouse sends trackpad-like pixels, some Logitech mice send small pixel steps) [S2][S3]. Test on the device list in 7.3.
- Weather and Calendar observations in 4.4 are from common app behaviour, not from a published spec.
- Safari's handling of `overscroll-behavior-x` for swipe-back may have changed since WebKit bug 240183; check it on current Safari.

## What changed because of this report

(For the product chat to fill in, with commit links.)
