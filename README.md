# hill-climb

A skill for Claude Code and Codex that improves something you're building, round by round, until judges from different AI model families rate it even with a product you name as the bar.

You give it a task, a reference (a competitor's page, screenshots, a doc), the qualities you want to match, and what must work. It writes a rubric, builds or takes your current version, and loops:

1. Fix the biggest verified issues.
2. Run your checks (typecheck, lint, tests) and take fresh screenshots.
3. Three judges compare your version with the reference, without knowing which is which. They get no history and no earlier scores.
4. Keep the change only if the gap to the reference closed. Otherwise roll back to the best version so far.

It stops when you reach the reference, when progress stalls, or at a round or time limit. You get the best verified version, a score table by round, side-by-side screenshots, and the gaps that remain.

The loop is built around how judge-driven loops usually fail: scores that inflate over rounds, judges swayed by claims or the order artifacts are shown in, panels agreeing on bugs that don't exist, and revisions that break what worked. [`references/evidence.md`](references/evidence.md) links each rule to the paper or post behind it. [`RESEARCH.md`](RESEARCH.md) surveys existing tools and papers.

## Requirements

- Claude Code, Codex CLI, or both, each logged in. Judges from two model families need access to both providers.
- [bun](https://bun.sh), which runs `scripts/hc.ts` (blind A/B packing and the scoring math).
- A browser tool for UI work, such as the Playwright MCP in Claude Code or Codex's computer use.

## Install

```bash
git clone https://github.com/crakjack/hill-climb ~/.claude/skills/hill-climb
~/.claude/skills/hill-climb/install.sh
```

`install.sh` copies the skill into `~/.codex/skills/hill-climb` for Codex and warns about anything missing. To update, run `git pull` in `~/.claude/skills/hill-climb` and run `install.sh` again. Restart open sessions afterwards.

If you only use Codex, clone anywhere and run `install.sh`. It installs into both tools.

## Use

In Claude Code, type `/hill-climb`. In Codex, ask for the hill-climb skill by name. Both also trigger on phrases like "hill climb this" or "iterate until 9/10".

```
/hill-climb build the billing settings page
ref: https://competitor.com/settings/billing
match: how they show plan limits, the upgrade flow
must work: changing plan asks for confirmation, invoices download
constraints: our design tokens, no new dependencies
target: 9   rounds: 8   budget: 60m      (all optional)
```

You can also paste your own rubric. The agent checks back with you once, to approve the rubric and plan, and then runs on its own. State lives in `.hillclimb/<slug>/` in your project, so an interrupted run can resume. Work happens on a `hillclimb/<slug>` branch.

## Choosing judges

The default panel is fable-5.1 (Anthropic), gpt-6-astra (OpenAI), and gpt-6.1-sol (OpenAI), with a held-out auditor for the final check. Swap in whatever models you have. Keep at least three judges from at least two families, and at least one family different from the model doing the building. Edit:

- [`references/panel-claude-code.md`](references/panel-claude-code.md) and [`references/panel-codex.md`](references/panel-codex.md) for how each judge is called.
- The `judges` map in each run's `contract.json` (judge id to model family), which the scoring script uses to check that a decision rests on two families.

## Files

```
SKILL.md                         the loop the agent follows
references/judge-prompt.md       the prompt each judge gets
references/contract-template.md  rubric template with a worked example
references/panel-*.md            how to call judges from each tool
references/evidence.md           the source behind each rule
scripts/hc.ts                    packing, validation, keep/revert math, report table
install.sh                       installs for Claude Code and Codex
```

## Uninstall

```bash
rm -rf ~/.claude/skills/hill-climb ~/.codex/skills/hill-climb
```

## License

MIT
