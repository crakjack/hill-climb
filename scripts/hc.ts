#!/usr/bin/env bun
// Hill-climb helper: blind packing, judge validation, and the keep/stop math.
//
//   bun hc.ts pack <dir> <round> <control-dir> [--audit]
//   bun hc.ts aggregate <dir> <round> [--incumbent <round>] [--targets id,id]
//   bun hc.ts noise <dir> <roundA> <roundB>
//   bun hc.ts table <dir>
//
// <dir> is .hillclimb/<slug>. "control" is the reference, or the incumbent's
// evidence when contract.json has "reference": false.
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type Label = "A" | "B";
type Role = "artifact" | "control";
type Mapping = { packetRoot: string; judges: Record<string, Record<Label, Role>> };
type Contract = {
  reference: boolean;
  criteria: string[];
  checks: string[];
  required?: string[]; // check ids that must pass
  judges: Record<string, string>; // judge id -> model family
  auditorFamily?: string;
  noiseFloor?: number | null;
  target?: number | null; // mean of criterion medians must reach this
  floor?: number | null; // every criterion median must reach this (default target - 1)
};
type Issue = { severity?: string; criterion?: string; evidence?: string; problem?: string };
type Verdict = {
  criteria?: { id: string; A?: unknown; B?: unknown; better?: string }[];
  checks?: Partial<Record<Label, Record<string, string>>>;
  issues?: Partial<Record<Label, Issue[]>>;
  rubric_flags?: string[];
};
type CriterionAgg = { artifact: number | null; control: number | null; gap: number | null; judges: string[] };
type Aggregate = {
  round: string;
  criteria: Record<string, CriterionAgg>;
  meanGap: number | null;
  winners: Record<string, Record<string, Role | "tie">>; // criterion -> judge -> winner
  checkFails: Record<string, string[]>;
  toVerify: string[];
  rubricFlags: string[];
  problems: string[];
};

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

const [cmd, dir, ...args] = process.argv.slice(2);
if (!cmd || !dir) die("usage: bun hc.ts <pack|aggregate|noise|table> <dir> ...");

const opt = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const valued = new Set(["--incumbent", "--targets"]);
const positional = args.filter((a, i) => !a.startsWith("--") && !valued.has(args[i - 1] ?? ""));
const readJson = <T,>(p: string): T => JSON.parse(readFileSync(p, "utf8")) as T;
const contract = readJson<Contract>(join(dir, "contract.json"));
const rdir = (r: string) => join(dir, "rounds", r);
// Files only, so reference/holdout/ stays out of loop packets.
const list = (d: string) =>
  readdirSync(d)
    .filter((f) => !f.startsWith(".") && statSync(join(d, f)).isFile())
    .sort();
const isRequired = (check: string) => (contract.required ?? []).includes(check);
const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const fmt = (n: number | null | undefined, signed = false) =>
  n === null || n === undefined ? "no score" : `${signed && n > 0 ? "+" : ""}${n.toFixed(1)}`;
const family = (judge: string) =>
  contract.judges[judge] ?? (judge.startsWith("AUD") ? (contract.auditorFamily ?? "auditor") : "unknown");

function pack(round: string, controlDir: string, audit: boolean) {
  const evidence = join(rdir(round), "evidence");
  const states = list(evidence);
  if (!states.length) die(`no evidence in ${evidence}`);
  const control = list(controlDir);
  if (control.join("\n") !== states.join("\n"))
    die(`evidence and control need the same file names\n  artifact: ${states.join(", ")}\n  control:  ${control.join(", ")}`);
  // Neutral location so paths reveal nothing about the project, round, or roles.
  const packetRoot = mkdtempSync(join(tmpdir(), "hc-"));
  const ids = audit ? ["AUD1", "AUD2"] : Object.keys(contract.judges);
  const offset = Math.random() < 0.5 ? 0 : 1; // alternate orders across judges, random start
  const mapping: Mapping = { packetRoot, judges: {} };
  ids.forEach((judge, i) => {
    const roles: Record<Label, Role> =
      (i + offset) % 2 === 0 ? { A: "artifact", B: "control" } : { A: "control", B: "artifact" };
    mapping.judges[judge] = roles;
    for (const label of ["A", "B"] as const) {
      const out = join(packetRoot, judge, label);
      mkdirSync(out, { recursive: true });
      const src = roles[label] === "artifact" ? evidence : controlDir;
      for (const f of states) copyFileSync(join(src, f), join(out, f));
    }
  });
  writeFileSync(join(rdir(round), "mapping.json"), `${JSON.stringify(mapping, null, 2)}\n`);
  for (const judge of ids) console.log(`${judge}: A=${join(packetRoot, judge, "A")}  B=${join(packetRoot, judge, "B")}`);
  console.log(`files on each side: ${states.join(", ")}`);
}

