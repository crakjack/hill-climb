# Calling judges from Claude Code

You're a Claude model, so at least one judge has to come from another family. Give each judge its filled-in prompt and nothing else. A judge should be able to read only its own packet folder.

| Id | Model | Family | How to call it |
|---|---|---|---|
| J1 | fable-5.1 | anthropic | `Agent` with `model: "fable"`, a new agent every round. Tell it to open the listed files with Read and look nowhere else. |
| J2 | gpt-6-astra | openai | The `codex exec` command in `panel-codex.md`. Hand it to a `codex-runner` agent if one is set up. Otherwise run it through Bash in the background. In T3 Code, `delegate_task` on the Codex provider also works. |
| J3 | gpt-6.1-sol | openai | The same, with `-m gpt-6.1-sol`. |

The auditor is opus-5.5, through `Agent` with `model: "opus"`. It shares your family, so say so in the report. If a third family such as Gemini is reachable, use that as the auditor.

No Codex CLI? Then you have one family and can't run this loop honestly. Stop with `VERIFICATION_BLOCKED` and tell the user what's missing.

To use other models, change this table and the `judges` map in `contract.json`. Keep three judges, two families, and one family that isn't yours.
