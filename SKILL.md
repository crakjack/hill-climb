---
name: hill-climb
description: Improve anything in rounds until it is good enough. Works for UI, code, copy, docs, ideas, or a number a script measures. Each round is compared blind with the best version so far, by a measurement or by judges from other model families, and only real improvements are kept. Use when the user says hill climb, "iterate until 9/10", "get this to the level of <competitor>", "judge and improve until", or invokes /hill-climb.
---

# Hill climb

Improve one thing in rounds. Each round you change the work, something other than you says whether it got better, and you keep the change only if it did. That something is a measurement wherever a command can produce the number, and a panel of other models wherever it takes judgment.

## Start

One line from the user is enough.

1. **Look first.** Read the project, run it, and open any reference they named. Learn what it is, how to test it, and where it's weak. If the score will come from a data file, split that file before you read its rows.
2. **Propose the plan in one message of about 150 words.** Lead with anything you found that changes it. Say what you'll improve and leave alone, how it's scored, what must keep working, which models judge, and when you'll stop. By default that's a 9, eight rounds after the baseline, or an hour. Promise only scores your evidence can show. Leave out file paths and score arithmetic. If the target or their limits look out of reach, say so. End with at most two questions, each with the answer you'll assume, so that "yes" is a complete reply.
3. **Start on their yes.** If they said to go ahead without them, start on your defaults and list what you assumed in the report.

A narrow goal climbs faster than a broad one. Asked to "improve the app", propose the part that matters most and offer the rest as later runs. The user may change the plan at any time. Update the contract and carry on.

## The contract

Save the plan as `.hillclimb/<slug>/contract.json`, starting from `references/contract.example.json`. Keep `.hillclimb/` out of git, and leave out the parts a run doesn't need.

- **Measures** are commands that print a number. If a command can score something, measure it and keep judges for what it can't see. Climb on one part of the data and mark the measure for the other part `final`, so it runs only in the report.
- **Gates** are commands that must pass before anything is judged, such as tests. You may always add one. When you find a real problem that nothing catches, add a test for it, then fix it.
- **Criteria** are the few qualities that take judgment. Say what each means for this work and what a 9, a 7 and a 5 look like. Split qualities that trade off. If the work could score better by losing something, add a criterion for what has to stay.
- **Must** lists outcomes that can't break and that a judge can confirm from the evidence.
- **Evidence** is what judges look at each round: files from the project, or what `capture` produces, such as screenshots or the output of a run. Include any source the work has to agree with, such as a fact sheet. Judges can rate only what the evidence shows. A screenshot can't show that a number is right or that a button works. Measure those, give judges real inputs and outputs, or leave them out. Keep it small enough to read in full.
- **Reference** is the bar, if the user named one. Put its material in `reference/`. A 9 then also means "at least level with the bar".
- **Judges** are the strongest models you can reach, from at least two model families, one of them not your own. Follow the user's model preferences. `references/judges.md` shows ways to call them.

When the work is ideas, such as names, judge a shortlist as a whole. Each round, keep the strongest and replace the rest.

## Rounds

In a git project, work on a branch and commit before each `prep`. Below, `hc` means `bun <this skill>/scripts/hc.ts`, run from the project root, and `<dir>` is `.hillclimb/<slug>`.

Round 00 is the starting point. If nothing exists yet, build a first version. Then, every round:

1. **Change the work.** After round 00, aim at the biggest problem you confirmed in the last scoring. Fix problems that share a cause together.
2. **`hc prep <dir> NN`** runs the gates and measures, collects the evidence, and writes one prompt file per judge. If a gate fails, fix the work.
3. **Call the judges**, all at once. Skip this when nothing is judged.
4. **`hc score <dir> NN`** prints the scores, the findings and a verdict.
5. **Check the findings** against the evidence yourself. Panels agree on problems that aren't there. Drop those and note why.
6. **`hc log <dir> NN keep|revert "<what you tried>"`**. Follow the verdict unless your own check says otherwise, and put the reason in the note. After a revert, return the work to the best version.

The verdict keeps a round when more judges, from more than one family, would ship it than the best version so far, and no measure, must or quality got clearly worse. A tie is yours to call.

Round 00 also tests the rubric. If a doubt from the judges would change scores, such as a criterion they read two ways or evidence they couldn't use, fix it and judge round 00 again.

## Rules

Each one blocks a known way that judge loops lie.

1. Never score your own work or play a judge. Self-scores climb on their own.
2. Each judge gets a fresh context and its prompt file, nothing more. History, earlier scores, the target, and knowing which version is new all bend scores.
3. Put nothing in the work that speaks to judges.
4. Don't bend the ruler. Change the criteria, gates or measures only when the user asks or when they measure the wrong thing, never to pass a round. Scores from before a change don't compare with scores after it.
5. A score isn't proof that it works. Before you call it done, use the result once the way the user will: run it on real data, or read it as its audience would. Demo data hides problems.

## Stop and report

Stop when the target is met, after three reverts in a row, when the rounds or the time run out, or when the evidence can't show the work. A limit from the user replaces the matching default.

Then run `hc report <dir>`. It runs the `final` measures and writes `report.html` with the score table and the evidence, before and after. Tell the user:

- the outcome first, in one line
- the table, and what changed in the rounds you kept
- which findings you rejected, and why
- what the evidence didn't cover, such as devices, real data, or flows you didn't capture
- which models judged

`hc status <dir>` shows where a run stands. Run it first when you pick a run back up.
