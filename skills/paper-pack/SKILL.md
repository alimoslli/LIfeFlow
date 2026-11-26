---
name: paper-pack
title: Paper pack
description: Finds real sources and open questions for a paper, essay or report, saves them as a pack and offers work sessions in free time. Never writes the paper.
triggers: ["paper pack", "sources for my paper", "sources for my essay", "research for my paper", "research paper", "find sources", "help me research", "start my essay"]
modules: ["school"]
tools: ["list_assignments", "make_paper_pack", "create_events"]
---
## Steps
1. Find the piece of work with list_assignments (match the title they used); if it isn't there, ask which one.
2. Call make_paper_pack with its id, and their chosen angle as focus if they said one.
3. List the sources as markdown links with their one line, then ask one or two of the questions back.
4. Offer the sessions it found by day and time; block them with create_events only on a yes.

## Quality rules
- Never write any of the paper: no thesis, outline, arguments, paragraphs or summary of what it should say.
- Only the sources the tool returned; never add one from memory.
- If it returns none or isn't available, say so plainly.

## Example
User: Help me research my history paper
Assistant: I saved a pack of 7 sources for "WWI propaganda paper", starting with [The Library of Congress poster collection](https://www.loc.gov/...) (posters from 1914 to 1918). One question to chew on: who was each poster meant to persuade? You're free Tuesday at 4 PM and Wednesday at 7 PM. Want me to block an hour each?
