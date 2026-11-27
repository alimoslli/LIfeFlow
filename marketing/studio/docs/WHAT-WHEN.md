# What to use when

The studio decides per scene, cheapest first, and only goes up a step when the step below can't get the shot right.

| The shot is | Use | Cost |
| --- | --- | --- |
| The app, a phone, text, numbers, captions, notifications, HUD, charts, the logo | **Code** with real app captures. Never AI: it garbles UI and text. | Free (local render) |
| The skylings, the sky, icons, brand motion, 3D toys, stylised worlds | **Code** (the app's own art, voxel skylings, Three.js) | Free |
| A stylised 3D place (a toy city, a game-like street) | **Code** (City3D and friends) | Free |
| A realistic person, real room, real street, real weather, a crowd | **Hosted premium** (MAGI-2 or the best Higgsfield model for the shot), then code adds the app, HUD and text on top (hybrid) | 2.5 credits a second on MAGI-2, after a yes |
| Many images (backgrounds, textures, plates, variations) | **House image model** on a rented L40S (Z-Image Turbo + our LoRA) | GPU minutes, after a yes |
| Upscaling footage, frame interpolation | Rented GPU | A few credits, after a yes |
| An open-model video shot (only when it beats hosted on price for that shot) | **House video model** (Wan) + our LoRA | GPU minutes, after a yes |
| Training our look | LoRA on the house models from the dataset | After a yes, with a cap |

Rules:

1. Code first. A scene leaves code only for real-world realism.
2. For realism, hosted premium is the default: by our measurements it's cheaper per second than self-hosting video (2.5 against about 4.6 credits a second), with no idle time.
3. Open models are only our house models (gpu/house-models.json), so every generation is also training data. No other open model without a written reason.
4. Paid work never runs without the owner's yes on a capped price, and the shared balance is read first.
5. Renders run on the MacBook (free). A rented GPU renders code videos only when a local render would take over about 20 minutes.
6. Nothing from another company's game, film or brand: no names, characters, logos, maps or copied interfaces. "In the style of a genre" is fine; a recreation is not.
