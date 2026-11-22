# An open model for the talking clip, next to Higgsfield Intone

2026-11-22. Asked for by the owner through LF Marketing ("lets test an open model to do the same video and compare them", then "i want both vids at atleast 1080p"); the rental was approved by the COO (one H100, 52 credits at most). Made-up person and voice only: Jordan is a generated character.

## What was made

| | Open model | Higgsfield Intone |
|---|---|---|
| Model | LongCat-Video-Avatar 1.6 (Meituan, released 2026-11-15, MIT licence for code and weights: commercial use allowed) | hosted |
| Native size | 480 x 832, 25 frames a second, 10.64 s | 480 x 854, 24 frames a second, 14.04 s |
| Delivered | 1080 x 1920, same frames and sound | 1080 x 1920, same frames and sound |
| Cost | 36.35 credits for the whole box, both sharpenings included | 42 credits (LF Marketing's figure) |

Clips (uploaded to the owner's Higgsfield media):

- Open model, 1080 x 1920: https://d2ol7oe51mr4n9.cloudfront.net/user_3M4RdHXwCzt85SV7RGv8R91VfvG/84cd9621-4e48-42c3-b9dc-9daaa42859a0.mp4
- Open model, as rendered (480 x 832): https://d2ol7oe51mr4n9.cloudfront.net/user_3M4RdHXwCzt85SV7RGv8R91VfvG/cdbd8d92-ab22-494e-b1d5-f68a654b84b7.mp4
- Intone, sharpened to 1080 x 1920: https://d2ol7oe51mr4n9.cloudfront.net/user_3M4RdHXwCzt85SV7RGv8R91VfvG/a3014c57-5fba-42dc-9417-aad1d263ad3d.mp4

## Numbers

- Box: one H100 (120 credits an hour), 19:49:50 to 20:08:00 UTC, 18.2 minutes, 36.35 credits, stopped by hand the moment the uploads were confirmed.
- Setup: 6 minutes (59 GB of weights in 4 minutes; the python packages were the slow part).
- Render: 317 seconds for 10.64 seconds of video, model loading included: about 30 seconds per second of video. The drawing itself was 4 segments of 8 steps at 7.0 seconds a step (224 seconds, 21 per second of video). About 62 GB of GPU memory, so it needs the H100; a 48 GB card would need the smaller 8-bit copy.
- Sharpening to 1080 x 1920 (RealESRGAN x2, then a Lanczos resize, `scripts/gpu/video/upscale.py`): 0.05 seconds a frame, 13.6 seconds for our clip and 17.6 for Intone's. Sound, frame rate and frame count untouched.
- A second clip on a box that is already set up would cost about 6 minutes, roughly 12 credits. That is an estimate from these timings, not a measured run.

## What went wrong

1. **The first render died after 8 seconds.** One audio package needs a C compiler to install and the box had none, so it was skipped without stopping the script. Cost: about 4 minutes. The COO allowed one more render on the same box inside the same cap.
2. **The second render finished all four segments, then the model's own save step failed** ("Broken pipe"): it stops writing at the end of the audio and then trips over the frames left in the last segment. The file was complete and plays without errors, so it was used. The clip is 10.64 seconds against 10.68 of audio (two frames short).

Both are fixed in `scripts/gpu/video/avatar_box.sh` (compiler installed first, an import check before the render, and a finished readable file counts as success). The fixed script has not been run again.

## What I can and cannot say about quality

I looked at five frames of each clip: the same person in both, no broken faces or hands, the open model moves the hand and changes mouth shapes more, Intone's framing is a little tighter (ours loses 14 pixels on each side to reach 9:16). I cannot hear, so **lip sync is not judged here**: LF Marketing builds the side by side and judges that for the owner. One render, one seed, default settings: this is a first look, not a tuned result.

## Sources

- https://github.com/meituan-longcat/LongCat-Video (code, MIT, run commands)
- https://huggingface.co/meituan-longcat/LongCat-Video-Avatar-1.6 (weights)
- https://github.com/MeiGen-AI/InfiniteTalk (the older model from the same team, Apache 2.0; not used)
- https://github.com/xinntao/Real-ESRGAN (the sharpener's weights, BSD 3-Clause)
