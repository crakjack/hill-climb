#!/usr/bin/env bun
// Hill-climb helper. Run it from the project root.
//
//   bun hc.ts prep   <dir> <round>    run gates and measures, collect evidence, write one prompt per judge
//   bun hc.ts score  <dir> <round>    read the judges' replies and the measures, print the verdict
//   bun hc.ts log    <dir> <round> keep|revert "<what you tried>"
//   bun hc.ts status <dir>            where the run stands, with the score table
//   bun hc.ts report <dir>            run the held-back measures and write report.html, before and after
//
// <dir> is .hillclimb/<slug> and holds contract.json (see references/contract.example.json).
// Each round is compared with the best version so far. Round 00 has nothing to be compared
// with, so judges score it on its own.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";

type Side = "A" | "B";
type Role = "new" | "best";
type Measure = {
  id: string;
  cmd: string; // prints the number on its last line, or use "pattern"
  better: "higher" | "lower";
  target?: number;
  slack?: number; // how much worse still counts as unchanged, for noisy numbers
  pattern?: string; // regex with one group, when the number isn't on the last line
  final?: boolean; // a held-back check: never run during rounds, only by `report`
};
type Contract = {
  goal: string; // what judges are told the work is for, with any limits they need to know
  reference?: string | null; // what the bar is, in words. Its files go in <dir>/reference/
  criteria?: { id: string; means: string; levels?: string }[]; // qualities judges score from 1 to 10
  must?: string[]; // outcomes judges confirm from the evidence, yes or no
  gates?: string[]; // commands that must exit 0 before anything is judged
  measures?: Measure[];
  evidence?: string[]; // files or folders copied into each round's evidence
  capture?: string; // command that writes more evidence into $HC_EVIDENCE
  judges?: Record<string, string>; // judge id -> model family, such as "anthropic" or "openai"
  single_family?: boolean; // true only when the user accepted a panel from one model family
  target?: number;
  floor?: number; // lowest any one criterion may score (default target - 1)
  rounds?: number;
  minutes?: number;
};
type Mapping = { root: string; basis: string; judges: Record<string, Partial<Record<Side, Role>>> };
type Issue = { severity?: string; where?: string; problem?: string };
type Reply = {
  scores?: Record<string, Partial<Record<Side, unknown>>>;
  better?: string;
  must?: Partial<Record<Side, unknown[]>>;
  issues?: Partial<Record<Side, Issue[]>>;
  rubric?: unknown[];
};
type Verdict = "BASELINE" | "KEEP" | "REVERT" | "TIE" | "INCOMPLETE";
type Scores = {
  criteria: Record<string, { new: number | null; best: number | null; gap: number | null }>;
  mean: number | null;
  votes: Record<Role | "tie", number>;
  measures: Record<string, number>;
  verdict: Verdict;
  targetMet: boolean;
};
const COLS = ["round", "time", "sha", "decision", "score", "measures", "rubric", "note"] as const;
type Row = Record<(typeof COLS)[number], string>;

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

const USAGE = "usage: bun hc.ts <prep|score|log|status|report> <dir> [round] ...";
const [cmd, dirArg, round, ...rest] = process.argv.slice(2);
if (!cmd || !dirArg) die(USAGE);
const dir: string = dirArg;
const contractFile = join(dir, "contract.json");
if (!existsSync(contractFile)) die(`no contract.json in ${dir}. Copy references/contract.example.json and fill it in.`);

