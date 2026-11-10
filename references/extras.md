# Extras

Read the section you need. None of this is part of a normal run.

## Close calls

`score` prints `close call` when a round sits right at the line between keep and revert. Settle it with one head-to-head against the best version.

1. Run `pack NN-confirm`. It reuses round NN's evidence and compares it with the best round's.
2. Send the judges the usual prompt and save replies to `rounds/NN-confirm/judges/`.
3. Run `score NN-confirm --targets <ids>`. Its KEEP or REVERT decides. Don't run it twice.

## Noisy scores

If judges swing by a point or more with no real change, measure the noise in round 0. This needs a reference.

1. Run `pack 00b`. It reuses round 0's evidence.
2. Judge it and run `score 00b`.
3. Run `noise 00 00b` and put the number it prints into `contract.json` as `noiseFloor`.

A change smaller than the noise floor doesn't count as progress. If the floor comes out above 1, the rubric is too vague to climb. Tighten the criteria that swung most and redo round 0.

## Held-out evidence

To check that fixes carry over to parts the judges never saw, keep one or two evidence files out of the loop. Store the reference's copies in `.hillclimb/<slug>/holdout/`. For the audit, capture the best version's full set into `rounds/audit/evidence/`, copy `reference/` and `holdout/` into one folder, and run `pack audit <that folder>`.

## An absolute target on top of parity

Set `target` in `contract.json` alongside a reference. The run then needs parity and the target. The target is met when the criteria average at least `target` and each one scores at least `floor`, which defaults to `target` minus 1.

## Changing the rubric mid-run

Only do it to fix a measurement problem, such as a check judges keep reading two ways. Note the change at the top of `contract.md`. Then delete the best round's `judges/` folder and run `pack`, the judges, and `score` on it again, so it's judged under the new rubric. Later rounds are compared against that. Scores from before the change don't compare with scores after it.

## What `score` warns about

- `suspect`: a criterion moved more than 2 points in one round. Confirm in the evidence that your change explains it before keeping.
- `drift`: judges now score the unchanged reference differently than in round 0. Gaps still hold up, since both sides are judged together, but treat a narrow win with care.
- `not enough judges`: fewer than two judges from two families scored a criterion. Rerun the missing judge once. If it still fails, the round can't be kept.

## Without git

Before each round, copy the files in scope to `.hillclimb/<slug>/snapshots/rNN/`. To revert, copy the best round's snapshot back.

## Resuming

Run `status`. If a round is unfinished, pick it up at the first missing piece: evidence, packing, replies, or scoring. If the judges' folders are gone, which happens after a reboot, run `pack NN` again. It keeps the same A and B order, so replies you already saved still count. Between rounds the working tree should be the best version. If it isn't, ask the user before touching git.
