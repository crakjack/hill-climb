# Contract template

Fill in both blocks, save them as `.hillclimb/<slug>/contract.md` and `contract.json`, and get the user's yes before round 0. Judges read the brief and the rubric, so keep product names, the target, and the panel out of those two sections.

```markdown
# Contract: <slug>

## Brief
<One paragraph. What it is, who uses it, what job it does.>

## Scope
May change: <files, sections, components>
Off-limits: <what the loop must not touch>

## Reference
<URL, app, or file, and the date you captured it. Or "none".>

## Evidence
The files judges look at. Same names on both sides, every round, no subfolders.
- <file name>: <what it shows and how to capture it>

## Gates
Commands that must pass before any judging.
- <command>

## Rubric
### <criterion id>
<One sentence saying what this criterion means.>
Checks:
- <check id>: <something a judge can answer yes or no from the evidence>
- <check id> (required): <a check behind a "must work" outcome>
9: <what a 9 looks like for this work>
7: <what a 7 looks like>
5: <what a 5 looks like>

## Panel
<Judge ids with model and family. The auditor.>

## Stop
<Parity or target. Round cap. Time budget.>
```

```json
{
  "reference": true,
  "criteria": ["clarity", "craft"],
  "checks": ["cl1", "cl2", "cr1", "cr2"],
  "required": ["cl2"],
  "judges": { "J1": "anthropic", "J2": "openai", "J3": "openai" },
  "target": null
}
```

Set `"reference": false` when there's no reference, and give a `target`. The ids in `contract.json` must match the rubric exactly, because the helper rejects replies that use other ids.

## Writing criteria

- Start from the reference. "What does it do that ours doesn't?" gives better criteria than a generic checklist.
- A judge has to be able to answer each check from the evidence, for both sides. "The primary action is visible without scrolling" works. "Feels premium" doesn't. Neither does "uses our design tokens", which only one side can pass and which gives away whose side is whose.
- Write the 9, 7, and 5 in terms of this piece of work. Generic descriptions pull every score toward 8.
- Split qualities that trade off, such as density and clarity, so one score can't hide the other.
- Describe qualities, not a mood. Wording steers taste. A phrase like "museum quality" pushes every design toward one look.

## Two worked criteria

For a settings page, judged from screenshots:

```markdown
### task-clarity
A first-time user can find and finish the main settings tasks without guessing.
Checks:
- tc1: every setting has a visible label
- tc2 (required): the delete screenshot shows a confirmation that names what gets deleted
- tc3: the empty state says what to do next
9: Every task has one obvious path, with no dead ends in any screenshot.
7: The main tasks work, but one needs a second look or an extra click.
5: At least one task needs hunting or guessing.
```

For a quickstart page, judged from the text and the output of its examples:

```markdown
### first-success
A new user gets a working result from this page alone.
Checks:
- fs1 (required): every command on the page runs as written
- fs2: the page says what you should see after each step
- fs3: prerequisites come before the first command
9: Copy, paste, and it works, and you know it worked.
7: It works, but one step leaves you unsure whether it did.
5: You need another page or a guess to finish.
```

## Criteria to start from

- UI: task clarity, hierarchy, craft, copy, consistency.
- Landing page: clarity of the offer, proof, hierarchy, craft, path to the next step.
- Docs: accuracy, task coverage, findability, examples that run.
- API or library: naming, consistency, error design, cost of the common case.
- CLI: discoverability, output you can read, error messages, sensible defaults.