const readJson = <T,>(p: string): T => JSON.parse(readFileSync(p, "utf8")) as T;
const c = readJson<Contract>(contractFile);
// A run started with the previous version of this skill keeps the helper it began with.
const old = c as Record<string, unknown>;
if (!c.goal && (old.checks !== undefined || typeof old.reference === "boolean")) {
  const legacy = join(import.meta.dir, "..", "legacy", "scripts", "hc.ts");
  if (!existsSync(legacy)) die("this run was started with an earlier version of the skill. Finish it with that version, or start a new run.");
  if (cmd === "prep" || cmd === "report") die(`this run was started with the previous version of the skill. Keep using its commands (pack, score, log, status). Its instructions are in ${resolve(legacy, "..", "..")}.`);
  process.exit(spawnSync("bun", [legacy, ...process.argv.slice(2)], { stdio: "inherit" }).status ?? 1);
}
const criteria = c.criteria ?? [];
const measures = c.measures ?? [];
const judges = c.judges ?? {};
// "anthropic:claude-x" and "Anthropic" are the same family.
const family = (j: string) => (judges[j] ?? "").toLowerCase().split(/[^a-z0-9]/)[0] ?? "";
const needFamilies = c.single_family ? 1 : 2;
if (!c.goal) die('contract.json needs a "goal"');
if (!criteria.length && !measures.some((m) => !m.final)) die('contract.json needs "criteria" (judged), "measures" (commands that print a number), or both');
if (criteria.length && (Object.keys(judges).length < 2 || new Set(Object.keys(judges).map(family)).size < needFamilies))
  die('judged criteria need at least two "judges" from two model families. If the user accepted one family, set "single_family": true.');

const rdir = (r: string) => join(dir, "rounds", r);
const scoresFile = (r: string) => join(rdir(r), "scores.json");
const walk = (d: string, base = d): string[] =>
  !existsSync(d)
    ? []
    : readdirSync(d)
        .filter((f) => !f.startsWith("."))
        .sort()
        .flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f), base) : [relative(base, join(d, f))]));
const digest = (d: string) => {
  const h = createHash("sha1");
  for (const f of walk(d)) h.update(f).update(readFileSync(join(d, f)));
  return h.digest("hex");
};
const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? (s[m] ?? null) : ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2;
};
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const fmt = (n: number | null | undefined, signed = false) => (n == null ? "-" : `${signed && n > 0 ? "+" : ""}${Number(n.toFixed(2))}`);
const sh = (command: string, env: Record<string, string> = {}) => {
  const r = spawnSync("bash", ["-o", "pipefail", "-c", command], { encoding: "utf8", env: { ...process.env, ...env }, maxBuffer: 1 << 26 });
  return { ok: r.status === 0, out: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() };
};
const tail = (s: string, n = 25) => s.split("\n").slice(-n).join("\n");
// Changes whenever what is being measured changes. Numbers from before and after don't compare.
const rubricId = createHash("sha1").update(JSON.stringify([criteria, c.must, c.gates, measures, c.reference])).digest("hex").slice(0, 6);

const histFile = join(dir, "history.tsv");
const history = (): Row[] =>
  existsSync(histFile)
    ? readFileSync(histFile, "utf8")
        .trim()
        .split("\n")
        .slice(1)
        .filter(Boolean)
        .map((line) => Object.fromEntries(COLS.map((k, i) => [k, line.split("\t")[i] ?? ""])) as Row)
    : [];
const best = () => history().findLast((r) => r.decision === "keep");
// Judges write their replies next to their packet. Bring them into the round folder.
const collect = (r: string, m: Mapping) => {
  mkdirSync(join(rdir(r), "judges"), { recursive: true });
  for (const j of Object.keys(m.judges)) if (existsSync(join(m.root, j, "reply.md"))) cpSync(join(m.root, j, "reply.md"), join(rdir(r), "judges", `${j}.md`));
};
const needRound = () => round ?? die(`${cmd} needs a round, for example: bun hc.ts ${cmd} ${dir} 00`);

function measure(which: Measure[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of which) {
    const res = sh(m.cmd);
    if (!res.ok) die(`measure "${m.id}" failed: ${m.cmd}\n${tail(res.out)}`);
    const hit = m.pattern ? res.out.match(new RegExp(m.pattern))?.[1] : res.out.split("\n").at(-1)?.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/i)?.[0];
    if (hit === undefined || Number.isNaN(Number(hit))) die(`measure "${m.id}": no number in the output of ${m.cmd}. Print it on the last line, or set "pattern" to a regex with one group.`);
    out[m.id] = Number(hit);
    console.log(`measure ${m.id}: ${out[m.id]}`);
  }
  return out;
}

