---
name: hill-climb
description: Improve any artifact in rounds (UI, copy, docs, code, API design) until judges from different model families rate it level with a reference, or above a target score. Each round is judged blind, only measured improvements are kept, and the loop stops on target, plateau, or budget. Use when the user says hill climb, "iterate until 9/10", "get this to the level of <competitor>", "judge and improve until", or invokes /hill-climb. To tune an LLM prompt against a test dataset, use `/claude-api hillclimb` instead.
---

# Hill climb

Improve one thing in rounds. Each round, judges from other model families compare your version with a reference, without knowing which is which. You fix what they found, keep the change only if you got closer to the reference, and stop when you're level with it, when progress stalls, or when the budget runs out.

## Launch

```
/hill-climb <what to improve or build>
ref: <URL, screenshots, file, or competitor>      optional
match: <the qualities that matter>
must work: <outcomes that can't break>
constraints: <scope, stack, what to keep>
target: 9   rounds: 8   budget: 60m               optional
```

Ask only for what's missing and would change the result. With a `ref`, the goal is to draw level with it. Without one, each round is judged against the best version so far, and the goal is `target`, which is 9 unless the user says otherwise. `rounds` and `budget` default to the values shown. If the user gives a rubric, use it as written.

## Rules

Judge loops fail in known ways, and each rule blocks one. `references/why.md` has the sources.

1. Every judge is a separate model call with a fresh context. Never score the work yourself or play a judge.
2. Judges get the brief, the rubric, and their two folders. They never get history, earlier scores, the target, your notes, or model names.
3. Never put text aimed at judges into the work.
4. The rubric is frozen once round 0 is logged. Never change it to make a round pass.
5. Never re-judge unchanged work to get a better number.
6. Check serious findings against the evidence yourself before acting on them. Panels agree on problems that aren't there.
7. The best version wins, not the latest one.

## Words

- **Evidence** is the set of files judges look at, such as screenshots or the text itself.
- **Control** is what a round is compared with. It's the reference, or the best version so far when there's no reference.
- **Gap** is your score minus the control's on one criterion. Negative means you're behind.
- **Parity** means the average gap is 0 or better and no criterion is more than half a point behind.

## Files and helper

State lives in `.hillclimb/<slug>/` in the project. Add `.hillclimb/` to `.git/info/exclude`.

```
contract.md     what you agreed with the user
contract.json   criterion ids, check ids, judge families, target
history.tsv     one row per round, written by the helper
reference/      the reference's evidence, frozen after setup
rounds/NN/      evidence/, judges/, notes.md
report.md
```

The helper does the blinding and the math. Run it as `bun <this skill>/scripts/hc.ts <command> .hillclimb/<slug> ...`.

| Command | What it does |
|---|---|
| `pack NN` | Copies round NN's evidence and the control's into one folder per judge, as A and B in random order, and prints the paths. |
| `score NN [--targets a,b]` | Reads the judges' replies and prints the gaps, the findings you must verify, anything that looks off, and KEEP or REVERT. |
| `log NN keep\|revert "<what you tried>"` | Records the round. |
| `status` | Prints the best round, reverts in a row, what's unfinished, and the score table. Run it first when resuming. |

## 1. Contract

If there's a reference, capture its evidence into `reference/` first, so the rubric comes from what you can see. Then write `contract.md` and `contract.json` from `references/contract-template.md` and get one yes from the user. It's the only planned check-in.

- **Brief and scope.** What it is, who uses it, what may change, what's off-limits.
- **Evidence.** The files judges will look at. Use the same file names on both sides every round, with no subfolders. See "Adapting to the task".
- **Gates.** Commands that must pass before any judging, such as typecheck, lint, and tests. Anything a script can check goes here, not in the rubric.
- **Rubric.** Three to six criteria. Each has yes/no checks and a description of a 9, a 7, and a 5. Start from what the user asked to match and from what makes the reference good. Mark the checks behind "must work" as required. Leave product names out, because judges read it.
- **Panel.** At least three judges from two model families, one of them outside your own. `references/panel-claude-code.md` and `references/panel-codex.md` list the defaults and how to call them.
- **Stop.** Parity or target, round cap, time budget.

Work on a branch named `hillclimb/<slug>`, starting from a clean git tree. Ask the user if the tree isn't clean. Without git, see `references/extras.md`.

## 2. Round 0

