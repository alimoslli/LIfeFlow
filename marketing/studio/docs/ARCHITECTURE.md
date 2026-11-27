# LifeFlow Creative Studio: architecture and decisions

The studio makes LifeFlow videos from code, from the real app, from open-weight models on rented GPUs, and from premium hosted models, in one pipeline. It lives in `marketing/studio/` as its own package: it has its own `node_modules`, it is ignored by the app's typecheck, lint and format (the repo excludes `marketing/`), and the app never imports it.

## The pieces

| Layer | What | Why this tool |
| --- | --- | --- |
| Compositions | Remotion 4 (React, TypeScript), one composition per scene plus a full preview | Frame-exact, deterministic, reusable React components, and it can import the app's own TypeScript drawing code. |
| 3D | Three.js through @react-three/fiber inside Remotion (`@remotion/three`) | Phones, voxel skylings, cities and camera moves are code. Rendered by the same frame clock as everything else. |
| The real app | The synced app checkout (`.app`, origin/main) running locally on its own database (`budgetflow_studio`) with made-up profiles, filmed by Playwright on a frozen clock (`scripts/capture.mjs`) | The app's real screens, never redrawn. A frozen clock stepped one frame at a time makes captures repeat exactly. |
| The app's art | `src/app-bridge`: the app's skyling pixel code, sky colours, pixel icons, brand tokens and logo files, imported from the checkout | When a skyling or the sky changes in the app, the next render changes with it. |
| Assembly | FFmpeg: concat of cached scenes, sound mix (music, sound effects at cue times), loudness to -14 LUFS | Fast, free, scriptable. |
| Checks | `scripts/qc.mjs` (FFmpeg filters and ffprobe) | Machine checks on every render; people check taste on the storyboard. |
| GPU | Higgsfield GPU Harness via Claude's Higgsfield tools, planned by `gpu/planner.mjs` | Already ours, billed by the second, with persistent `/workspace`, open models, Blender and desktop boxes. |
| Premium | Higgsfield hosted models (MAGI-2 and others) | Where open models and code can't reach the look. |
| Dashboard | `dashboard/` (Node's own HTTP server, one HTML page) | Concepts, storyboards, drafts, comparisons, change requests, costs. No framework to maintain. |

### Considered and not used (yet)

- **Blender with Python, locally**: not installed. Its strength is photoreal lighting and physics; the GPU Harness has Blender Studio boxes (`kind: blender_studio`) when a scene needs it, so we don't carry it on the MacBook or in this container.
- **Unreal Engine**: runs on a Harness desktop box (`kind: desktop`, the /gpu/references/unreal preset). Worth it only for a big environment piece; nothing in the first three videos needs it.
- **ComfyUI**: not in the Harness catalog. The catalog models run without it. Install it on a compute box (into `/workspace`) the day a workflow needs node graphs (for example ControlNet passes over our own renders).
- **Motion Canvas, Revideo**: close to Remotion, but Remotion's 3D, its renderer API and its ecosystem fit better.
- **Remotion licence**: free for individuals and companies of up to three people. LifeFlow fits today. Past three people, a company licence is needed.

## Production modes

Each scene carries a mode, a reason and, when paid, an estimate. The dashboard shows them; paid modes never run without a yes.

- **Code only**: type, UI, the real app, skylings, 3D toys, phones, HUDs, charts, particles. Free and repeatable. The three proof-of-concept videos are all code.
- **Hybrid**: generated footage (people, real places, photoreal cities) under code-made graphics and the real app. Example: the crime-game street plate from MAGI-2 or Wan, with the HUD and the phone in code.
- **AI cinematic**: generation-heavy. Only when the shot is about real people, real light and real motion that code can't fake on our budget.

How the studio recommends: anything about the app, the brand, text, the skylings or graphics is code. Real humans, real locations, or photoreal weather and crowds are hybrid. A whole scene of real-world action is AI. Then the planner compares the price of self-hosting that footage with hosted models, using our measured runs.

## Remote GPU (Higgsfield GPU Harness)

Verified on 2026-11-27 with the free read-only tools:

- **GPUs**: L40S 48 GB at 71 credits an hour, RTX PRO 6000 96 GB at 98, H100 120, H200 134, B200 176, B300 197. One-GPU starts in about 15 to 60 seconds.
- **Open models in the catalog**: Z-Image Turbo, Z-Image Base, Qwen Image, LTX Video, Wan 2.2 T2V A14B, Wan 2.1 I2V 480P, MiniMax H3. There are 34 curated LoRAs and none of our own. Our own Hugging Face models can be saved (`gpu_private_models`); they run in a Supercomputer chat or by hand on a compute box.
- **Remote compute**: shell commands on a box (`gpu_rental_exec`, 90 seconds a call; longer work with nohup). **Storage**: `/workspace` persists across boxes; everything else is wiped on stop, so custom weights go in `/workspace/hf`.
- **Blender** (`blender_studio`) and **Unreal, Nuke, Resolve, Houdini** (`desktop`).
- **Billing**: by the second from ready. A box stops itself after `auto_pause_minutes` idle (default 10), and nothing rents above the `max_credits_per_hour` we pass.
- **How the studio reaches it**: only through Claude's Higgsfield tools. There's no API key for the studio's scripts, so the planner writes a plan and Claude runs it (docs/GPU.md). That is also the approval point.

**Licences matter more than benchmarks.** MiniMax H3's licence is reported to exclude the US, EU, UK and South Korea, so it is blocked for LifeFlow until a lawyer reads it. FLUX.2 [dev] is non-commercial without a paid licence. LTX Video has its own open-weights licence to read before commercial use. Wan 2.x, Qwen Image and Z-Image are Apache-2.0.

**Newer models seen in research (not in our catalog)**: LTX-2.5 (4K with audio; free only under $10M revenue), HunyuanVideo 1.5, Qwen-Image 2.0 (native 2K, February 2026), and a reported Wan 2.7 that we could not confirm. Most sources still name Wan 2.2 as the safest commercial default for self-hosted video.

## Self-hosted versus hosted: what we know and what we'll measure

From our own runs (gpu/measured.json):

- A 5-second open-model video clip took about 14 minutes and 23 credits on an RTX PRO 6000 (Nov 21).
- Hosted MAGI-2 costs 37.5 credits for 15 seconds at 1080p with sound (2.5 credits a second), with no idle time and no setup.
- So for video, self-hosting is **not** cheaper today: about 4.6 credits a second against 2.5, before load time and idle. The planner shows this on every plan (the benchmark plan prices two Wan 2.2 clips at about 62 credits; the same 10 seconds on MAGI-2 cost 25).
- Self-hosting should win for **images in bulk** (Z-Image Turbo: seconds per image on an L40S at 71 credits an hour), **upscaling** (1,396 frames for about 6.5 credits) and **LoRA work**. These are guesses until the benchmark runs.

The owner dropped the model benchmark (2026-11-27): the studio focuses on code-made content, and GPU work is priced per job with the planner when a video needs it.

## Local machine versus remote

This container has 4 CPU cores, 15 GB of memory and no GPU, so Remotion's 3D draws in software (SwiftShader). Measured numbers are in docs/BENCHMARKS.md. A MacBook Air (Apple silicon) renders the same projects faster: Chrome draws WebGL on its GPU through Metal, and it has more fast cores. Estimates for it are marked as estimates until we time one there.

Where each job runs:

- **On the MacBook**: the dashboard, writing and previewing scenes (`npm run studio`), storyboards, previews, and the final render of code-only videos (minutes, free).
- **Remote GPU**: open-model generation, upscaling, LoRA training, Blender or Unreal scenes. Possibly also big final renders of 3D-heavy code videos: a compute box can run Remotion headless with real GPU WebGL. Worth it only if a render takes longer than about 20 minutes locally, since a box costs about 1.2 credits a minute.
- **Hosted premium**: MAGI-2 and others, per shot, after a yes.