function prompt(folder: string, sides: Partial<Record<Side, Role>>, files: string[], bar: string[]): string {
  const solo = !sides.B;
  const template = readFileSync(join(import.meta.dir, "..", "references", "judge-prompt.md"), "utf8").split(/^---$/m).slice(1).join("---").trim();
  const both = (x: string) => (solo ? `{ "A": ${x} }` : `{ "A": ${x}, "B": ${x} }`);
  const fill: Record<string, string> = {
    goal: c.goal,
    rubric: [
      ...criteria.map((x) => `### ${x.id}\n${x.means}${x.levels ? `\n${x.levels}` : ""}`),
      ...(c.must?.length ? [`### Must be true\n${c.must.map((m, i) => `${i + 1}. ${m}`).join("\n")}`] : []),
    ].join("\n\n"),
    folders: [
      solo ? `The work: ${join(folder, "A")}` : `A: ${join(folder, "A")}\nB: ${join(folder, "B")}`,
      `Files: ${files.join(", ")}`,
      ...(bar.length ? [`The bar: ${join(folder, "bar")} (${c.reference ?? "the standard this work is aiming for"}). Files: ${bar.join(", ")}`] : []),
    ].join("\n"),
    task: solo ? "Score the work on each criterion." : "A and B are two versions of the same work. Score both on each criterion, then say which one you would ship overall.",
    scale: `A 9 means an expert in this field would ship it as it is${bar.length ? " and it is at least level with the bar on that criterion" : ""}. A 10 means you can't name a change a user would notice.`,
    shape: [
      "{",
      `  "scores": { ${criteria.map((x) => `"${x.id}": ${both("7").replace(" }", ', "why": "one sentence" }')}`).join(",\n              ")} },`,
      ...(solo ? [] : ['  "better": "A" | "B" | "tie",']),
      ...(c.must?.length ? [`  "must": ${both(`[${c.must.map(() => '"yes" | "no" | "unknown"').join(", ")}]`)},`] : []),
      `  "issues": ${both('[{ "severity": "blocker" | "high" | "medium" | "low", "where": "file and place", "problem": "what is wrong and what it costs the user" }]')},`,
      '  "rubric": ["anything the rubric or the evidence gets wrong or cannot show"],',
      '  "model": "the model you are, if you know"',
      "}",
    ].join("\n"),
    reply: join(folder, "reply.md"),
  };
  return template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => fill[k] ?? "");
}

function prep(r: string) {
  mkdirSync(rdir(r), { recursive: true });
  const head = sh("git rev-parse --short HEAD");
  writeFileSync(join(rdir(r), "sha"), head.ok ? head.out : "-");
  for (const g of c.gates ?? []) {
    const res = sh(g);
    if (!res.ok) die(`gate failed: ${g}\n${tail(res.out)}\n\nFix the work, not the gate.`);
    console.log(`gate ok: ${g}`);
  }
  writeFileSync(join(rdir(r), "measures.json"), `${JSON.stringify(measure(measures.filter((m) => !m.final)), null, 2)}\n`);
  if (!criteria.length) return console.log(`nothing for judges here. Next: score ${r}`);

  // Evidence is collected again on every prep, so judges never see an older version of the work.
  const evidence = join(rdir(r), "evidence");
  if (c.evidence?.length || c.capture) {
    rmSync(evidence, { recursive: true, force: true });
    mkdirSync(evidence, { recursive: true });
    for (const p of c.evidence ?? []) {
      if (!existsSync(p)) die(`evidence not found: ${p}`);
      if (existsSync(join(evidence, basename(p)))) die(`two evidence entries are both named ${basename(p)}. Rename one, or collect them with "capture".`);
      cpSync(p, join(evidence, basename(p)), { recursive: true });
    }
    const res = c.capture ? sh(c.capture, { HC_EVIDENCE: resolve(evidence), HC_ROUND: r }) : null;
    if (res && !res.ok) die(`capture failed: ${c.capture}\n${tail(res.out)}`);
  }
  const files = walk(evidence);
  if (!files.length) die(`no evidence. List files under "evidence" in contract.json, set "capture", or put files in ${evidence}.`);

  const kept = best();
  const bestDir = kept && kept.round !== r ? join(rdir(kept.round), "evidence") : null;
  if (bestDir && digest(bestDir) === digest(evidence))
    die(`round ${r}'s evidence is identical to round ${kept?.round}'s, so judges would have nothing to compare. Collect evidence that shows what you changed.`);

  const mapFile = join(rdir(r), "mapping.json");
  let old = existsSync(mapFile) ? readJson<Mapping>(mapFile) : null;
  const replies = join(rdir(r), "judges");
  if (old) collect(r, old);
  const bar = walk(join(dir, "reference"));
  // Everything a judge was shown. If any of it changes, earlier replies no longer apply.
  const basis = [digest(evidence), bestDir ? digest(bestDir) : "", digest(join(dir, "reference")), rubricId, c.goal].join("|");
  if (old && old.basis !== basis) {
    if (walk(replies).length) {
      renameSync(replies, `${replies}-stale-${Date.now()}`);
      console.log("the evidence or the rubric changed since judges last saw this round, so their replies were set aside. Call them again.");
    }
    old = null;
  }
  // A neutral location, so paths say nothing about the project, the round, or which side is new.
  const root = mkdtempSync(join(tmpdir(), "hc-"));
  const mapping: Mapping = { root, basis, judges: {} };
  const flip = Math.random() < 0.5 ? 0 : 1;
  Object.keys(judges).forEach((j, i) => {
    // Orders alternate across judges. Running prep again keeps each judge's order, so saved replies still score.
    const sides: Partial<Record<Side, Role>> = old?.judges[j] ?? (!bestDir ? { A: "new" } : (i + flip) % 2 ? { A: "best", B: "new" } : { A: "new", B: "best" });
    mapping.judges[j] = sides;
    const folder = join(root, j);
    for (const s of ["A", "B"] as const) {
      const from = sides[s] === "new" ? evidence : sides[s] === "best" ? bestDir : null;
      if (from) cpSync(from, join(folder, s), { recursive: true });
    }
    if (bar.length) cpSync(join(dir, "reference"), join(folder, "bar"), { recursive: true });
    writeFileSync(join(folder, "prompt.md"), prompt(folder, sides, walk(join(folder, "A")), bar));
    console.log(`${j} (${family(j)}): ${join(folder, "prompt.md")}`);
  });
  writeFileSync(mapFile, `${JSON.stringify(mapping, null, 2)}\n`);
  console.log(`\nGive each judge its prompt file and nothing else, each in a fresh context, all at once. Then: score ${r}`);
}

