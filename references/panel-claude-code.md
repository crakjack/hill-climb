# Calling judges from Claude Code

The builder is Claude, so the panel needs at least one judge outside the Anthropic family. Give every judge the absolute A and B paths and the file list that `pack` printed.

| Id | Model | Family | How to call |
|---|---|---|---|
| J1 | fable-5.1 | anthropic | `Agent` with `model: "fable"`, a fresh agent every round. Tell it to open every listed file with Read and to look nowhere else. |
| J2 | gpt-6-astra | openai | In T3 Code, `delegate_task` on the Codex provider with model gpt-6-astra. Call `orchestrator_capabilities` once first. Outside T3 Code, use opus-5.5 through `Agent` with `model: "opus"` and set J2's family to `anthropic` in `contract.json`. |
| J3 | gpt-6.1-sol | openai | A `codex-runner` subagent with `-m gpt-6.1-sol`, `-s read-only`, `-C <packetRoot>/J3`, `--skip-git-repo-check`, and effort `high`. For images, add `-i` followed by every image path. Tell the runner to put `-i` last and pass the prompt on stdin, because `-i` takes a list and would swallow a prompt placed after it. Without a `codex-runner` agent, run the `codex exec` command from `panel-codex.md` through Bash in the background and poll for its output file. |

The auditor is Gemini Pro through `delegate_task` if `orchestrator_capabilities` lists it (`auditorFamily: "google"`). Otherwise use opus-5.5 through `Agent` with `model: "opus"`, and say in the report that it shares the builder's family. If opus-5.5 is already J2, no held-out model is left. Use J3 as the auditor and say in the report that it took part in the loop.
