# Teaser: "Before December" (first cut, 2026-11-09)

The first public step of the rebrand. No app screens: the sit-down video (Ali in the black t-shirt, Tyler), a push into the TV,
the blobs become the old three-drop mark, it melts into a horizon, night and pixel stars come in, and only the top edge of the
new morning mark's sun rises. Ali's real lines from My Movie 6 (0:33, 6:03, 0:47, 5:56). No Higgsfield credits; Ali adds music.

- `teaser.html`: the composition (`seek(t)` draws the frame at time t; `seek(-1)` draws the poster). Colours from
  `src/components/brand/morning-mark.ts` and `src/components/skylings/night.ts` on main; font Fraunces 600 (OFL).
- `render.cjs`: serves the folder locally and renders frames with Playwright (`node render.cjs frames` for all 660, or times).
- `mix.py`: the voice lines plus locally made sound effects (glitch, whoosh, hum, glass tone, thump, star pips, sunrise chime).
- `beats.txt`: where the music beats land, caption options.

Inputs not in the repo (personal footage): frames cut from the Drive clip My_Movie_6.mov (`s1`, `s2`, `s5` folders), the
four voice clips, the old mark (`public/brand/lifeflow-mark-transparent-512.png` on this branch) and the font file.
This cut uses the iMovie export (vertical picture inside a 1920x1080 frame), so it is soft; redo `s1/s2/s5` from the phone's
original clip for the final.
