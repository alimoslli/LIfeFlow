# Waitlist step 7: the read-only preview (picture for the owner's yes)

This is the picture only. No screen is built, and nothing ships until the owner says yes. Backlog: `docs/backlog/2026-11-11-audit-and-waitlist.md`, step 7.

## The pictures

Phone, 390 x 844, shown at 2x.

- `entry.png`: the waitlist page with "See a sample day" under the line. The invite card stays at the bottom.
- `day.png`: one sample student day, "Sample Tuesday". It has a class, a shift that overlaps a study block (the clash), an assignment due at 11:59 PM, and a bill due the day after sample pay landed. One next step.
- `scrub.png`: the same day scrubbed to 6:30 PM, with one item opened in a sheet marked as sample data.
- `examples.png`: one scripted skyling line, marked "Example", with a way back to the person's place.

Invented on purpose: "#12", "240 people", the skyling "Ray", and every class, shift, deadline and bill. The real page shows real counts.

## Three questions for the owner

1. **Entry:** is the card "See a sample day", with "You'll come straight back to your place", the right wording and place? Recommended: yes.
2. **Scripted line:** show one labelled example, or none? Recommended: one, labelled, because it shows what a skyling says.
3. **Sample day:** is one day enough for a short preview? Recommended: one ("Sample Tuesday").

## Known differences from the product

- The fonts are stand-ins (Georgia and a system sans), not the product's fonts.
- The wheel is simplified: a 6 AM to midnight arc, redrawn rather than the real engine.
- The study block is an extra timeline item, added to show the clash.
- The pull-down timeline is not shown.

## Source

`preview.html` is written from `build.js`. `shoot.js` renders the four pictures with Playwright (`node shoot.js`, 390 x 844 at 2x). `glyphs.json` holds the pixel art.