function parseVerdict(text: string): Verdict {
  const blocks = [...text.matchAll(/```json\s*\n([\s\S]*?)```/g)];
  return JSON.parse(blocks.length ? blocks[blocks.length - 1][1] : text) as Verdict;
}

function aggregate(round: string): Aggregate {
  const mapping = readJson<Mapping>(join(rdir(round), "mapping.json"));
  const agg: Aggregate = {
    round,
    criteria: {},
    meanGap: null,
    winners: {},
    checkFails: {},
    toVerify: [],
    rubricFlags: [],
    problems: [],
  };
  const rows: Record<string, { judge: string; artifact: number | null; control: number | null }[]> = {};

  for (const [judge, roles] of Object.entries(mapping.judges)) {
    const file = join(rdir(round), "judges", `${judge}.md`);
    if (!existsSync(file)) {
      agg.problems.push(`${judge}: no output file`);
      continue;
    }
    let v: Verdict;
    try {
      v = parseVerdict(readFileSync(file, "utf8"));
    } catch {
      agg.problems.push(`${judge}: no valid JSON block (rerun once)`);
      continue;
    }
    const labelOf = (role: Role): Label => (roles.A === role ? "A" : "B");
    const score = (id: string, s: unknown): number | null => {
      if (s === null || s === undefined) return null;
      if (typeof s === "number" && s >= 1 && s <= 10) return s;
      agg.problems.push(`${judge}/${id}: invalid score ${JSON.stringify(s)}`);
      return null;
    };
    const seen = new Set<string>();
    for (const c of v.criteria ?? []) {
      if (!contract.criteria.includes(c.id)) {
        agg.problems.push(`${judge}: unknown criterion "${c.id}"`);
        continue;
      }
      seen.add(c.id);
      (rows[c.id] ??= []).push({
        judge,
        artifact: score(c.id, c[labelOf("artifact")]),
        control: score(c.id, c[labelOf("control")]),
      });
      if (c.better === "A" || c.better === "B") (agg.winners[c.id] ??= {})[judge] = roles[c.better];
      else if (c.better === "tie") (agg.winners[c.id] ??= {})[judge] = "tie";
    }
    for (const id of contract.criteria) if (!seen.has(id)) agg.problems.push(`${judge}: missing criterion "${id}"`);
    const checks = v.checks?.[labelOf("artifact")] ?? {};
    for (const id of contract.checks) {
      if (checks[id] === undefined) agg.problems.push(`${judge}: missing check "${id}"`);
      else if (checks[id] === "FAIL") {
        (agg.checkFails[id] ??= []).push(judge);
        if (isRequired(id)) agg.toVerify.push(`[required check] ${judge} ${id}: FAIL`);
      }
    }
    for (const flag of v.rubric_flags ?? []) agg.rubricFlags.push(`${judge}: ${flag}`);
    for (const issue of v.issues?.[labelOf("artifact")] ?? [])
      if (issue.severity === "blocker" || issue.severity === "high")
        agg.toVerify.push(
          `[${issue.severity}] ${judge} ${issue.criterion ?? "?"}: ${issue.problem ?? ""} (evidence: ${issue.evidence ?? "none given"})`,
        );
  }

  const audit = round.startsWith("audit");
  for (const id of contract.criteria) {
    const r = rows[id] ?? [];
    const paired = r.flatMap((x) => (x.artifact !== null && x.control !== null ? [{ judge: x.judge, gap: x.artifact - x.control }] : []));
    const families = new Set(paired.map((p) => family(p.judge))).size;
    const quorum = audit ? paired.length > 0 : paired.length >= 2 && families >= 2;
    if (!quorum) agg.problems.push(`${id}: no quorum (${paired.length} paired judges, ${families} families)`);
    agg.criteria[id] = {
      artifact: median(r.flatMap((x) => (x.artifact === null ? [] : [x.artifact]))),
      control: median(r.flatMap((x) => (x.control === null ? [] : [x.control]))),
      gap: quorum ? median(paired.map((p) => p.gap)) : null, // median of per-judge paired gaps
      judges: paired.map((p) => p.judge),
    };
  }
  const gaps = contract.criteria.map((id) => agg.criteria[id].gap);
  agg.meanGap = gaps.every((g): g is number => g !== null) ? mean(gaps) : null;
  writeFileSync(join(rdir(round), "aggregate.json"), `${JSON.stringify(agg, null, 2)}\n`);
  return agg;
}

