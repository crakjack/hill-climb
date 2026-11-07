# Contract template

Copy the two blocks below into `.hillclimb/<slug>/contract.md` and `contract.json`, fill them in, and get the user's yes before round 0. Judges see the brief and the rubric. They never see product names, the target, or the panel.

```markdown
# Contract: <slug> (v1)

## Brief
<One paragraph. What the artifact is, who uses it, what job it does. No product names.>

## Scope
Will change: <files, components, routes>
Off-limits: <what the loop must not touch>

## Reference
Source: <URL, app, or repo path>, captured <YYYY-MM-DD>

## States
The artifact is captured in the same states, under the same file names, every round.
- <state-id>: <route or screen>, <viewport>, <data condition>, <interaction performed first, if any>

Holdout (final audit only): <0 to 2 state ids>

## Capture settings
<tool, viewport, device scale factor, full page or not, fonts loaded, animations off, fixture data>

## Hard gates
Must pass before any judging:
- `bun run typecheck`
- `bun run lint`
- <tests, build, contrast check, no horizontal overflow at 390px>

## Rubric
<4 to 7 criteria. Each has an id, a one-sentence definition, 2 to 5 binary checks with ids, and anchors for 9, 7, and 5 written for this artifact. Mark required checks with (required).>

## Panel
J1 fable-5.1, J2 gpt-6-astra, J3 gpt-6.1-sol. Auditor <model>, final audit only.

## Stop
Parity: every gap >= -0.5 and mean gap >= 0, plus <target and floor, if any>. Required checks pass. No confirmed blockers.
Plateau: two reverts in a row, triage, one more round on a triaged gap. Cap: 8 rounds.
Noise floor: <filled in by round 0, then frozen>
```

```json
{
  "reference": true,
  "criteria": ["task-clarity", "hierarchy", "craft", "copy", "identity"],
  "checks": ["tc1", "tc2", "tc3", "tc4", "hi1", "hi2", "hi3", "cr1", "cr2", "cr3", "co1", "co2", "co3", "id1", "id2"],
  "required": ["tc2", "tc4"],
  "judges": { "J1": "anthropic", "J2": "openai", "J3": "openai" },
  "auditorFamily": "google",
  "noiseFloor": null,
  "target": null,
  "floor": null
}
```

Set `target` only if the user wants an absolute bar on top of parity. The mean of criterion medians must reach `target`, and every criterion must reach `floor` (default `target` minus 1). With `"reference": false`, `target` is the stop condition and `noiseFloor` defaults to 1. `required` lists the checks behind the user's must-work outcomes.

## Writing good criteria

- Write the teardown first. "What does the reference do that ours doesn't?" gives better criteria than a generic design checklist.
- Every check has to be observable in a captured state, on both sides. "Primary action visible without scrolling at 390x844" works. "Feels premium" doesn't, and neither does "uses our design tokens", which only one side can pass and which gives away which side is ours.
- If a check needs an interaction (a confirm dialog, a save toast), add the post-interaction state to the pack.
- Anchor 9, 7, and 5 in this artifact's terms. Generic anchors drift toward 8.
- Separate criteria that trade off, such as density and clarity, so one score can't hide the other.
- Watch the wording. Rubric language steers taste. Anthropic found that "museum quality" pushed designs toward one look. Describe the qualities you want, not a vibe.
- Expect criteria to change once you see real outputs. That's normal. Version the contract and re-run round 0.

## Example: settings page vs a competitor's

States: `main-desktop` (1440x900), `main-mobile` (390x844), `empty-desktop`, `delete-confirm-desktop` (after clicking delete), `saved-desktop` (after saving a change). Holdout: `error-mobile` (save fails on a 390x844 screen).

```markdown
### task-clarity
A first-time user can find and finish the main settings tasks without guessing.
Checks:
- tc1: every setting has a visible label or a recognizable icon with a tooltip
- tc2 (required): the delete-confirm state asks for confirmation and names what gets deleted
- tc3: the empty state says what to do next
- tc4 (required): the saved state shows visible feedback on the same screen
9: Every task in the brief takes one obvious path, with no dead ends in any captured state.
7: The main tasks work, but one needs a second look or an extra click.
5: At least one task needs hunting, guessing, or a second try.

### hierarchy
Each screen has one clear focal point, and related settings read as groups.
Checks:
- hi1: groups have headings and consistent spacing between them
- hi2: nothing truncates or overlaps at 390x844
- hi3: section order matches how often people use each setting
9: You can scan the page and land on the right group within a couple of seconds at both viewports.
7: Groups are clear on desktop, but mobile loses some of the structure.
5: The content is all there but reads as one long list, or the mobile layout is squeezed.

### craft
Spacing, type, color, and component states are consistent and deliberate.
Checks:
- cr1: disabled, loading, and saved states are styled, not browser defaults
- cr2: spacing follows one scale, with no one-off gaps
- cr3: type uses a small set of sizes and weights with clear roles
9: Next to the best products in the category, differences come down to taste, not mistakes.
7: Solid overall, with a few details that look unfinished next to the best in the category.
5: Several visibly default or inconsistent details (mixed spacing, unstyled states).

### copy
Labels and messages say what happens.
Checks:
- co1: buttons name the action ("Revoke token", not "OK")
- co2: error and confirm messages say what happens next and how to undo or fix it
- co3: one term per concept across all states
9: Every string earns its place, and nothing needs a second read.
7: Clear, but a few strings are generic or longer than they need to be.
5: Several vague or inconsistent strings, or a message that leaves the user stuck.

### identity
It reads as one deliberate product, not a template.
Checks:
- id1: colors, radii, and spacing stay consistent across all captured states
- id2: no stock or template patterns that clash with the rest of the screen
9: It looks designed on purpose, with a consistent visual language across every state.
7: Consistent, but mostly stock patterns with little of its own.
5: Generic or inconsistent. It could belong to any SaaS app.
```

For other artifacts, keep the shape and change the criteria. For docs, try accuracy, task coverage, findability, and examples that run. For an API, try naming, consistency, error design, and the cost of the common path. For a landing page, try clarity of offer, proof, hierarchy, craft, and conversion path.
