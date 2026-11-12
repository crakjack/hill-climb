# hill-climb

A skill for Claude Code and Codex. It improves something in rounds until it is good enough, and it doesn't let the agent grade its own work.

You say what you want in one line. The agent looks at the project, proposes a short plan, and after your yes it loops on its own:

1. Change the work.
2. Run your checks and measurements.
3. Have judges from other model families compare the new version with the best one so far, without knowing which is which.
4. Keep the change only if it won. Otherwise go back to the best version.

It stops at the target, after three failed rounds in a row, or at a round or time limit. You get the best version, a score table, and a `report.html` that shows the evidence before and after, side by side.

It works for UI, code, copy, docs and ideas. When a command can produce the score, such as an accuracy number or a benchmark, it climbs on that number and skips the judges.

## Use

In Claude Code, type `/hill-climb` and what you want. In Codex, ask for the hill-climb skill by name.

```
/hill-climb the settings page, until it's as clear as Linear's
/hill-climb make extractDates score as high as possible on bun eval.ts
/hill-climb come up with a name for this app
```

You can add a target, a number of rounds, a time limit, a reference, or your own criteria, in plain words. You can also change any of them while it runs.

## Install

```bash
git clone https://github.com/crakjack/hill-climb ~/.claude/skills/hill-climb
~/.claude/skills/hill-climb/install.sh
```

`install.sh` copies the skill into `~/.codex/skills/hill-climb`. To update, run `git pull` in `~/.claude/skills/hill-climb`, run `install.sh` again, and restart open sessions.

You need [bun](https://bun.sh) for the helper script, and a way to reach models from two families, for example Claude Code plus the Codex CLI.

## Why it's built this way

The simple loop, "score it 1 to 10 and iterate until the average is 9", fails in known ways: scores inflate when judges see history, panels agree on bugs that don't exist, and new revisions break what worked. [`RESEARCH.md`](RESEARCH.md) surveys the papers and tools behind the rules.

The current shape also comes from studying fourteen real runs of the first version. What they showed:

- **Compare with your own best version, not with the reference.** Scoring against a competitor each round needed a second "confirm" panel about thirty times, and a dozen of those reversed the first decision. The reference now only defines what a 9 means.
- **Measure what can be measured.** Agents built their own scoring scripts for accuracy and search quality because the skill only knew judges.
- **A score isn't proof it works.** One run ended "target met" with wrong numbers on screen, because judges saw only screenshots.
- **Don't make people write a brief.** Launch prompts had grown to 45 lines. One line is now enough.
- **Put the glue in the helper.** Every run rebuilt prompt filling, reply collection, gates and the before/after report.

## Files

```
SKILL.md                          the instructions the agent follows
references/contract.example.json  the plan file, with every field
references/judge-prompt.md        what each judge is told
references/judges.md              ways to call judges
scripts/hc.ts                     runs checks, blinds evidence, scores, reports
```

To change what judges are told, edit `references/judge-prompt.md`. The skill names no models. It uses the strongest ones it can reach and follows the model preferences in your own agent instructions.

## Uninstall

```bash
rm -rf ~/.claude/skills/hill-climb ~/.codex/skills/hill-climb
```

MIT license.
