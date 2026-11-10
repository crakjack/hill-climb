# Calling judges from Codex

You're a GPT model, so at least one judge has to come from another family. Each judge runs as its own CLI process, started in its packet folder so it can't see the repo.

| Id | Model | Family | Command |
|---|---|---|---|
| J1 | fable-5.1 | anthropic | `claude -p --model claude-fable-5-1` |
| J2 | gpt-6-astra | openai | `codex exec -m gpt-6-astra` |
| J3 | gpt-6.1-sol | openai | `codex exec -m gpt-6.1-sol` |

The auditor is opus-5.5, with `claude -p --model claude-opus-5-5`.

Write each judge's filled-in prompt to `rounds/NN/prompts/<id>.md`, start all judges in the background, and wait for the reply files. A judge can take several minutes.

```bash
R="$(pwd)/.hillclimb/<slug>/rounds/NN"
P="$(bun -e "console.log(require('$R/mapping.json').packetRoot)")"
mkdir -p "$R/judges"

# A Claude judge. The auditor is the same command with --model claude-opus-5-5.
( cd "$P/J1" && nohup claude -p --model claude-fable-5-1 --allowedTools "Read,Glob" \
    < "$R/prompts/J1.md" > "$R/judges/J1.md" 2> "$R/judges/J1.log" & )

# A GPT judge. For J3, swap in J3's paths and -m gpt-6.1-sol.
# The -i line attaches images. Drop it when the evidence is text.
nohup codex exec -m gpt-6-astra -s read-only --skip-git-repo-check -C "$P/J2" \
  -c service_tier="default" -c model_reasoning_effort="high" -o "$R/judges/J2.md" \
  -i "$P"/J2/A/* "$P"/J2/B/* \
  < "$R/prompts/J2.md" > "$R/judges/J2.log" 2>&1 &

# Wait up to 15 minutes.
for i in $(seq 1 45); do
  [ -s "$R/judges/J1.md" ] && [ -s "$R/judges/J2.md" ] && [ -s "$R/judges/J3.md" ] && break
  sleep 20
done
```

The prompt goes in on stdin because `--allowedTools` and `-i` both take lists, and a prompt placed after them gets read as part of the list.

If a reply file stays empty, read the `.log` beside it. If `claude` isn't logged in, only one family is left, and the run stops with `VERIFICATION_BLOCKED`.

To use other models, change the table and the `judges` map in `contract.json`. Keep three judges, two families, and one family that isn't yours.