function report(agg: Aggregate) {
  const w = Math.max(9, ...contract.criteria.map((c) => c.length));
  console.log(`${"criterion".padEnd(w)}  artifact  control   gap       judges`);
  for (const id of contract.criteria) {
    const c = agg.criteria[id];
    console.log(`${id.padEnd(w)}  ${fmt(c.artifact).padEnd(8)}  ${fmt(c.control).padEnd(8)}  ${fmt(c.gap, true).padEnd(8)}  ${c.judges.join(",")}`);
  }
  console.log(`mean gap: ${fmt(agg.meanGap, true)}`);
  const fails = Object.entries(agg.checkFails);
  if (fails.length)
    console.log(`\nartifact check FAILs:\n${fails.map(([id, js]) => `- ${id}${isRequired(id) ? " [required]" : ""}: ${js.join(", ")}`).join("\n")}`);
  if (agg.toVerify.length) console.log(`\nverify against the evidence before deciding:\n${agg.toVerify.map((s) => `- ${s}`).join("\n")}`);
  if (agg.rubricFlags.length) console.log(`\nrubric flags (review at round 0 and in triage):\n${agg.rubricFlags.map((s) => `- ${s}`).join("\n")}`);
  if (agg.problems.length) console.log(`\nproblems:\n${agg.problems.map((s) => `- ${s}`).join("\n")}`);
}

function audit(agg: Aggregate) {
  console.log("\naudit (the auditor judged both orders):");
  for (const id of contract.criteria) {
    const w = agg.winners[id] ?? {};
    const a = w.AUD1;
    const b = w.AUD2;
    const verdict = !a || !b ? "missing" : a === b ? a : "order-sensitive (unresolved)";
    console.log(`- ${id}: ${verdict}`);
  }
}

function decide(now: Aggregate, incumbent: string | undefined, targets: string[]) {
  const floor = contract.noiseFloor ?? 0.5;
  const inc = incumbent ? readJson<Aggregate>(join(rdir(incumbent), "aggregate.json")) : null;
  for (const t of targets) if (!contract.criteria.includes(t)) die(`unknown target "${t}"`);
  const reasons: string[] = [];
  let close = false;
  for (const id of contract.criteria) {
    const g = now.criteria[id].gap;
    const base = inc ? inc.criteria[id]?.gap : 0; // no incumbent: the control is the incumbent, so compare to 0
    if (g === null || base === null || base === undefined) {
      reasons.push(`${id}: no comparable gap`);
      continue;
    }
    const d = g - base;
    if (targets.includes(id) && d < floor) reasons.push(`${id}: target moved ${fmt(d, true)}, needs +${floor.toFixed(1)}`);
    if (d < -floor) reasons.push(`${id}: regressed ${fmt(d, true)}`);
    if ((targets.includes(id) && Math.abs(d - floor) < 0.5) || Math.abs(d + floor) < 0.5) close = true;
    if (Math.abs(d) > 2) console.log(`suspect: ${id} moved ${fmt(d, true)}. Confirm the change explains it.`);
  }
  const baseMean = inc ? inc.meanGap : 0;
  if (now.meanGap === null || baseMean === null) reasons.push("mean gap unavailable");
  else if (now.meanGap < baseMean) reasons.push(`mean gap fell ${fmt(baseMean, true)} -> ${fmt(now.meanGap, true)}`);
  console.log(
    `\nrule (noise floor ${floor.toFixed(1)}): ${reasons.length ? `REVERT\n- ${reasons.join("\n- ")}` : "KEEP, unless you confirm a blocker or a required-check failure"}`,
  );
  const confirmRound = now.round.includes("-confirm");
  if (close && !confirmRound) console.log("close call: run a confirm round (candidate vs incumbent) before deciding");

  const meetsTarget = () => {
    const t = contract.target;
    if (t == null) return "";
    const f = contract.floor ?? t - 1;
    const medians = contract.criteria.map((id) => now.criteria[id].artifact);
    const ok = medians.every((m): m is number => m !== null) && mean(medians) >= t && medians.every((m) => m >= f);
    return `target ${t} (floor ${f}): ${ok ? "met" : "not met"}`;
  };
  if (confirmRound) return;
  if (contract.reference) {
    const r0 = existsSync(join(rdir("00"), "aggregate.json")) ? readJson<Aggregate>(join(rdir("00"), "aggregate.json")) : null;
    for (const id of contract.criteria) {
      const was = r0?.criteria[id]?.control;
      const is = now.criteria[id].control;
      if (was != null && is != null && Math.abs(is - was) > 1)
        console.log(`drift: the reference's ${id} median moved ${fmt(was)} -> ${fmt(is)} since round 0`);
    }
    const parity =
      now.meanGap !== null && now.meanGap >= 0 && contract.criteria.every((id) => (now.criteria[id].gap ?? -99) >= -0.5);
    const t = meetsTarget();
    console.log(`parity: ${parity ? "yes" : "no"}${t ? `, ${t}` : ""}`);
  } else {
    const t = meetsTarget();
    if (t) console.log(t);
  }
}

