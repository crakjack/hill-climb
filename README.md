# hill-climb

A skill for Claude Code and Codex. It improves something you're building, round by round, until judges from different AI model families rate it level with a reference you pick.

You give it a task, a reference such as a competitor's page, the qualities you want to match, and what must keep working. It writes a rubric, asks you to approve it, and then loops on its own:

1. Fix the biggest problems the judges found.
2. Run your checks, such as typecheck, lint, and tests.
3. Three judges compare your version with the reference without knowing which is which. They see no history and no earlier scores.
4. Keep the change if the gap to the reference closed. Otherwise roll back to the best version so far.

It stops when you reach the reference, when three rounds in a row fail to improve, or at a round or time limit. You get the best version, a score table by round, and the gaps that remain.

It works for UI, copy, docs, code, API design, and CLIs. Only the evidence the judges look at changes.

## Why it's built this way

The simple loop, "score it 1 to 10 and iterate until the average is 9", fails in known ways. Scores inflate as judges see history. Judges get swayed by claims and by the order they see things in. Panels agree on bugs that don't exist. New revisions break what worked. Each rule in the skill blocks one of these, and [`references/why.md`](references/why.md) links each rule to its source. [`RESEARCH.md`](RESEARCH.md) surveys the existing tools and papers.

## Requirements

- Claude Code and the Codex CLI, both logged in. Judges have to come from two model families.
- [bun](https://bun.sh), to run the helper script.
- For UI work, a browser tool such as the Playwright MCP.

## Install

```bash
git clone https://github.com/crakjack/hill-climb ~/.claude/skills/hill-climb
~/.claude/skills/hill-climb/install.sh
```

`install.sh` copies the skill into `~/.codex/skills/hill-climb` and warns about anything missing. To update, run `git pull` in `~/.claude/skills/hill-climb` and run `install.sh` again. Restart open sessions afterwards.

## Use

In Claude Code, type `/hill-climb`. In Codex, ask for the hill-climb skill by name.

```
/hill-climb build the billing settings page
ref: https://competitor.com/settings/billing
match: how they show plan limits, the upgrade flow
must work: changing plan asks for confirmation, invoices download
constraints: our design tokens, no new dependencies
target: 9   rounds: 8   budget: 60m      (optional)
```

You can paste your own rubric too. Without a `ref`, each round is judged against the best version so far.

The run keeps its state in `.hillclimb/<slug>/` in your project and works on a `hillclimb/<slug>` branch, so you can stop and resume it, then merge or delete the branch.

## Changing the judges

The default panel is fable-5.1, gpt-6-astra, and gpt-6.1-sol, with opus-5.5 as the final auditor. To use other models, edit [`references/panel-claude-code.md`](references/panel-claude-code.md) or [`references/panel-codex.md`](references/panel-codex.md). Keep three judges from two families, with one family different from the model doing the building.

## Files

```
SKILL.md                         the loop
references/contract-template.md  the contract and how to write a rubric
references/judge-prompt.md       what each judge is sent
references/panel-*.md            how to call judges from each tool
references/ui.md                 capturing screenshots for UI work
references/extras.md             close calls, noisy scores, and other unusual cases
references/why.md                the source behind each rule
scripts/hc.ts                    blinding, scoring, and the keep-or-revert rule
```

## Uninstall

```bash
rm -rf ~/.claude/skills/hill-climb ~/.codex/skills/hill-climb
```

MIT license.
