#!/usr/bin/env bun
// Hill-climb helper. It does the blinding and the math so the agent doesn't.
//
//   bun hc.ts pack   <dir> <round> [control-dir] [--audit]
//   bun hc.ts score  <dir> <round> [--targets id,id]
//   bun hc.ts log    <dir> <round> <keep|revert> <what you tried>
//   bun hc.ts status <dir>
//   bun hc.ts noise  <dir> <roundA> <roundB>
//
// <dir> is .hillclimb/<slug>. The "control" is what a round is compared with:
// the reference, or the best version so far when contract.json has "reference": false.
import { execSync } from "node:child_process";
import { appendFileSync, copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
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
  target?: number | null; // mean of criterion medians must reach this
  floor?: number | null; // every criterion median must reach this (default target - 1)
  noiseFloor?: number | null; // smallest gap change that counts (default 0.5)
};
type Issue = { severity?: string; criterion?: string; evidence?: string; problem?: string };
type Verdict = {
  criteria?: { id: string; A?: unknown; B?: unknown; better?: string }[];
  checks?: Partial<Record<Label, Record<string, string>>>;
  issues?: Partial<Record<Label, Issue[]>>;
  rubric_flags?: string[];
  evidence_gaps?: string[];
};
type CriterionScore = { artifact: number | null; control: number | null; gap: number | null; judges: string[] };
type Scores = {
  round: string;
  criteria: Record<string, CriterionScore>;
  meanGap: number | null;
  winners: Record<string, Record<string, Role | "tie">>; // criterion -> judge -> winner
  checkFails: Record<string, string[]>;
  toVerify: string[];
  onControl: string[]; // judges' findings on the control side
  rubricFlags: string[];
  problems: string[];
};
type Row = { round: string; sha: string; note: string; meanGap: string; decision: string };

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

const [cmd, dir, ...args] = process.argv.slice(2);
if (!cmd || !dir) die("usage: bun hc.ts <pack|score|log|status|noise> <dir> ...");

const targets = (() => {
  const i = args.indexOf("--targets");
  return i >= 0 ? (args[i + 1] ?? "").split(",").filter(Boolean) : [];
})();
const positional = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--targets");
const readJson = <T,>(p: string): T => JSON.parse(readFileSync(p, "utf8")) as T;
const contract = readJson<Contract>(join(dir, "contract.json"));
const rdir = (r: string) => join(dir, "rounds", r);
const scoresFile = (r: string) => join(rdir(r), "scores.json");
const entries = (d: string, files: boolean) =>
  existsSync(d)
    ? readdirSync(d)
        .filter((f) => !f.startsWith(".") && statSync(join(d, f)).isFile() === files)
        .sort()
    : [];
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

const histFile = join(dir, "history.tsv");
const history = (): Row[] =>
  existsSync(histFile)
    ? readFileSync(histFile, "utf8")
        .trim()
        .split("\n")
        .slice(1)
        .filter(Boolean)
        .map((line) => {
          const [round = "", sha = "", note = "", meanGap = "", decision = ""] = line.split("\t");
          return { round, sha, note, meanGap, decision };
        })
    : [];
const best = () => history().findLast((r) => r.decision === "keep");
// 03b and 03-confirm re-judge round 03's evidence.
const baseOf = (round: string) => round.match(/^(\d+)(b|-confirm)$/)?.[1];
// What a round's control is, in plain words.
const controlName = (round: string) =>
  round.endsWith("-confirm") ? "best so far" : contract.reference ? "reference" : round === "audit" ? "baseline" : "best so far";