function score(r: string): Scores {
  const kept = best();
  const solo = !kept || kept.round === r;
  const mapping = criteria.length ? readJson<Mapping>(join(rdir(r), "mapping.json")) : { root: "", basis: "", judges: {} };
  const rows: Record<string, { j: string; new: number; best: number | null }[]> = {};
  const votes: Scores["votes"] = { new: 0, best: 0, tie: 0 };
  const forNew = new Set<string>(); // model families with a judge who would ship the new version
  const findings: string[] = [];
  const onBest: string[] = [];
  const doubts: string[] = [];
  const problems: string[] = [];
  const mustYes: number[] = [];
  const mustYesBest: number[] = [];
  let replied = 0;
  collect(r, mapping);

  for (const [j, sides] of Object.entries(mapping.judges)) {
    const saved = join(rdir(r), "judges", `${j}.md`);
    if (!existsSync(saved)) {
      problems.push(`${j}: no reply yet (expected at ${join(mapping.root, j, "reply.md")})`);
      continue;
    }
    let v: Reply;
    try {
      const text = readFileSync(saved, "utf8");
      v = JSON.parse([...text.matchAll(/```json\s*\n([\s\S]*?)```/g)].at(-1)?.[1] ?? text) as Reply;
    } catch {
      problems.push(`${j}: reply has no valid JSON block. Rerun this judge once.`);
      continue;
    }
    replied++;
    const sideOf = (role: Role) => (["A", "B"] as const).find((s) => sides[s] === role);
    const num = (id: string, role: Role): number | null => {
      const s = sideOf(role);
      const x = s ? v.scores?.[id]?.[s] : undefined;
      if (typeof x === "number" && x >= 1 && x <= 10) return x;
      if (x != null) problems.push(`${j}: bad score for ${id}: ${JSON.stringify(x)}`);
      return null;
    };
    // A judge may leave out a score the evidence can't support. Its other answers still count.
    for (const x of criteria) {
      const mine = { j, new: num(x.id, "new"), best: num(x.id, "best") };
      if (mine.new !== null && (solo || mine.best !== null)) (rows[x.id] ??= []).push({ ...mine, new: mine.new });
    }
    if (!solo) {
      const pick = v.better === "A" || v.better === "B" ? sides[v.better] : v.better === "tie" ? "tie" : undefined;
      if (pick === "new") forNew.add(family(j));
      if (pick) votes[pick]++;
      else problems.push(`${j}: no overall "better"`);
    }
    const from = <T,>(role: Role, by?: Partial<Record<Side, T[]>>): T[] => {
      const s = sideOf(role);
      return (s ? by?.[s] : undefined) ?? [];
    };
    (c.must ?? []).forEach((text, i) => {
      const a = from("new", v.must)[i];
      if (from("best", v.must)[i] === "yes") mustYesBest[i] = (mustYesBest[i] ?? 0) + 1;
      if (a === "yes") mustYes[i] = (mustYes[i] ?? 0) + 1;
      else findings.push(`[must] ${j} ${a === "no" ? "says no" : "can't tell from the evidence"}${a === "no" && from("best", v.must)[i] === "no" ? " (also no for the best version)" : ""}: ${text}`);
    });
    const list = (role: Role) => from(role, v.issues).filter((x) => x.severity !== "low").map((x) => `[${x.severity}] ${j}: ${x.problem ?? ""} (${x.where ?? "place not given"})`);
    findings.push(...list("new"));
    onBest.push(...list("best"));
    for (const d of v.rubric ?? []) doubts.push(`${j}: ${typeof d === "string" ? d : JSON.stringify(d)}`);
  }

  const out: Scores = { criteria: {}, mean: null, votes, measures: {}, verdict: "INCOMPLETE", targetMet: false };
  const thin: string[] = []; // criteria without two judges from enough families
  for (const x of criteria) {
    const got = rows[x.id] ?? [];
    if (got.length < 2 || new Set(got.map((g) => family(g.j))).size < needFamilies) thin.push(x.id);
    for (const role of ["new", "best"] as const) {
      const xs = got.flatMap((g) => (g[role] === null ? [] : [g[role]]));
      if (xs.length && Math.max(...xs) - Math.min(...xs) > 3) problems.push(`${x.id}: judges split on ${role === "new" ? "this round" : "the best version"} (${xs.join(", ")}). The criterion may be vague.`);
    }
    out.criteria[x.id] = {
      new: median(got.map((g) => g.new)),
      best: median(got.flatMap((g) => (g.best === null ? [] : [g.best]))),
      gap: median(got.flatMap((g) => (g.best === null ? [] : [g.new - g.best]))), // each judge's own new-minus-best, so one harsh judge doesn't distort it
    };
  }
  const medians = criteria.map((x) => out.criteria[x.id]?.new ?? null);
  if (criteria.length && medians.every((m): m is number => m !== null)) out.mean = mean(medians);

  const measureFile = join(rdir(r), "measures.json");
  if (measures.length) out.measures = existsSync(measureFile) ? readJson<Record<string, number>>(measureFile) : die(`no measures for round ${r}. Run: prep ${r}`);
  const sameRuler = solo || kept?.rubric === rubricId;
  const prevFile = !solo && sameRuler && kept ? join(rdir(kept.round), "measures.json") : null;
  const prev = prevFile && existsSync(prevFile) ? readJson<Record<string, number>>(prevFile) : null;
  const moved = measures.filter((m) => !m.final).map((m) => {
    const now = out.measures[m.id];
    const was = prev?.[m.id];
    const d = now === undefined || was === undefined ? 0 : (now - was) * (m.better === "lower" ? -1 : 1);
    return { m, now, was, worse: d < -(m.slack ?? 0), better: d > (m.slack ?? 0) };
  });

  const why: string[] = [];
  const notes: string[] = [];
  // A must counts as true only when most of the judges who replied could confirm it.
  const confirmed = (yes: number[], i: number) => (yes[i] ?? 0) * 2 > replied;
  const musts = c.must ?? [];
  const mustOpen = musts.filter((_, i) => !confirmed(mustYes, i));
  const gapOf = (id: string) => out.criteria[id]?.gap ?? 0;
  if (thin.length) why.push(`${thin.join(", ")}: needs scores from at least two judges${needFamilies > 1 ? " in two model families" : ""}`);
  else if (solo) out.verdict = "BASELINE";
  else {
    for (const x of moved.filter((y) => y.worse)) why.push(`${x.m.id} got worse: ${x.was} -> ${x.now}`);
    musts.forEach((text, i) => {
      if (confirmed(mustYesBest, i) && !confirmed(mustYes, i)) why.push(`a must that held for the best version no longer does: ${text}`);
      if (!confirmed(mustYesBest, i) && confirmed(mustYes, i)) notes.push(`this round makes a must true that the best version fails: ${text}`);
    });
    if (mustOpen.length) notes.push(`${mustOpen.length} must still not confirmed. Fix that next: the target can't be met without it.`);
    // Judges weigh trade-offs when they say which they would ship, so a one-point drop is a warning and two is a revert.
    for (const x of criteria) {
      if (gapOf(x.id) <= -2) why.push(`${x.id} fell by ${fmt(-gapOf(x.id))}`);
      else if (gapOf(x.id) <= -1) notes.push(`${x.id} fell by ${fmt(-gapOf(x.id))}. If you keep the round, say in the log why that's worth it.`);
    }
    const improved = moved.some((x) => x.better);
    if (why.length) out.verdict = "REVERT";
    else if (!criteria.length) out.verdict = improved ? "KEEP" : "TIE";
    else if (votes.best > votes.new) {
      out.verdict = "REVERT";
      why.push("more judges would ship the best version so far");
    } else if (votes.new > votes.best && forNew.size >= needFamilies) out.verdict = "KEEP";
    else {
      out.verdict = improved ? "KEEP" : "TIE";
      if (votes.new > votes.best) why.push("only one model family would ship the new version");
    }
  }

  const t = c.target;
  const floor = c.floor ?? (t === undefined ? undefined : t - 1);
  const scoreMet = !criteria.length || t === undefined || (out.mean !== null && out.mean >= t && medians.every((m) => m !== null && m >= (floor ?? 0)));
  const measureMet = moved.every((x) => x.m.target === undefined || (x.now !== undefined && (x.m.better === "lower" ? x.now <= x.m.target : x.now >= x.m.target)));
  const hasTarget = (criteria.length > 0 && t !== undefined) || moved.some((x) => x.m.target !== undefined);
  out.targetMet = hasTarget && !thin.length && scoreMet && measureMet && !mustOpen.length;
  writeFileSync(scoresFile(r), `${JSON.stringify(out, null, 2)}\n`);

  if (criteria.length) {
    const w = Math.max(9, ...criteria.map((x) => x.id.length));
    console.log(`${"criterion".padEnd(w)}  ${solo ? "score" : "new    best   gap"}`);
    for (const x of criteria) {
      const s = out.criteria[x.id];
      console.log(`${x.id.padEnd(w)}  ${solo ? fmt(s?.new) : `${fmt(s?.new).padEnd(5)}  ${fmt(s?.best).padEnd(5)}  ${fmt(s?.gap, true)}`}`);
    }
    console.log(`mean: ${fmt(out.mean)}${solo ? "" : `   would ship: new ${votes.new}, best ${votes.best}, tie ${votes.tie}`}`);
  }
  for (const x of moved) console.log(`measure ${x.m.id}: ${x.now}${x.was === undefined ? "" : ` (best so far ${x.was})`}${x.m.target === undefined ? "" : `, target ${x.m.target}`}`);
  if (!sameRuler) console.log("the criteria, gates or measures changed since the best round, so its measures aren't compared with this round's");
  const section = (title: string, lines: string[]) => lines.length && console.log(`\n${title}\n${lines.map((l) => `- ${l}`).join("\n")}`);
  const serious = (l: string) => /^\[(must|blocker|high)\]/.test(l);
  section(solo ? "findings to plan from (check each against the evidence first):" : "findings on this round. Check the first group against the evidence before you keep it:", [...findings.filter(serious), ...findings.filter((l) => !serious(l))]);
  if (!solo) section("findings on the best version so far:", onBest);
  section("judges' doubts about the rubric or the evidence:", doubts);
  section("problems:", problems);
  const advice = out.verdict === "KEEP" && criteria.length ? ", unless you confirm a blocker or a must that is now false" : out.verdict === "TIE" ? ": keep it only if it fixes something you confirmed, and say what in the log" : "";
  console.log(`\n${out.verdict}${advice}${[...why, ...notes].map((l) => `\n- ${l}`).join("")}`);
  if (criteria.length && c.single_family) console.log("note: every judge is from one model family, so they share blind spots");
  if (hasTarget) console.log(`target: ${out.targetMet ? "met" : "not met"}${t !== undefined && criteria.length ? ` (mean ${fmt(out.mean)} of ${t}, lowest ${fmt(Math.min(...medians.map((m) => m ?? 0)))} of ${floor})` : ""}${mustOpen.length ? `, ${mustOpen.length} must not confirmed` : ""}`);
  return out;
}

