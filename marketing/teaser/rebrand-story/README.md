# "LifeFlow is rebranding": story teaser + posters (2026-11-09)

A 23-second animated story of the new idea, no app screens: the old three-drop logo breaks into stars, "Your days are in
pieces", the pieces fly up into one sky, the six skylings pop onto the hills, the new morning sun rises with its face
("LifeFlow. Your whole life, on one sky."), Ali in a little window ("Before December, something big is coming."), and
"Before December. Follow to see it first." Posters in Story and feed sizes. No credits; Ali adds music.

- `story.html`: the composition (`seek(t)`; `seek(-1)` / `seek(-2)` draw the Story / post posters).
- `entry.ts`: bundles the app's own skyling pixel art (`src/components/day-clock/companion.ts`, `src/lib/companions.ts` from
  main) into `skylings.js`: `esbuild entry.ts --bundle --format=iife --alias:@=./src --outfile=skylings.js` with those
  files copied under `src/`.
- `render.cjs`: serves the folder and renders 702 frames (or given times) with Playwright.
- `mix_story.py`: Ali's two lines (My Movie 6 at 0:33 and 5:58) plus locally made pixel sounds.
- `story-notes.txt`: the story beat by beat, music beats, caption ideas.

Not in the repo: the footage frames (`s5/` from My_Movie_6.mov), the voice clips, the font file (Fraunces 600, OFL) and the
old logo (`public/brand/lifeflow-mark-transparent-512.png` on this branch).
