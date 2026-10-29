# ADR 0013: Jarvis skills

**Status:** accepted (2026-10-30)

**Context.** The spec (`docs/lifeflow-spec/07-jarvis-skills.md`) asks for modular skills: one folder each, routed per request, logged and rated per skill, and extensible without core code changes.

**Decision**

- **Folders.** Each skill is `skills/<name>/` with:
  - `SKILL.md`: front matter (name, title, description, triggers, modules, tools) plus Steps, Quality rules and an Example.
  - `evals.json`: 5+ prompts that must route to it.
- **Compiling.** `scripts/build-skills.ts` compiles the folders into `src/server/jarvis/skills/index.generated.ts`.
  - `npm run build` and `vercel-build` run it.
  - `tests/unit/skills.test.ts` fails when the file is stale, when a skill names a tool that doesn't exist, or when an eval prompt doesn't route to its skill.
- **Routing** (`routeSkills`) is deterministic and costs no extra model call:
  - Trigger phrases match at word starts, and longer phrases count more.
  - There's a small boost for the page the user opened Jarvis from.
  - At most 2 skills, and only clear matches.
- **Prompt.** The chosen skills' bodies go into `buildContext` (per request), never into the cached `INSTRUCTIONS`. The global rules always win over a skill.
- **Measured.**
  - `jarvis_runs.skills` records which skills ran.
  - `jarvis_runs.rating` holds the 👍/👎 from the chat.
  - `skillStats` gives uses, success rate and ratings per skill, and flags skills rated down at least twice and more often down than up.
  - Settings → Assistant → Skills shows these stats.

**Consequences**

- Adding a skill = a new folder + `npm run skills`. A model-based router can replace `routeSkills` later; the evals stay as the regression set.
- Ratings never contain message text, and no user data is used for training.
