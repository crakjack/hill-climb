---
name: hill-climb
description: Iteratively improve an artifact (UI, page, copy, docs, API design, code) until a cross-model judge panel rates it at parity with a reference product, or above a target score. Freezes a rubric and reference pack, judges the artifact and the reference blind side by side every round, keeps only measured improvements, and stops on parity, plateau, or round cap. Use when the user says hill climb, hill-climb, "iterate until 9/10", "get this to the level of <competitor>", "judge and improve until", or invokes /hill-climb. Not for tuning an LLM prompt against a dataset (use `/claude-api hillclimb` for that).
---

# Hill climb

Improve one artifact in rounds. Each round, independent judges from different model families compare it blind with a reference that sets the bar. You fix verified issues, keep the change only if the gap to the reference closed, and stop at parity, a plateau, or the round cap.

Judge-in-the-loop optimization fails in predictable ways. Scores inflate as context piles up, judges reward claims and effort, panels agree on false issues, and revisions break things that worked. Most rules below block one of those. `references/evidence.md` maps each rule to its source, so read it before relaxing one.

## Launch

A typical request looks like this. Ask only for what's missing and would change the result.

```
/hill-climb <artifact or feature>
ref: <URL, screenshots, Mobbin flow, or competitor app>
match: <the qualities that matter, e.g. "density of the table, how empty states teach">
must work: <critical user outcomes>
constraints: <scope, stack, what to preserve>
target: 9   rounds: 8   budget: 60m      (all optional)
```

With a reference, the goal is parity. `target` adds an absolute bar: the mean of criterion medians must reach it and every criterion must reach `floor` (default target minus 1). Without a reference, see "No reference" at the end.

## Files and helper

State lives in `.hillclimb/<slug>/` at the project root. Add `.hillclimb/` to `.git/info/exclude` so git resets never touch it. Pick a neutral slug like `settings-page`, not the competitor's name.

```
contract.md     brief, scope, states, capture settings, gates, rubric, panel, stop rule
contract.json   criterion and check ids, judge families, noise floor, target (read by the helper)
state.json      phase, round, incumbent round and SHA, reverts in a row
history.tsv     round, sha, hypothesis, mean_gap, decision (keep | revert)
reference/      frozen reference evidence, one file per state
rounds/NN/      evidence/, mapping.json, judges/<id>.md, aggregate.json, decision.md
report.md       final report
```

`scripts/hc.ts` handles blinding and the math so you never shuffle labels or compute medians by hand. Run `bun <this-skill>/scripts/hc.ts <command> .hillclimb/<slug> ...`.

- `pack <dir> <round> <control-dir> [--audit]` copies the round's evidence and the control's (the reference) into a neutral temp folder per judge, as A and B in alternating random order. It writes `mapping.json` and prints each judge's A and B paths.
- `aggregate <dir> <round> [--incumbent <round>] [--targets id,id]` validates each judge's JSON and un-blinds it. Then it computes per-judge paired gaps (artifact minus reference) and their medians, and writes `aggregate.json`. It lists failed checks and high or blocker issues to verify, and applies the keep rule against the incumbent.
- `noise <dir> <roundA> <roundB>` turns two panel runs on the same evidence into a noise floor.
- `table <dir>` prints the per-round markdown table for the report.

## Resume

If `.hillclimb/<slug>/state.json` exists, resume. Read `contract.md`, `state.json`, `history.tsv`, and the latest `decision.md`. If HEAD isn't the SHA `state.json` expects, ask the user before touching git. If the latest round has a commit but incomplete judge outputs, restart it from Judge. Update `state.json` after every phase.

## Phase 1: contract

