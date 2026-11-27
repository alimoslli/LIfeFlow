# LifeFlow Creative Studio: how to run it and extend it

Code-made LifeFlow videos built from the real app, with open models on rented GPUs and premium generation only where they earn it. Read `ARCHITECTURE.md` for why it's built this way and `GPU.md` before anything paid.

## Set up once (MacBook or a cloud session)

```bash
cd marketing/studio
npm install
npm run sync-app
```

`sync-app` checks out the latest app (origin/main) into `.app`, pulls its colours and logo, and records the app version. To film the real app as well:

```bash
cd .app && npm ci && cp ../demo/env.example .env && cp .env .env.local
createdb budgetflow_studio && npx tsx scripts/migrate.ts
npx tsx ../demo/seed-profile.ts ../demo/profiles/nico-mission.json
DEMO_EMAIL=alex@studio.lifeflow.local npx tsx scripts/seed-demo.ts
npm run build && PORT=3100 npm start
```

The demo environment is a separate local database (`budgetflow_studio`) with made-up people. The seeder refuses any other database, every account is a demo account, every record is `source = demo`, and the environment has no real API keys.

## Daily use

| You want | Run |
| --- | --- |
| The dashboard | `npm run dashboard`, then open http://localhost:4100 |
| To see a scene while editing | `npm run studio` (Remotion Studio, live preview) |
| Fresh app screens after an app update | `npm run sync-app` then `npm run capture` (app running) |
| A storyboard (one still per scene, seconds) | `npm run render -- <project> --storyboard` |
| A quick draft (half size) | `npm run render -- <project> --preview` |
| The final 1080p video | `npm run render -- <project>` (add `--format all` for 9:16, 1:1 and 16:9) |
| Change one scene only | `npm run render -- <project> --only <scene>` (everything else comes from the cache) |
| Check any video | `npm run qc -- <file.mp4>` |
| Price GPU work | `node gpu/planner.mjs <jobs.json>` |

From the dashboard you can send a concept, ask for a change to one scene, compare two versions side by side, watch drafts and render progress, and read costs and QC. Requests are saved in `requests/`, and Claude does the work from there. To use it from a phone on the same Wi-Fi: `HOST=0.0.0.0 STUDIO_TOKEN=<something long> npm run dashboard`, then open `http://<mac>.local:4100/?t=<token>`.

## The workflow for a new video

1. **Direction and script**: the concept becomes a one-line hook, scenes, and the exact words. App wording comes from the app.
2. **Storyboard**: the scenes are written as a project (`src/projects/<id>.tsx`), and `--storyboard` gives one still per scene to approve.
3. **Scenes**: each scene is a React component built from the kit. Its mode is code, hybrid or ai, with the reason.
4. **Assets**: app captures (`npm run capture`), the app's art (automatic), generated footage (GPU plan, after a yes) in `public/generated/`.
5. **Animation and camera**: `Stage3D` keyframes, `prog`/`useSpring` timing.
6. **The app**: real captures in `Phone3D` or full screen. Never redraw an app screen.
7. **Sound**: music and sound effects as cues in seconds in the project, mixed and levelled by the render.
8. **Preview**: `--preview` at half size.
9. **Checks**: automatic QC on every render, then the manual checks below.
10. **Final**: the full render. Versions are kept (`_v1`, `_v2`) with a manifest each.

## Manual checks (what QC can't judge)

- Every word is true to the app and the profile on screen (no made-up features, numbers that match the capture).
- No text over a face or the key action; captions clear of the platform's buttons (the kit keeps text inside `useLayout().safe`).
- The skyling is called a skyling, never an assistant. No em dashes in on-screen text.
- Fictional characters, places and brands only; nothing that copies a real game, film, person or brand.
- Watch the draft at full speed with sound once.

## The kit (src/kit)

| Component | What it does |
| --- | --- |
| `Phone3D` | A phone with real proportions; the screen plays a capture (`screenVideo`) or a still. |
| `Stage3D` | A 3D scene with studio light, reflections and a keyframed camera (`cam: [{ f, pos, look, fov }]`). |
| `VoxelSkyling` | A skyling as glossy 3D cubes, built from the app's pixel art at render time. |
| `PixelSkyling` | A skyling exactly as the app draws it, any pose (wave, celebrate, sleep…). |
| `Sky` | The app's sky at any minute, with stars, sun or moon and clouds; can run through the day. |
| `City3D` | A stylised night city (towers, lit windows, wet road, neon, fog). |
| `KineticTitle`, `Captions` | Headlines that land word by word, and word-by-word captions with the gold active word. |
| `Notification` | A push from LifeFlow with the real app mark. |
| `CashCounter`, `MiniMap`, `MissionCard`, `Objective` | Game-style HUD pieces (original designs). |
| `FinanceChart` | An area chart that draws itself, in the app's chart colours. |
| `Burst`, `Grain`, `Fade`, `PixelIcon` | Particles, film grain and vignette, scene fades, the app's own pixel icons. |
| `BrandOutro` | The sign-off: real mark, a line, the skylings, the web address. |

A new component goes in `src/kit`, exported from `src/kit/index.ts`, and takes its sizes from `useLayout()` so it works in 9:16, 1:1 and 16:9.

## Adding a project

1. Copy one of `src/projects/*.tsx`. Give it an `id`, a `concept`, its `formats`, its `captures`, `music` and `cues`, and its `scenes` (id, title, seconds, mode, why, component).
2. Add it to `src/projects/index.ts`.
3. `npm run render -- <id> --storyboard`, then `--preview`, then the final render.

## What gets saved where

- `projects/<id>/project.json`: the scenes and their modes. `renders/<file>.mp4` and `.json`: each version with its QC, timings and cost. `storyboard/`: contact sheets. `costs.json`: every render and paid job.
- `cache/scenes/`: rendered scenes keyed by a hash of the kit code, the project file, its captures and the app version (delete freely; it rebuilds).
- `public/captures/<profile>/<shot>.mp4` with a `.json` naming the app version it came from. QC warns when it's older than the synced app.
- MP4s and the cache are kept out of git (`.gitignore`); manifests, storyboards' sources and all code are in git.
