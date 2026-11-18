# "Who Is Goldie?" (fruit drama ad)

A 54 s vertical soap-drama ad in the style of the viral fruit-head reels. Rosa (strawberry) finds messages from "Goldie" on
Leo's (banana) phone and thinks he is cheating. Goldie is his skyling. LifeFlow is not named until the phone turns round at
38 s, where the real app is on the screen.

Delivered to the owner 2026-11-18. He posts it himself; Marketing does not post or schedule it.

## Lines

| Who | Line |
| --- | --- |
| Rosa | Who the hell is Goldie? |
| Leo | Babe, wait. What? |
| Rosa | Goldie has a star for you. |
| Rosa | Promise kept? What did you promise her? |
| Leo | It's not what you think. |
| Rosa | She texts you every single morning! |
| Rosa | She knows what's in your bank account! |
| Leo | Because I told her! |
| Rosa | Do you love her? |
| Leo | She's not a person! She's my skyling. Look. |
| Rosa | Send me the link. |

End card: "Everyone's got someone." / "Meet your skyling." / "Get on the waitlist · lifeflowweb.com".

## How it was made

1. **Higgsfield, drama-ads workflow** (drama_ads_id `0cdf9f8f-21e8-4149-8cd3-e0878e912e88`): one style master, sheets for
   Rosa, Leo, the phone, the plates and the loft (`gpt_image_2_6_flare`), then four clips on `seedance_2_5`
   (omni_reference, 720p, 9:16, sound on) with a voice sample for each character, and an instrumental score
   (`elevenlabs_music_v2`). About 424 credits in all, under the owner's cap of 500.
2. **The cut** (`build.py`, 24 fps, 1080x1920): the opening take whole (she finds it, he walks in, the plate drops), the two
   Rosa close-ups from the first take, the fight take whole, then the reveal take up to 15 s.
3. **The phone**: the clip was generated with a blank glowing screen. `rec_app3.cjs` records the real app (demo account,
   skyling named Goldie) at the film phone's screen shape, 390x878: Today with the day wheel, a tap on the wheel, the day
   opens, a drag along it to tomorrow's quiz. `build.py` finds the screen in every frame, fits its four corners, and warps
   the recording onto it, keeping the thumb in front. The shot plays forward then back so the app is on screen for 5 s.
4. **Captions**: launch style (Fraunces Bold, soft white, spoken word gold), script text on the takes' own word times.
5. **Sound**: each take's own voices, matched in level; the score under them, its last hit on "She's not a person!" and its
   soft theme starting as the app appears; -14.5 LUFS.

Checked by transcribing the finished file (every line present, word for word) and on a frame sheet of every caption line.

## Notes

- The planned tag "One week later / Ray has a star for you" was left out: it would have needed a mock notification.
- The clips, sheets and score are in the owner's Higgsfield library, not in the repo. `build.py` expects them in `clips/`
  and `score.mp3` beside it, and the campfire and skit scripts beside its folder for the caption and end-card helpers.
