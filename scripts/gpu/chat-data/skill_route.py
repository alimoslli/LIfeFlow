"""The app's own skill routing rule (src/server/jarvis/skills/index.ts), in Python, for the bank builder and the coverage
count: trigger phrases at the start of a word, longer phrases count more, the best two within half of the best score.
It reads the trigger lists from skills/*/SKILL.md on this branch and, for skills that exist only on the latest main, from
`git show origin/main:skills/<name>/SKILL.md` (nothing is fetched here: run `git fetch origin main` first for the newest)."""
import json, re, subprocess
from pathlib import Path


def front(text):
    name = re.search(r"^name:\s*(\S+)", text, re.M)
    trig = re.search(r"^triggers:\s*(\[.*\])\s*$", text, re.M)
    return (name.group(1), json.loads(trig.group(1))) if name and trig else None


def load_skills(root):
    """(this branch's skills, all skills): name -> trigger phrases. `all` adds the skills only main has."""
    root = Path(root)
    here = {}
    for f in sorted((root / "skills").glob("*/SKILL.md")):
        k = front(f.read_text())
        if k:
            here[k[0]] = k[1]
    every = dict(here)
    try:
        names = subprocess.run(["git", "-C", str(root), "ls-tree", "--name-only", "origin/main", "skills/"], capture_output=True, text=True, check=True).stdout.split()
        for n in names:
            n = n.split("/")[-1]
            if n in every:
                continue
            got = subprocess.run(["git", "-C", str(root), "show", f"origin/main:skills/{n}/SKILL.md"], capture_output=True, text=True)
            k = front(got.stdout) if got.returncode == 0 else None
            if k:
                every[k[0]] = k[1]
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass   # no origin/main here: only this branch's skills
    return here, every


def router(skills):
    patterns = {s: [(re.compile(r"(^|[^a-z])" + re.escape(t.lower())), len(t.split())) for t in ts] for s, ts in skills.items()}

    def route(text, most=2):
        t = text.lower()
        scored = sorted(((sum(w for p, w in ps if p.search(t)), s) for s, ps in patterns.items()), reverse=True)
        scored = [(n, s) for n, s in scored if n > 0]
        best = scored[0][0] if scored else 0
        return [s for n, s in scored if n >= best / 2][:most]

    return route