function pack(round: string, controlArg: string | undefined, audit: boolean) {
  const kept = best()?.round;
  const needKept = () => kept ?? die('no kept round yet. Log the baseline first: log <dir> 00 keep "baseline"');
  const evidence = join(rdir(round), "evidence");
  if (!existsSync(evidence)) {
    const from = round === "audit" ? needKept() : baseOf(round);
    if (from) cpSync(join(rdir(from), "evidence"), evidence, { recursive: true });
  }
  const files = entries(evidence, true);
  if (!files.length) die(`no evidence in ${evidence}`);
  const flat = (d: string) => entries(d, false).length && die(`evidence must be flat files, but ${d} has subfolders`);
  flat(evidence);

  let controlDir = controlArg;
  if (!controlDir) {
    if (round.endsWith("-confirm")) controlDir = join(rdir(needKept()), "evidence");
    else if (contract.reference) controlDir = join(dir, "reference");
    else controlDir = join(rdir(round === "audit" ? "00" : needKept()), "evidence");
  }
  flat(controlDir);
  const control = entries(controlDir, true);
  if (control.join("\n") !== files.join("\n"))
    die(`both sides need the same file names\n  this round: ${files.join(", ")}\n  control (${controlDir}): ${control.join(", ")}`);

  // A neutral location, so paths reveal nothing about the project, the round, or which side is which.
  const packetRoot = mkdtempSync(join(tmpdir(), "hc-"));
  const ids = audit ? ["AUD1", "AUD2"] : Object.keys(contract.judges);
  const offset = Math.random() < 0.5 ? 0 : 1; // orders alternate across judges from a random start
  // Packing a round again keeps its A/B order, so replies already saved still score correctly.
  const mapFile = join(rdir(round), "mapping.json");
  const old = existsSync(mapFile) ? readJson<Mapping>(mapFile).judges : {};
  const mapping: Mapping = { packetRoot, judges: {} };
  ids.forEach((judge, i) => {
    const roles: Record<Label, Role> =
      old[judge] ?? ((i + offset) % 2 === 0 ? { A: "artifact", B: "control" } : { A: "control", B: "artifact" });
    mapping.judges[judge] = roles;
    for (const label of ["A", "B"] as const) {
      const out = join(packetRoot, judge, label);
      mkdirSync(out, { recursive: true });
      const src = roles[label] === "artifact" ? evidence : controlDir;
      for (const f of files) copyFileSync(join(src, f), join(out, f));
    }
  });
  writeFileSync(mapFile, `${JSON.stringify(mapping, null, 2)}\n`);
  for (const judge of ids) console.log(`${judge}: A=${join(packetRoot, judge, "A")}  B=${join(packetRoot, judge, "B")}`);
  console.log(`files on each side: ${files.join(", ")}`);
  console.log(`save each reply to ${join(rdir(round), "judges")}/<judge>.md`);
}

function parseVerdict(text: string): Verdict {
  const blocks = [...text.matchAll(/```json\s*\n([\s\S]*?)```/g)];
  return JSON.parse(blocks.length ? blocks[blocks.length - 1][1] : text) as Verdict;
}

