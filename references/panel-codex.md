# Calling judges from Codex

The builder is GPT, so the panel needs at least one judge outside the OpenAI family. Each judge runs as its own CLI process, which gives it a fresh context. Run each one from its packet folder so it can't see the repo. Pass the prompt on stdin, because `claude --allowedTools` and `codex exec -i` both take lists and would swallow a prompt placed after them.

| Id | Model | Family | Command |
|---|---|---|---|
| J1 | fable-5.1 | anthropic | `claude -p --model claude-fable-5-1` |
| J2 | gpt-6-astra | openai | `codex exec -m gpt-6-astra` |
| J3 | gpt-6.1-sol | openai | `codex exec -m gpt-6.1-sol -c model_reasoning_effort="high"` |

The auditor is opus-5.5 via `claude -p --model claude-opus-5-5`. It isn't on the panel and isn't the builder's family, so set `auditorFamily: "anthropic"`.

Write each judge's filled-in prompt to `rounds/NN/prompts/<id>.md`. Then launch all judges in the background and poll. A judge can take several minutes.

```bash
R="$(pwd)/.hillclimb/<slug>/rounds/NN"            # absolute path
P="$(bun -e "console.log(require('$R/mapping.json').packetRoot)")"
mkdir -p "$R/judges"

# J1, Claude. The auditor uses the same command with --model claude-opus-5-5.
( cd "$P/J1" && nohup claude -p --model claude-fable-5-1 --allowedTools "Read,Glob" \
    < "$R/prompts/J1.md" > "$R/judges/J1.md" 2> "$R/judges/J1.log" & )

# J2, Codex. J3 is the same with J3 paths and -m gpt-6.1-sol -c model_reasoning_effort="high".
# Drop the -i line for text artifacts. The judge reads files from its working directory.
nohup codex exec -m gpt-6-astra -s read-only --skip-git-repo-check -C "$P/J2" \
  -c service_tier="default" -o "$R/judges/J2.md" \
  -i "$P"/J2/A/* "$P"/J2/B/* \
  < "$R/prompts/J2.md" > "$R/judges/J2.log" 2>&1 &

# Wait for all of them (20s polls, up to 15 minutes).
for i in $(seq 1 45); do
  [ -s "$R/judges/J1.md" ] && [ -s "$R/judges/J2.md" ] && [ -s "$R/judges/J3.md" ] && break
  sleep 20
done
```

If a judge's output stays empty, read its `.log`. A `claude` that isn't logged in leaves only the OpenAI family. With one family left, the run stops with `VERIFICATION_BLOCKED`.

In T3 Code, `delegate_task` can call these models too, instead of the CLIs.
