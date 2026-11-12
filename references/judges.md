# Calling judges

A judge is any model that can read a folder. `prep` prints one prompt file per judge, and the whole instruction to a judge is one line: "Read `<prompt file>` and do what it says."

Run each judge as a subagent or delegated task on another model, picking the model explicitly. If your harness can't do that, run another agent's command line headless and read-only from the judge's folder, with the prompt on standard input, because flags that take lists swallow a prompt given as an argument.

- Let long judges run in the background.
- Ignore what a judge says when it hands back. A and B differ from judge to judge, so only `score` knows which is which.
- A judge that can't write files returns its reply as its answer. Save that text to `<dir>/rounds/NN/judges/<judge id>.md`.
- In the contract, give each judge its model family only, such as `anthropic` or `openai`. The reply's `model` field shows which model answered. If it isn't the one you asked for, say so in the report.
- If a judge reports that it couldn't open a file, such as an image, fix how you send it and run that judge again.
- When a judge fails, run it again once, through another provider of the same model if there is one. Don't quietly replace it with a weaker model.
- With only one model family in reach, the panel shares its blind spots. Tell the user, go on only if they accept that, and set `"single_family": true` in the contract.