function score(round: string): Scores {
  const mapping = readJson<Mapping>(join(rdir(round), "mapping.json"));
  const out: Scores = { round, criteria: {}, meanGap: null, winners: {}, checkFails: {}, toVerify: [], onControl: [], rubricFlags: [], problems: [] };
  const rows: Record<string, { judge: string; artifact: number | null; control: number | null }[]> = {};

  for (const [judge, roles] of Object.entries(mapping.judges)) {
    const file = join(rdir(round), "judges", `${judge}.md`);
    if (!existsSync(file)) {
      out.problems.push(`${judge}: no reply file`);
      continue;
    }
    let v: Verdict;
    try {
      v = parseVerdict(readFileSync(file, "utf8"));
    } catch {
      out.problems.push(`${judge}: no valid JSON block (rerun this judge once)`);
      continue;
    }
    const labelOf = (role: Role): Label => (roles.A === role ? "A" : "B");
    const num = (id: string, s: unknown): number | null => {
      if (s === null || s === undefined) return null;
      if (typeof s === "number" && s >= 1 && s <= 10) return s;
      out.problems.push(`${judge}/${id}: invalid score ${JSON.stringify(s)}`);
      return null;
    };
    const seen = new Set<string>();
    for (const c of v.criteria ?? []) {
      if (!contract.criteria.includes(c.id)) {
        out.problems.push(`${judge}: unknown criterion "${c.id}"`);
        continue;
      }
      seen.add(c.id);
      (rows[c.id] ??= []).push({ judge, artifact: num(c.id, c[labelOf("artifact")]), control: num(c.id, c[labelOf("control")]) });
      if (c.better === "A" || c.better === "B") (out.winners[c.id] ??= {})[judge] = roles[c.better];
      else if (c.better === "tie") (out.winners[c.id] ??= {})[judge] = "tie";
    }
    for (const id of contract.criteria) if (!seen.has(id)) out.problems.push(`${judge}: missing criterion "${id}"`);
    const checks = v.checks?.[labelOf("artifact")] ?? {};
    for (const id of contract.checks) {
      if (checks[id] === undefined) out.problems.push(`${judge}: missing check "${id}"`);
      else if (checks[id] === "FAIL") {
        (out.checkFails[id] ??= []).push(judge);
        if (isRequired(id)) out.toVerify.push(`[required check] ${judge} ${id}: FAIL`);
      }
    }
    for (const flag of v.rubric_flags ?? []) out.rubricFlags.push(`${judge}: ${flag}`);
    for (const gap of v.evidence_gaps ?? []) out.problems.push(`${judge} couldn't open: ${gap}`);
    for (const issue of v.issues?.[labelOf("control")] ?? [])
      if (issue.severity !== "nit")
        out.onControl.push(`[${issue.severity ?? "?"}] ${judge} ${issue.criterion ?? "?"}: ${issue.problem ?? ""} (where: ${issue.evidence ?? "not given"})`);
    for (const issue of v.issues?.[labelOf("artifact")] ?? [])
      if (issue.severity === "blocker" || issue.severity === "high")
        out.toVerify.push(`[${issue.severity}] ${judge} ${issue.criterion ?? "?"}: ${issue.problem ?? ""} (where: ${issue.evidence ?? "not given"})`);
  }

  const audit = round === "audit";
  for (const id of contract.criteria) {
    const r = rows[id] ?? [];
    const paired = r.flatMap((x) => (x.artifact !== null && x.control !== null ? [{ judge: x.judge, gap: x.artifact - x.control }] : []));
    const families = new Set(paired.map((p) => contract.judges[p.judge] ?? "unknown")).size;
    // A criterion counts only when two judges from two model families scored both sides.
    const quorum = audit ? paired.length > 0 : paired.length >= 2 && families >= 2;
    if (!quorum) out.problems.push(`${id}: not enough judges (${paired.length} scored both sides, ${families} families)`);
    for (const side of ["artifact", "control"] as const) {
      const xs = r.flatMap((x) => (x[side] === null ? [] : [x[side]]));
      if (xs.length && Math.max(...xs) - Math.min(...xs) > 3)
        out.problems.push(`${id}: judges split on ${side === "artifact" ? "yours" : `the ${controlName(round)}`} (${xs.join(", ")}). The criterion may be vague.`);
    }
    out.criteria[id] = {
      artifact: median(r.flatMap((x) => (x.artifact === null ? [] : [x.artifact]))),
      control: median(r.flatMap((x) => (x.control === null ? [] : [x.control]))),
      gap: quorum ? median(paired.map((p) => p.gap)) : null, // median of each judge's own artifact-minus-control
      judges: paired.map((p) => p.judge),
    };
  }
  const gaps = contract.criteria.map((id) => out.criteria[id].gap);
  out.meanGap = gaps.every((g): g is number => g !== null) ? mean(gaps) : null;
  writeFileSync(scoresFile(round), `${JSON.stringify(out, null, 2)}\n`);
  return out;
}

function report(s: Scores) {
  const w = Math.max(9, ...contract.criteria.map((c) => c.length));
  console.log(`${"criterion".padEnd(w)}  yours     ${controlName(s.round).padEnd(11)}  gap       judges`);
  for (const id of contract.criteria) {
    const c = s.criteria[id];
    console.log(`${id.padEnd(w)}  ${fmt(c.artifact).padEnd(8)}  ${fmt(c.control).padEnd(11)}  ${fmt(c.gap, true).padEnd(8)}  ${c.judges.join(",")}`);
  }
  console.log(`mean gap: ${fmt(s.meanGap, true)}`);
  const section = (title: string, lines: string[]) => lines.length && console.log(`\n${title}\n${lines.map((l) => `- ${l}`).join("\n")}`);
  section(
    "failed checks on your side:",
    Object.entries(s.checkFails).map(([id, js]) => `${id}${isRequired(id) ? " [required]" : ""}: ${js.join(", ")}`),
  );
  section("check these against the evidence yourself before deciding:", s.toVerify);
  if (controlName(s.round) === "best so far") section("problems judges found in the best version so far:", s.onControl);
  section("judges' doubts about the rubric:", s.rubricFlags);
  section("problems:", s.problems);
}