function log(r: string, decision: string, note: string) {
  if (decision !== "keep" && decision !== "revert") die('usage: log <dir> <round> keep|revert "<what you tried>"');
  if (history().some((x) => x.round === r)) die(`round ${r} is already logged`);
  const s = existsSync(scoresFile(r)) ? readJson<Scores>(scoresFile(r)) : null;
  if (decision === "keep" && (!s || s.verdict === "INCOMPLETE")) die(`round ${r} has no complete score, so it can't be kept. Run: score ${r}`);
  // The table shows when a decision went beyond or against the verdict.
  const against = (decision === "keep" && (s?.verdict === "TIE" || s?.verdict === "REVERT")) || (decision === "revert" && s?.verdict === "KEEP");
  const shaFile = join(rdir(r), "sha");
  const row: Row = {
    round: r,
    time: new Date().toISOString().slice(0, 16),
    sha: existsSync(shaFile) ? readFileSync(shaFile, "utf8").trim() : "-",
    decision,
    score: fmt(s?.mean),
    measures: Object.entries(s?.measures ?? {}).map(([k, v]) => `${k}=${v}`).join(" ") || "-",
    rubric: rubricId,
    note: `${against ? `[verdict was ${s?.verdict}] ` : ""}${note.replace(/\s+/g, " ").trim() || "-"}`,
  };
  if (!existsSync(histFile)) writeFileSync(histFile, `${COLS.join("\t")}\n`);
  appendFileSync(histFile, `${COLS.map((k) => row[k]).join("\t")}\n`);
  console.log(`logged round ${r}: ${decision}`);
  if (decision === "revert") console.log("Put the work back to the best version before the next round (git revert --no-edit HEAD if you committed).");
  status();
}