function noise(a: string, b: string) {
  const A = readJson<Aggregate>(join(rdir(a), "aggregate.json"));
  const B = readJson<Aggregate>(join(rdir(b), "aggregate.json"));
  let max = 0;
  for (const id of contract.criteria) {
    const x = A.criteria[id]?.gap;
    const y = B.criteria[id]?.gap;
    if (x == null || y == null) {
      console.log(`${id}: missing in one run`);
      continue;
    }
    max = Math.max(max, Math.abs(x - y));
    console.log(`${id}: ${fmt(x, true)} vs ${fmt(y, true)}`);
  }
  console.log(`noise floor: ${Math.max(0.5, max).toFixed(1)}${max > 1 ? " (above 1: tighten the criteria that swung most, then redo round 0)" : ""}`);
}

function table() {
  const rounds = list(join(dir, "rounds")).filter((r) => /^\d+$/.test(r) && existsSync(join(rdir(r), "aggregate.json")));
  if (!rounds.length) die("no aggregated rounds yet");
  const aggs = rounds.map((r) => readJson<Aggregate>(join(rdir(r), "aggregate.json")));
  const decisions = new Map<string, string>();
  const hist = join(dir, "history.tsv");
  if (existsSync(hist))
    for (const line of readFileSync(hist, "utf8").trim().split("\n").slice(1)) {
      const cols = line.split("\t");
      decisions.set(cols[0], cols[4] ?? "");
    }
  const last = aggs[aggs.length - 1];
  const head = rounds.map((r) => `R${Number(r)}${decisions.get(r) === "revert" ? " (reverted)" : ""}`);
  const ctl = contract.reference ? "Reference (latest)" : "Incumbent (latest)";
  console.log(`| Criterion | ${head.join(" | ")} | ${ctl} | Gap |`);
  console.log(`| --- |${" --- |".repeat(rounds.length + 2)}`);
  for (const id of contract.criteria)
    console.log(`| ${id} | ${aggs.map((a) => fmt(a.criteria[id]?.artifact)).join(" | ")} | ${fmt(last.criteria[id]?.control)} | ${fmt(last.criteria[id]?.gap, true)} |`);
  console.log(`| mean gap | ${aggs.map((a) => fmt(a.meanGap, true)).join(" | ")} | | |`);
}

switch (cmd) {
  case "pack": {
    const [round, control] = positional;
    if (!round || !control) die("usage: pack <dir> <round> <control-dir> [--audit]");
    pack(round, control, args.includes("--audit"));
    break;
  }
  case "aggregate": {
    const [round] = positional;
    if (!round) die("usage: aggregate <dir> <round> [--incumbent <round>] [--targets id,id]");
    const agg = aggregate(round);
    report(agg);
    if (round.startsWith("audit")) audit(agg);
    else if (opt("incumbent") || opt("targets") || !contract.reference)
      decide(agg, opt("incumbent"), (opt("targets") ?? "").split(",").filter(Boolean));
    break;
  }
  case "noise": {
    const [a, b] = positional;
    if (!a || !b) die("usage: noise <dir> <roundA> <roundB>");
    noise(a, b);
    break;
  }
  case "table":
    table();
    break;
  default:
    die(`unknown command "${cmd}"`);
}
