# Measured render performance

Written by `npm run bench-report` from the render manifests. Only real measurements; nothing estimated.

Machine for these runs: 4 CPU cores (Intel(R) Xeon(R) Processor @ 2.10GHz), no GPU: WebGL is drawn in software (SwiftShader).

## Whole renders

| Project | Format | Quality | Video | Render time | x realtime | Peak memory | Cached scenes | QC |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| skyling-ad v1 | 9x16 | preview | 18s | 336s | 18.7 | 2298 MB | 0/4 | fail |
| skyling-ad v2 | 9x16 | preview | 18s | 38.3s | 2.1 | 3449 MB | 3/4 | pass |

## Scenes rendered (not from cache)

| Project / scene | Format | Quality | Kind | Seconds | Render time | x realtime |
| --- | --- | --- | --- | --- | --- | --- |
| skyling-ad / hook | 9x16 | preview | code | 2.5s | 17.5s | 7 |
| skyling-ad / dayrun | 9x16 | preview | code | 8s | 185.9s | 23.2 |
| skyling-ad / lineup | 9x16 | preview | code | 4.5s | 125.4s | 27.9 |
| skyling-ad / outro | 9x16 | preview | code | 3s | 7.2s | 2.4 |
| skyling-ad / hook | 9x16 | preview | code | 2.5s | 38.3s | 15.3 |

## Reading it

- 2D scenes (type, the app's pixel skylings, notifications, HUD) render at a few seconds per second of video or faster.
- 3D scenes (phones, voxel skylings, the city) are the slow part here because there's no GPU: software WebGL. On a machine with a GPU (an Apple silicon MacBook draws WebGL with Metal; a rented L40S box with real GL) they get much faster; time one there and the table will show it.
- The scene cache is the biggest saving: a change to one scene re-renders only that scene.