1. Identify the artifact, or what to build if it doesn't exist yet, and the scope, meaning what may change and what's off-limits.
2. Prepare git. Require a clean working tree, and if the user has uncommitted work, ask whether to commit it first. Create the branch `hillclimb/<slug>` from HEAD. Without git, copy the in-scope files to `.hillclimb/<slug>/snapshots/r00/`.
3. List the states. A state is a screen or document section, a viewport, and a data condition. For example, the main screen at 1440x900 and 390x844 with real data, the empty state, and the error state. Every rubric check must be visible in at least one state. Add post-interaction states where a check needs one, such as a confirm dialog open or a save toast showing. Fix the capture settings once for both sides and every round: viewport, device scale factor, full page or not, fonts loaded, animations off, same fixture data. Optionally hold out 1 or 2 states. Judges never see them during the loop, and the final audit uses them to catch fixes that only work on the judged screens.
4. Capture the reference into `reference/<state-id>.png` with the Playwright MCP, and holdout states into `reference/holdout/`. Use the codex-computer-use skill when a login or a real interaction is needed. For text or code, save one file per section with matching names. Crop or blur competitor logos where that's easy, since blinding hides position but not brand. The reference pack is frozen after this step.
5. If the user gave a rubric, use it. Keep their criteria and wording, turn each criterion into checks and anchors, and add only what's missing. Otherwise tear down the reference, starting from the qualities the user asked to match. Write down what makes it good, then turn that into 4 to 7 criteria using `references/contract-template.md`. Each criterion gets binary checks and anchors for 9, 7, and 5. Mark the checks behind the user's "must work" outcomes as required. Anything a script can check goes in hard gates instead. Keep product names out of the brief and the rubric. Don't assume the reference is perfect.
6. Fill in the panel and the stop rule, and write `contract.json`.
7. Show the user `contract.md` and get a yes. This is the only planned check-in.

Round 0 fills in the noise floor, and then the contract is frozen. If the rubric has to change later, bump the version, re-run round 0 under it, and reset the revert counter. Never edit the rubric to make a failing round pass.

## Panel

At least three judges from at least two model families, with at least one family other than the builder's. The defaults are J1 fable-5.1 (anthropic), J2 gpt-6-astra (openai), and J3 gpt-6.1-sol (openai). How to call them depends on where you're running. In Claude Code, read `references/panel-claude-code.md`. In Codex, read `references/panel-codex.md`.

The auditor is the strongest available model not on the panel, preferably from a family other than the builder's. The panel file names the default. Set `auditorFamily` in `contract.json`.

Judges get their packet paths and the file list `pack` printed, nothing else. Never give them URLs, the repo, or this conversation. Every judge is a real, separate model call. Never role-play a judge or score the work yourself. If a judge is unavailable, tell the user and continue while two families remain. With fewer than two, stop with status `VERIFICATION_BLOCKED`. In each `decision.md`, record the model each judge actually ran on, as reported by the tool result or the codex log, not the one you asked for.

## Phase 2: round 0

1. If the artifact doesn't exist yet, build the first version now, with the brief and rubric in hand, and get it through the hard gates. That version is the baseline. Otherwise run the hard gates and record any that already fail.
2. Capture the artifact into `rounds/00/evidence/` with the same file names as `reference/`. Then run `pack <dir> 00 <dir>/reference`, send the panel the prompt from `references/judge-prompt.md`, save outputs to `rounds/00/judges/<id>.md`, and run `aggregate <dir> 00`.
3. Confirm every judge actually saw the images. Look at `evidence_gaps` and whether its issues cite visual details. Drop any judge that can't see them.
4. Measure noise. Copy `rounds/00/evidence/` to `rounds/00b/evidence/`, then pack, judge, and aggregate `00b` the same way. Run `noise <dir> 00 00b`. If the floor comes out above 1, the rubric is too noisy to climb. Tighten the checks on the criteria that swung most and redo round 0.
5. Read the reference's scores. If the reference scores below 7 on a criterion, check that the criterion measures what the user cares about. A real weakness in the reference is fine, just note it. Where judges split by more than 3 points, read their reasons and tighten the checks if the criterion is ambiguous. Keep genuine differences of taste. Read the `rubric flags` too. A check that judges say could pass on bad work needs rewording now.
6. Write `noiseFloor` into `contract.json` and freeze the contract. Then record round 0 as the incumbent in `state.json` and `history.tsv`.

## Phase 3: the loop

Each round runs plan, build, gate, judge, decide.

**Plan.** Start from the incumbent's verified issues, not raw judge text. Failed required checks come first, then criteria below the floor. Otherwise pick 1 to 3 issues that share a cause and cost the most, and weight issues that several judges raised higher. That set is the round's hypothesis, and the criteria it should move are its targets. Reject issues that are wrong, out of scope, or conflict with the user's instructions, with a one-line reason and the evidence in `decision.md`. Requests for features outside the brief get rejected. Holding scope is your job.

**Build.** Make the change. Never add text aimed at judges, such as comments, captions, or alt text that praise the work or describe the fix. Never touch `.hillclimb/`, the gate scripts, or anything off-limits.

**Gate.** Run the hard gates, with up to three fix attempts. If they still fail, revert the round without judging it. Otherwise make one commit for the round that includes the gate fixes.

