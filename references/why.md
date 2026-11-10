# Why each rule exists

Read this before relaxing a rule. The numbers come from the linked papers and posts, as read in November 2026.

**Judges see A and B in random order, and the audit runs both orders.** GPT-4 gave the same verdict after swapping the order on only 65% of close pairs ([Zheng 2023](https://arxiv.org/abs/2306.05685)).

**Judges never see history, scores, or "I fixed X".** Judges that saw the revision history gave rising scores while human-rated quality fell, and fresh judges tracked humans better ([Pan 2024](https://arxiv.org/abs/2407.04549)). Persuasive claims raised the scores of wrong answers by up to 8% ([Hwang 2025](https://arxiv.org/abs/2508.07805)). In Theo's T3 Code UI experiment, a UI rated 9 got 7.4 from a fresh judge, and unchanged competitor screenshots drifted into the 9s ([transcript](https://www.usetranscribe.io/yt/xq0eB8vxeqk/agents-ui-improvement)).

**The panel spans model families.** A three-family panel agreed with humans more often than GPT-4 alone, kappa .763 against .627, at about a seventh of the cost ([Verga 2024](https://arxiv.org/abs/2404.18796)). Models favor their own output ([Panickssery 2024](https://arxiv.org/abs/2404.13076)).

**No judging your own work, even as a fallback.** Self-preference is the bias the panel exists to avoid. [Rulph](https://github.com/team-attention/hoyeon/blob/main/skills/rulph/SKILL.md) falls back to self-evaluation when its judges fail. This skill stops with `VERIFICATION_BLOCKED`.

**You verify serious findings yourself.** In one nine-model review, eight models agreed on an issue that wasn't real ([Titration thread](https://www.reddit.com/r/claudeskills/comments/1wsf42j/claude_code_iterates_on_my_prompts_until_they/)). A three-family panel accepted 55% of errors once it was being optimized against ([Zhou 2026](https://arxiv.org/abs/2607.05904)).

**The reference is scored every round, and rounds are kept on the gap.** The reference is a built-in check on drifting judges, as in Theo's experiment above. Each judge's gap between the two sides cancels drift that hits both. This part is an engineering inference, not a tested result.

**The best version is kept and regressions are reverted.** Self-correction without outside feedback took GPT-4 from 95.5% to 89.0% on GSM8K ([Huang 2023](https://arxiv.org/abs/2310.01798)). One 2026 setup gained 25.5 points while breaking 19.1% of answers that started out correct ([Zhang 2026](https://arxiv.org/abs/2609.35832)). In Jetty's pelican runs, self-scores rose 2.2 points while 9 of 15 runs ended worse by an outside judge ([Jetty](https://evaljetty.com/pelicans/investigations/hill-climbing.html)).

**Gates run before judges.** Critique grounded in tools beat critique without them by a wide margin ([CRITIC](https://arxiv.org/abs/2305.11738)).

**Yes/no checks sit under every score.** Checklists raised agreement between evaluators ([CheckEval](https://arxiv.org/abs/2403.18771), [TICK](https://arxiv.org/abs/2410.03608)). A 1 to 10 scale tracked humans better than 1 to 5 or 1 to 100 on SummEval ([Stureborg 2024](https://arxiv.org/abs/2405.01724)).

**"If you can name an improvement, it's an 8 or lower."** Scores bunch at 8 to 9 otherwise. The line comes from [critic-loop](https://github.com/localhugdealer/critic-loop/blob/main/skills/critic-loop/SKILL.md).

**Required checks, and a minimum per criterion.** An average hides a weak spot. Scores of 10, 10, and 7 average 9.

**Judges critique the rubric.** "A passing grade on a weak assertion is worse than useless" ([Anthropic's skill-creator grader](https://github.com/anthropics/skills/blob/main/skills/skill-creator/agents/grader.md)).

**The rubric is frozen.** Criteria shift once people see real output ([Shankar 2024](https://arxiv.org/abs/2404.12272)), so changes have to be deliberate and re-baselined. Karpathy's [autoresearch](https://github.com/karpathy/autoresearch/blob/master/program.md) keeps the evaluator off-limits to the agent for the same reason.

**No re-judging to fish for a score.** Sampling judges until one says yes selects for noise.

**Plateau and round cap.** A proxy score keeps rising after real quality peaks ([Gao 2022](https://arxiv.org/abs/2210.10760)). critic-loop's author reports UI runs that go from about 6 to 8 and often stall short of 9.

**The auditor stays out of the loop.** Any judge whose feedback picks revisions becomes part of what's being optimized ([Gao 2022](https://arxiv.org/abs/2210.10760)). Held-out evidence works the same way.

**Several screenshots for UI.** Judges agreed with humans 91% of the time with multiple screenshots, against 79% with code alone ([ArtifactsBench](https://arxiv.org/abs/2507.04952)). Screenshots still don't prove interactions work ([FlowEval](https://arxiv.org/abs/2605.04165)).

**Rubric wording steers taste.** "Museum quality" pushed Anthropic's generated designs toward one look ([Anthropic, harness design](https://www.anthropic.com/research/harness-design-long-running-apps)).

No study validates a particular target score, panel size, or round count. The defaults are starting points.