function table(): string {
  const rows = history();
  const shown = measures.filter((m) => !m.final);
  const changed = (i: number) => i > 0 && rows[i - 1]?.rubric !== rows[i]?.rubric;
  const head = ["round", "decision", "mean", ...criteria.map((x) => x.id), ...shown.map((m) => m.id), "what was tried"];
  const lines = rows.map((row, i) => {
    const s = existsSync(scoresFile(row.round)) ? readJson<Scores>(scoresFile(row.round)) : null;
    return [`${row.round}${changed(i) ? " *" : ""}`, row.decision, fmt(s?.mean), ...criteria.map((x) => fmt(s?.criteria[x.id]?.new)), ...shown.map((m) => fmt(s?.measures[m.id])), row.note];
  });
  const md = [head, head.map(() => "---"), ...lines].map((l) => `| ${l.join(" | ")} |`).join("\n");
  return rows.some((_, i) => changed(i)) ? `${md}\n\n\\* The criteria, gates or measures changed here. Scores before and after don't compare.` : md;
}

function status() {
  const rows = history();
  const kept = best();
  let reverts = 0;
  for (const row of rows.toReversed()) {
    if (row.decision !== "revert") break;
    reverts++;
  }
  const minutes = Math.round((Date.now() - statSync(contractFile).birthtimeMs) / 60000); // since the contract was written
  const bestScores = kept && existsSync(scoresFile(kept.round)) ? readJson<Scores>(scoresFile(kept.round)) : null;
  console.log(kept ? `\nbest so far: round ${kept.round} (${kept.sha})${bestScores?.targetMet ? ", target met" : ""}` : "\nnothing logged yet. Start with round 00.");
  console.log(`rounds after 00: ${rows.filter((row) => row.round !== "00").length}${c.rounds ? ` of ${c.rounds}` : ""}   reverts in a row: ${reverts}   minutes so far: ${minutes}${c.minutes ? ` of ${c.minutes}` : ""}`);
  const next = String(rows.length ? Math.max(...rows.map((row) => Number.parseInt(row.round, 10) || 0)) + 1 : 0).padStart(2, "0");
  const open = walk(join(dir, "rounds")).map((f) => f.split("/")[0] ?? "").find((r) => !rows.some((row) => row.round === r));
  console.log(open ? `unfinished: round ${open}` : `next round: ${next}`);
  if (rows.length) console.log(`\n${table()}`);
}