1. If the work doesn't exist yet, build a first version, get it through the gates, and commit it.
2. Capture its evidence into `rounds/00/evidence/`.
3. Run `pack 00`. Send each judge `references/judge-prompt.md` filled in with its own paths, and save each reply to `rounds/00/judges/<id>.md`. Run `score 00`.
4. Check the rubric before spending rounds on it. Look for these in what `score` prints.
   - A judge couldn't open some evidence. Fix how you send it and rerun that judge.
   - Judges split by more than 3 points on a criterion. The criterion is vague, so tighten its checks.
   - The reference scores below 7 on a criterion. Either the criterion measures the wrong thing or the reference is weak there.
   - A judge doubts the rubric, for example a check that bad work could pass.
5. If the rubric needs fixing, fix it, delete `rounds/00/judges/`, and repeat step 3.
6. Run `log 00 keep "baseline"`. If `score 00` already printed `parity: yes`, skip to the audit.

With no reference, round 0 has nothing to compare with. Do steps 1 and 2, then log. Aim round 1 at the criterion you think is weakest, and do the step 4 checks on round 1's replies.

## 3. Rounds

1. **Plan.** Start from the confirmed findings on the best version, in its `notes.md`. Failed required checks come first, then the weakest criteria. Pick one to three findings that share a cause. Drop any that are wrong or outside the brief, and say why in this round's `notes.md`.
2. **Build.** Make the change. Leave `.hillclimb/`, the gates, and off-limits areas alone.
3. **Gate.** Run the gates and fix until they pass, then commit the round as one commit. After three failed tries, set the change aside with `git stash -u`, run `log NN revert "<what you tried>"`, and start the next round.
4. **Judge.** Capture evidence into `rounds/NN/evidence/` and run `pack NN`. Call all judges in parallel, save their replies, and run `score NN --targets <the criteria you aimed at>`. If a reply is missing or invalid, rerun that judge once.
5. **Verify.** Open the evidence for every finding `score` lists and confirm or reject it yourself. Write the verdicts in `notes.md`, along with the model each judge actually ran on.
6. **Decide.** Keep the round if `score` says KEEP and you confirmed no blocker and no new required-check failure. Run `log NN keep|revert "<what you tried>"`. After reverting a committed round, run `git revert --no-edit HEAD` so the working tree is the best version again.

KEEP means each criterion you aimed at gained at least half a point against the control, no criterion lost more than that, the average gap didn't fall, and two judges from two families scored every criterion.

## 4. Stop

End with one of these statuses.

- `TARGET_MET`. `score` prints `parity: yes`, and the target as met if one is set. Gates pass and no confirmed blocker remains.
- `PLATEAU`. Three reverts in a row. After the second, look at what's left before trying again. If the remaining gaps come from the rubric, the scope, or noise, and not from the work, stop early.
- `BUDGET_LIMIT`. The round cap or the time budget ran out. Stop while there's still time for the audit.
- `VERIFICATION_BLOCKED`. Fewer than two judge families can run, or you can't capture evidence.

## 5. Audit and report

1. Run `pack audit`. It makes two packets of the best version, in opposite orders, against the reference. With no reference, it uses the round 0 baseline. Send each packet to the auditor, a model that wasn't on the panel, in separate fresh calls. Save the replies as `rounds/audit/judges/AUD1.md` and `AUD2.md`, then run `score audit`. A verdict that flips with the order is unresolved, not a win.
2. Write `report.md`. Lead with the status. Add the table from `status`, the audit verdicts, required-check results, the models that ran, the feedback you rejected and why, the gaps that remain, and the final evidence beside the reference's.
3. Say plainly whether it got there. "Average gap -0.6, empty states still lose" is a useful result. The panel's verdict is evidence, and the user decides.

## Adapting to the task

Only the evidence and the gates change with the kind of work.

| Improving | Evidence judges see | Typical gates | A reference could be |
|---|---|---|---|
| UI | Screenshots of each state. Read `references/ui.md` | typecheck, lint, tests | a competitor's screens |
| Copy or a landing page | The text, one file per page or section | length limits, banned words | a page the user admires |
| Docs | The pages, plus output from running their examples | links resolve, examples run | the best docs in the field |
| Code or API design | The source or spec, plus a usage example | tests, typecheck | a library with the API you want |
| CLI | Terminal output captured per command | tests | another tool's output |

For anything else, ask what a person would look at to compare two versions. That's the evidence.

`references/extras.md` covers the unusual cases: close calls, noisy scores, held-out evidence, changing the rubric mid-run, working without git, and resuming.