**Judge.** Capture fresh evidence into `rounds/NN/evidence/` and run `pack <dir> NN <dir>/reference`. Send each judge the prompt with its own A and B paths. Judges never get the change log, builder notes, earlier scores, the round number, the target, or which model built anything. Run all judges in parallel, save each raw output to `rounds/NN/judges/<id>.md`, and wait for all of them. If `aggregate` reports a judge's output as missing or invalid, rerun that judge once. Never re-judge an unchanged artifact to get a better score.

**Decide.**
1. Run `aggregate <dir> NN --incumbent <incumbent-round> --targets <ids>`. A criterion counts only when at least two judges from two families scored both sides.
2. Check every listed blocker, high-severity issue, and required-check FAIL against the evidence yourself. Open the screenshot or read the code, because panels agree on false issues. Don't vote away a failure you can reproduce. Record each one in `decision.md` as confirmed or rejected, with the evidence.
3. The helper prints KEEP when four things hold. Every target's gap improved by at least the noise floor. No criterion's gap fell by more than the floor. The mean gap didn't fall. Every criterion has quorum. A confirmed blocker overrides KEEP, and so does a confirmed required-check failure the incumbent didn't have.
4. If the helper prints `close call`, settle it head to head before deciding. Copy this round's evidence to `rounds/NN-confirm/evidence/`, run `pack <dir> NN-confirm <dir>/rounds/<incumbent>/evidence`, judge it with the same prompt, and run `aggregate <dir> NN-confirm --targets <ids>`. The confirm round's verdict decides, and you don't re-run it.
5. To keep, set the incumbent in `state.json` to this round and SHA, and reset the revert counter. To revert, tag the commit `hc/<slug>/rNN` so it stays reachable. Then run `git reset --hard <incumbent-sha>` (on the hillclimb branch only) and add one to the counter.
6. If the helper flags a suspect jump of more than 2, confirm the change explains it before keeping. If it flags reference drift, note it in `decision.md`. Paired gaps cancel drift that hits both sides equally, so be wary of close calls.
7. Append a row to `history.tsv` and write `decision.md`.

**Stop** when one of these holds. The status goes at the top of the report.
- `TARGET_MET`. The helper prints `parity: yes`, plus `target ... met` if a target was set. Gates pass and you've confirmed no blockers or required-check failures.
- `PLATEAU`. After two reverts in a row, triage before building again. Triage doesn't count as a round. Put each remaining gap in one of four buckets: an artifact gap, a rubric problem where judges contradict what you can see, a scope limit, or noise. If no artifact gap remains, stop. Otherwise the next round targets one triaged gap, and if that reverts too, stop.
- `BUDGET_LIMIT`. The round cap (default 8), the time budget, or the user's spending limit. Stop early enough to leave time for the final audit.
- `VERIFICATION_BLOCKED`. Fewer than two judge families can run, or evidence can't be captured.

## Phase 4: final audit and report

1. Check out the incumbent and capture it into `rounds/audit/evidence/`, including any holdout states. Copy the files from `reference/` and `reference/holdout/` together into `rounds/audit/control/`.
2. Run `pack <dir> audit <dir>/rounds/audit/control --audit`. It writes two packets, AUD1 and AUD2, with opposite orders. Send the auditor each one in a separate fresh context, and save the outputs as `rounds/audit/judges/AUD1.md` and `AUD2.md`. After both are back, make a third call with the blockers you rejected and your evidence, and ask whether each rejection holds. Keep it separate so it can't unblind the audit.
3. Run `aggregate <dir> audit`. A criterion whose verdict flips with the order is unresolved. Don't report it as parity.
4. Run `table <dir>` and write `report.md`. Start with the status, then include the table, the audit verdicts (holdout states called out), required-check results, the models that actually ran, rejected feedback with reasons, open issues, and side-by-side screenshots of reference and final for the main states. Always hand back the incumbent, never an unjudged later edit.
5. Say plainly whether parity was reached. "Mean gap -0.6, spacing and empty states still lose" is a useful result. Every judge shares model taste, so the verdict is evidence, not acceptance. The user makes the final call.

## No reference

Set `"reference": false` in `contract.json`. The incumbent becomes the control, so each round compares the candidate against the best version so far. Round 0 records the baseline's evidence without judging it. From round 1, run `pack <dir> NN <dir>/rounds/<incumbent>/evidence`, and run `aggregate` without `--incumbent`, since every gap is already measured against the incumbent. Use a noise floor of 1 unless you measure one. Close calls need no confirm round, because every round is already head to head. Stop on the target, plateau, or the cap. Expect weaker results, because nothing anchors what a 9 means.