function report() {
  const rows = history();
  const first = rows[0];
  const last = best();
  if (!first || !last) die("nothing to report yet");
  // Held-back measures run here, once, on the work as it stands now.
  const held = measure(measures.filter((m) => m.final));
  const heldLines = Object.entries(held).map(([k, v]) => `held-back check ${k}: ${v}`);
  const diff = first.sha !== "-" && last.sha !== "-" && first.sha !== last.sha ? sh(`git diff --stat ${first.sha} ${last.sha}`) : null;
  const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`);
  const show = (p: string, name: string) => {
    if (!existsSync(p)) return "<p class=none>not captured</p>";
    if (/\.(png|jpe?g|gif|webp|svg)$/i.test(name)) return `<img loading=lazy src="${esc(relative(dir, p))}" alt="${esc(name)}">`;
    const text = readFileSync(p, "utf8");
    return `<pre>${esc(text.length > 20000 ? `${text.slice(0, 20000)}\n…` : text)}</pre>`;
  };
  const ev = (r: string) => join(rdir(r), "evidence");
  const files = [...new Set([...walk(ev(first.round)), ...walk(ev(last.round))])];
  const cells = (l: string[], tag: string) => `<tr>${l.map((x) => `<${tag}>${esc(x)}</${tag}>`).join("")}</tr>`;
  const [head = [], , ...body] = table().split("\n\n")[0]?.split("\n").map((l) => l.split("|").slice(1, -1).map((x) => x.trim())) ?? [];
  const html = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Hill climb: before and after</title>
<style>:root{color-scheme:light dark}body{font:15px/1.5 system-ui,sans-serif;margin:0 auto;max-width:1400px;padding:16px}table{border-collapse:collapse;display:block;overflow-x:auto}td,th{border:1px solid #8884;padding:4px 8px;text-align:left}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}.pair>div{min-width:0}img{max-width:100%;border:1px solid #8884}pre{white-space:pre-wrap;overflow-wrap:anywhere;border:1px solid #8884;padding:8px;margin:0}
h2{margin-top:32px;font-size:16px}.none{opacity:.6}button{font:inherit;padding:6px 12px;display:none}
@media(max-width:700px){.pair{grid-template-columns:1fr}.pair>div+div{display:none}.pair.flip>div{display:none}.pair.flip>div+div{display:block}button{display:inline-block}}</style>
<h1>${esc(c.goal)}</h1><table>${cells(head, "th")}${body.map((l) => cells(l, "td")).join("")}</table>
${heldLines.map((l) => `<p><b>${esc(l)}</b></p>`).join("")}${diff?.ok ? `<h2>What changed (round ${first.round} to round ${last.round})</h2><pre>${esc(diff.out)}</pre>` : ""}
${walk(join(dir, "reference")).map((f) => `<h2>The bar: ${esc(f)}</h2>${show(join(dir, "reference", f), f)}`).join("\n")}
${files.map((f) => `<h2>${esc(f)} <button onclick="this.parentNode.nextElementSibling.classList.toggle('flip')">before / after</button></h2><div class=pair><div><b>Before (round ${first.round})</b><br>${show(join(ev(first.round), f), f)}</div><div><b>After (round ${last.round})</b><br>${show(join(ev(last.round), f), f)}</div></div>`).join("\n")}`;
  writeFileSync(join(dir, "report.html"), html);
  console.log(`wrote ${join(dir, "report.html")}\n${heldLines.join("\n")}\n\n${table()}`);
}

switch (cmd) {
  case "prep":
    prep(needRound());
    break;
  case "score":
    score(needRound());
    break;
  case "log":
    log(needRound(), rest[0] ?? "", rest.slice(1).join(" "));
    break;
  case "status":
    status();
    break;
  case "report":
    report();
    break;
  default:
    die(USAGE);
}