function auditVerdicts(s: Scores) {
  console.log("\naudit, judged in both orders:");
  for (const id of contract.criteria) {
    const a = s.winners[id]?.AUD1;
    const b = s.winners[id]?.AUD2;
    const who = (r: Role | "tie") => (r === "artifact" ? "yours" : r === "control" ? controlName("audit") : r);
    console.log(`- ${id}: ${!a || !b ? "missing" : a === b ? who(a) : "flips with the order (unresolved)"}`);
  }
}

// Compare this round's gaps with the best round's. When the control already is the best
// version (no reference, or a confirm round), the baseline is a gap of zero.
function decide(now: Scores, prev: Scores | null) {
  const floor = contract.noiseFloor ?? 0.5;
  for (const t of targets) if (!contract.criteria.includes(t)) die(`unknown target "${t}"`);
  const reasons: string[] = [];
  let close = false;
  for (const id of contract.criteria) {
    const g = now.criteria[id].gap;
    const base = prev ? prev.criteria[id]?.gap : 0;
    if (g === null || base === null || base === undefined) {
      reasons.push(`${id}: nothing to compare`);
      continue;
    }
    const d = g - base;
    if (targets.includes(id) && d < floor) reasons.push(`${id}: targeted, moved ${fmt(d, true)}, needs +${floor.toFixed(1)}`);
    if (d < -floor) reasons.push(`${id}: got worse by ${fmt(-d)}`);
    if ((targets.includes(id) && Math.abs(d - floor) < 0.5) || Math.abs(d + floor) < 0.5) close = true;
    if (Math.abs(d) > 2) console.log(`\nsuspect: ${id} moved ${fmt(d, true)} in one round. Confirm your change explains it.`);
  }
  const baseMean = prev ? prev.meanGap : 0;
  if (now.meanGap === null || baseMean === null) reasons.push("mean gap unavailable");
  else if (now.meanGap < baseMean) reasons.push(`mean gap fell ${fmt(baseMean, true)} -> ${fmt(now.meanGap, true)}`);
  else if (!targets.length && now.meanGap === baseMean) reasons.push("no improvement");
  console.log(`\n${reasons.length ? `REVERT\n- ${reasons.join("\n- ")}` : "KEEP, unless you confirmed a blocker or a new required-check failure"}`);
  if (close && prev) console.log("close call: see references/extras.md before deciding");
}

// Where this round stands against the stop conditions.
function standing(now: Scores) {
  if (contract.reference && now.round !== "audit") {
    const r0 = now.round !== "00" && existsSync(scoresFile("00")) ? readJson<Scores>(scoresFile("00")) : null;
    for (const id of contract.criteria) {
      const was = r0?.criteria[id]?.control;
      const is = now.criteria[id].control;
      if (was != null && is != null && Math.abs(is - was) > 1)
        console.log(`drift: judges now score the reference's ${id} at ${fmt(is)}, it was ${fmt(was)} in round 0`);
    }
    const parity = now.meanGap !== null && now.meanGap >= 0 && contract.criteria.every((id) => (now.criteria[id].gap ?? -99) >= -0.5);
    console.log(`parity: ${parity ? "yes" : "no"}`);
  }
  const t = contract.target;
  if (t != null) {
    const f = contract.floor ?? t - 1;
    const medians = contract.criteria.map((id) => now.criteria[id].artifact);
    const met = medians.every((m): m is number => m !== null) && mean(medians) >= t && medians.every((m) => m >= f);
    console.log(`target ${t}, every criterion at least ${f}: ${met ? "met" : "not met"}`);
  }
}

