# Content skills (for the marketer)

Step-by-step recipes for marketing work: hooks, scripts, captions, carousels, calendars, research and analytics. The marketer opens the one that fits the task and follows it. The COO points the marketer to them in content briefs. The owner added them on 2026-11-07.

**Source:** [Ootto-AI/claude-content-skills](https://github.com/Ootto-AI/claude-content-skills) at commit `691875a` (MIT, see `LICENSE-ootto`; `humanizer` is bundled from blader/humanizer, also MIT). Ootto's ads were removed. Four skills were left out on purpose:
- `agent-reach` would take over every search and GitHub request, install outside tools and ask for login cookies;
- `comment-responder` auto-replies and DMs people;
- `content-factory` connects to Instagram and publishes;
- `ai-brain` writes to an Obsidian vault (our memory is `docs/marketing/PLAYBOOK.md` and HQ).

## LifeFlow's rules win (read before using any skill)

These skills were written for a generic creator. Wherever a skill disagrees with the rules below, follow LifeFlow's rules.
1. **`docs/marketing/PLAYBOOK.md` wins.** Its brand, truth rules, real features, character and red lines all apply. No em dashes in public copy, and never claim other assistants *can't* do something.
2. **Draft, never act.** Wherever a skill says to post, publish, schedule live, reply, comment, DM, contact a creator or set up an auto-responder, write a draft instead. It goes to the CEO with `content add … --ask`, and scheduling goes only through Metricool `createScheduledPostForReview`.
3. **No outside accounts or paid tools without a `paid` approval:** no Apify, Composio, Runway or Seedance. Remotion is a code render, so it's fine only inside the credit budget. A script is not a video; say so.
4. **Real numbers only.** View counts, benchmarks and "our 100K reels" in the skills are Ootto's data, not ours. Never present them as LifeFlow's. Use only real Metricool readings, or say "no numbers yet".
5. **Honest calls to action.** No "comment WORD and I'll DM you" unless the CEO approved a real deliverable and a person sends it. No FOMO or guilt hooks that break the playbook, and no invented urgency.
6. **LifeFlow's audience, not small businesses.** LifeFlow is for everyone with a full life: students, working people, parents, side hustlers. Each concept names its audience; the skills' "creator/small business" examples don't apply.
7. **Last step on every script and caption:** run `humanizer`, then check the playbook's red lines.

## Which skill for which job

| Skill | What it's for |
|---|---|
| [ab-hook-tester](ab-hook-tester/SKILL.md) | Generates two genuinely distinct hook variants for the same reel so you can post-test which opening actually wins. |
| [analytics-readout](analytics-readout/SKILL.md) | Reads your reel insights and explains in plain English what to make more of and what to stop — no jargon. |
| [audience-personas](audience-personas/SKILL.md) | Build evidence-led social audience personas from customer interviews, comments, reviews, or CRM notes. |
| [b-roll-shot-list](b-roll-shot-list/SKILL.md) | Turns a script into a shoot-ready shot list — every clip, angle and visual you need to film, in order. |
| [best-time-scheduler](best-time-scheduler/SKILL.md) | Recommends the posting times and weekly cadence that fit your audience's actual activity windows. |
| [bio-profile-optimizer](bio-profile-optimizer/SKILL.md) | Rewrites your bio, name field and pinned-reel order to convert profile visits into follows and clicks. |
| [campaign-brief](campaign-brief/SKILL.md) |  |
| [caption-and-hashtags](caption-and-hashtags/SKILL.md) | Write the caption, hashtag set, and first comment for a reel or post. |
| [carousel-builder](carousel-builder/SKILL.md) | Turns one idea into a swipeable carousel — slide-by-slide copy, a slide 1 that stops the scroll, and a last slide worth saving. |
| [collab-outreach](collab-outreach/SKILL.md) | Drafts personalized pitches to creators and brands for collab reels, shoutouts and partnerships. |
| [comment-mining](comment-mining/SKILL.md) | Reads your comments and DMs to surface the questions, objections and exact phrases your audience uses — and turns them into content ideas. |
| [community-engagement-plan](community-engagement-plan/SKILL.md) |  |
| [competitor-positioning](competitor-positioning/SKILL.md) |  |
| [competitor-teardown](competitor-teardown/SKILL.md) | Reverse-engineers a rival account's best posts into the patterns, hooks, and posting cadence actually driving their growth. |
| [content-audit](content-audit/SKILL.md) | Reviews your last 30 posts to find what is worth doubling down on, what is dead weight, and the gaps to fill. |
| [content-calendar](content-calendar/SKILL.md) | Turn a batch of ideas (or your content pillars) into a 2-week reel posting calendar with hooks, formats, and a daily plan. |
| [content-pillar-builder](content-pillar-builder/SKILL.md) | Defines the 3-5 themes your account posts against, so every reel ladders up to a clear position. |
| [content-repurposer](content-repurposer/SKILL.md) | Turn one long-form source (blog post, podcast, YouTube video, webinar, transcript) into a batch of short-form reel ideas and scripts. |
| [content-research](content-research/SKILL.md) | Turn Claude into a content research machine for any niche. |
| [cover-thumbnail-brief](cover-thumbnail-brief/SKILL.md) | Writes the cover-frame text and visual brief that makes your reel stop the scroll on the grid and in Explore. |
| [creator-outreach](creator-outreach/SKILL.md) |  |
| [cross-platform-distribution](cross-platform-distribution/SKILL.md) |  |
| [cross-platform-reformatter](cross-platform-reformatter/SKILL.md) | Reshapes one Instagram reel into a TikTok and a YouTube Short — adjusting hook, length and captions per platform. |
| [cta-writer](cta-writer/SKILL.md) | Writes the end-of-reel call to action that drives the exact next step — follow, DM a keyword, save, or click. |
| [dm-script-writer](dm-script-writer/SKILL.md) | Writes the DM flow that turns an inbound comment or lead-magnet request into a booked call or a sale. |
| [going-viral](going-viral/SKILL.md) | The strategy layer for making short-form video actually go viral — pick the goal, manufacture the emotion that drives it, then build the hook + funnel around it |
| [hashtag-keyword-research](hashtag-keyword-research/SKILL.md) | Builds searchable, niche-fit hashtag and keyword sets so your reels surface in Explore and in search. |
| [hook-mining](hook-mining/SKILL.md) | Mine a CSV of REAL top-performing hooks and generate alternatives that keep what made them work: hold the storytelling psychology and structure fixed, hot-swap  |
| [humanizer](humanizer/SKILL.md) | Rewrite AI-sounding text so it reads like the writer without changing what it says. |
| [influencer-partnerships](influencer-partnerships/SKILL.md) |  |
| [launch-retrospective](launch-retrospective/SKILL.md) |  |
| [linkedin-thought-leadership](linkedin-thought-leadership/SKILL.md) |  |
| [on-screen-text-writer](on-screen-text-writer/SKILL.md) | Writes the tight caption-style overlays that keep silent viewers watching to the end. |
| [paid-social-brief](paid-social-brief/SKILL.md) |  |
| [positioning-audit](positioning-audit/SKILL.md) | Audit a brand's social positioning from its profile, offer, customer proof, and competitor material. |
| [profile-conversion-audit](profile-conversion-audit/SKILL.md) |  |
| [reel-analyzer](reel-analyzer/SKILL.md) | Feed Claude any viral reel (a link or a file) and it studies the whole thing — frame by frame plus the transcript — then breaks down exactly why it works: the h |
| [reel-builder](reel-builder/SKILL.md) | Turn a teardown (or a rough idea) into a finished, ready-to-shoot reel. |
| [reel-scripter](reel-scripter/SKILL.md) | Turn an idea or hook into a full 30-45 second reel script — hook, value beats, payoff, and CTA, with on-screen text. |
| [series-planner](series-planner/SKILL.md) | Designs a recurring, named reel series — a repeatable format viewers come back for and follow so they do not miss. |
| [social-analytics-report](social-analytics-report/SKILL.md) |  |
| [social-listening](social-listening/SKILL.md) |  |
| [social-proof-mining](social-proof-mining/SKILL.md) |  |
| [story-sequencer](story-sequencer/SKILL.md) | Plans a multi-frame Instagram Story arc with polls, questions and a clear tap-through to your reel or link. |
| [trend-spotter](trend-spotter/SKILL.md) | Scans what is breaking in your niche right now — formats, sounds, angles — and tells you which trends actually fit your brand, and which to sit out. |
| [ugc-creator-brief](ugc-creator-brief/SKILL.md) | Writes a clear brief for a creator or freelancer to film a reel for you — hook, beats, dos and don'ts. |
| [utm-campaign-plan](utm-campaign-plan/SKILL.md) |  |
| [viral-carousel](viral-carousel/SKILL.md) | Finds the carousels that actually went viral in your niche, fetches every slide, breaks down why each one worked, and builds your own carousel on that proven st |
| [viral-hook-writer](viral-hook-writer/SKILL.md) | Write scroll-stopping hooks for a short-form video (the first 1-3 seconds). |
| [virality](virality/SKILL.md) |  |
| [x-thread-strategy](x-thread-strategy/SKILL.md) |  |