function log(round: string, decision: string, note: string) {
  if (decision !== "keep" && decision !== "revert") die('usage: log <dir> <round> <keep|revert> "<what you tried>"');
  if (history().some((r) => r.round === round)) die(`round ${round} is already logged`);
  let sha = "-";
  try {
    sha = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {}
  const gap = existsSync(scoresFile(round)) ? fmt(readJson<Scores>(scoresFile(round)).meanGap, true) : "-";
  if (!existsSync(histFile)) writeFileSync(histFile, "round\tsha\tnote\tmean_gap\tdecision\n");
  appendFileSync(histFile, `${[round, sha, note.replace(/\s+/g, " ").trim() || "-", gap, decision].join("\t")}\n`);
  console.log(`logged round ${round}: ${decision}`);
  if (decision === "revert") console.log("if you committed this round, undo it so the working tree is the best version again: git revert --no-edit HEAD");
}

function status() {
  const rows = history();
  const kept = best();
  const rounds = entries(join(dir, "rounds"), false).filter((r) => /^\d+$/.test(r));
  let reverts = 0;
  for (const r of rows.toReversed()) {
    if (r.decision !== "revert") break;
    reverts++;
  }
  console.log(kept ? `best so far: round ${kept.round} (${kept.sha}), mean gap ${kept.meanGap}` : "best so far: none yet, round 0 isn't logged");
  console.log(`reverts in a row: ${reverts}${reverts >= 3 ? ". Stop with PLATEAU." : reverts === 2 ? ". Check that the remaining gaps are real before another round." : ""}`);
  const last = rounds.at(-1);
  if (last && !rows.some((r) => r.round === last)) {
    const replies = entries(join(rdir(last), "judges"), true).length;
    const has = (p: string) => (existsSync(join(rdir(last), p)) ? "yes" : "no");
    console.log(`unfinished: round ${last} (evidence ${has("evidence")}, packed ${has("mapping.json")}, replies ${replies}, scored ${has("scores.json")})`);
  } else console.log(`next round: ${String(last ? Number(last) + 1 : 0).padStart(2, "0")}`);

  const scored = rounds.filter((r) => existsSync(scoresFile(r)));
  if (!scored.length) return;
  const all = scored.map((r) => readJson<Scores>(scoresFile(r)));
  const reverted = new Set(rows.filter((r) => r.decision === "revert").map((r) => r.round));
  const head = scored.map((r) => `R${Number(r)}${reverted.has(r) ? " (reverted)" : ""}`);
  // The reference and gap columns describe the best round. Without a reference each round has
  // a different control, so only your own scores are comparable across rounds.
  const bestScores = contract.reference && kept && existsSync(scoresFile(kept.round)) ? readJson<Scores>(scoresFile(kept.round)) : null;
  const tail = (cells: string[]) => (bestScores ? ` ${cells.join(" | ")} |` : "");
  console.log(`\n| Criterion | ${head.join(" | ")} |${tail(["Reference", `Gap (R${Number(kept?.round)})`])}`);
  console.log(`| --- |${" --- |".repeat(scored.length + (bestScores ? 2 : 0))}`);
  for (const id of contract.criteria)
    console.log(`| ${id} | ${all.map((s) => fmt(s.criteria[id]?.artifact)).join(" | ")} |${tail([fmt(bestScores?.criteria[id]?.control), fmt(bestScores?.criteria[id]?.gap, true)])}`);
  console.log(`| mean gap | ${all.map((s) => fmt(s.meanGap, true)).join(" | ")} |${tail(["", fmt(bestScores?.meanGap, true)])}`);
}

function noise(a: string, b: string) {
  const A = readJson<Scores>(scoresFile(a));
  const B = readJson<Scores>(scoresFile(b));
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
  console.log(`set "noiseFloor": ${Math.max(0.5, max).toFixed(1)} in contract.json${max > 1 ? ". Above 1 the rubric is too vague to climb. Tighten the criteria that swung most and redo round 0." : ""}`);
}

switch (cmd) {
  case "pack": {
    const [round, control] = positional;
    if (!round) die("usage: pack <dir> <round> [control-dir] [--audit]");
    pack(round, control, args.includes("--audit") || round === "audit");
    break;
  }
  case "score": {
    const [round] = positional;
    if (!round) die("usage: score <dir> <round> [--targets id,id]");
    const s = score(round);
    report(s);
    const kept = best()?.round;
    if (round === "audit") auditVerdicts(s);
    else if (round.endsWith("-confirm") || (!contract.reference && kept)) decide(s, null);
    else if (contract.reference && kept && kept !== round && baseOf(round) !== kept) decide(s, readJson<Scores>(scoresFile(kept)));
    if (!baseOf(round)) standing(s);
    break;
  }
  case "log": {
    const [round, decision, ...note] = positional;
    if (!round || !decision) die('usage: log <dir> <round> <keep|revert> "<what you tried>"');
    log(round, decision, note.join(" "));
    break;
  }
  case "status":
    status();
    break;
  case "noise": {
    const [a, b] = positional;
    if (!a || !b) die("usage: noise <dir> <roundA> <roundB>");
    noise(a, b);
    break;
  }
  default:
    die(`unknown command "${cmd}"`);
}
