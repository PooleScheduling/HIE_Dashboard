import type { Chart, Coverage, DataSource, Metric, Provenance, ReportData, Section, SourceKind, Story, SurveySummary, UploadTemplate, WallDay, WallUsage } from "../data/types";
import { datasets, type Row, type Rows } from "./datasets";
import { people, teams } from "./teams";
import { COUNTY_TYPES, WALL_SCREENS, countyType, gicsSector, wallLabelHasName } from "./reference";

// Turns raw dataset rows into the report: every number, chart and note is computed here.
// Runs in the browser (sample rows, local dev) and in Apps Script (rows from Google Sheets),
// so it uses plain JavaScript only. Only totals come out; no row-level data is returned.

export type BuildOptions = { asOf: string; kinds?: Record<string, SourceKind>; links?: Record<string, string> };

// ---------- small helpers ----------
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const yes = (s?: string) => /^(y|yes|true|1)$/i.test(String(s ?? "").trim());
const val = (r: Row, k: string) => String(r[k] ?? "").trim();
const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))];
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}%`;
const change = (now: number, before: number) => (before ? Math.round(((now - before) / before) * 100) : null);
const pad = (n: number) => String(n).padStart(2, "0");
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const shortDate = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getDate()}`;

function parseDate(s: string): Date | null {
  const t = s.trim();
  if (!t) return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(t) ? new Date(t + "T12:00:00") : new Date(t);
  return isNaN(d.getTime()) ? null : d;
}

// "Fall 2026", "Summer 2027", "2026-27" → sortable numbers.
function termKey(t: string): number {
  const y = Number((/(\d{4})/.exec(t) ?? [0, 0])[1]);
  const season = /spring/i.test(t) ? 1 : /summer/i.test(t) ? 2 : /fall/i.test(t) ? 3 : 0;
  return y * 10 + season;
}
const sortTerms = (xs: string[]) => uniq(xs).sort((a, b) => termKey(a) - termKey(b));

function countBy(rows: Row[], key: string): [string, number][] {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = val(r, key);
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

// Joins rows that describe the same thing (e.g. one applicant read from two tabs), keeping
// every non-blank value.
function mergeRows(rows: Row[], key: (r: Row) => string): Row[] {
  const m = new Map<string, Row>();
  for (const r of rows) {
    const k = key(r);
    const prev = m.get(k);
    if (!prev) { m.set(k, { ...r }); continue; }
    for (const [c, v] of Object.entries(r)) if (v && !prev[c]) prev[c] = v;
  }
  return [...m.values()];
}

// Counts rows by a cleaned-up value (e.g. county → county type), dropping blanks.
function countMapped(rows: Row[], key: string, f: (v: string) => string): [string, number][] {
  return countBy(rows.map((r) => ({ v: f(val(r, key)) })), "v");
}
// County-type counts in a fixed order (Rural, Suburban, Urban, Outside NC), leaving out empty types.
function byCountyType(rows: Row[]): [string, number][] {
  const m = new Map(countMapped(rows, "County", countyType));
  return COUNTY_TYPES.filter((t) => m.get(t)).map((t) => [t, m.get(t)!]);
}

const bar = (title: string, categories: string[], values: number[], extra: Partial<Chart> = {}, labels?: string[]): Chart => ({
  title,
  categories,
  series: [{ name: extra.series?.[0]?.name ?? "Count", values, labels, emphasis: true }],
  ...extra,
  ...(extra.series ? {} : {}),
});
const hbar = (title: string, pairs: [string, number][], labels?: string[]): Chart => ({
  title,
  orientation: "horizontal",
  categories: pairs.map((p) => p[0]),
  series: [{ name: "Count", values: pairs.map((p) => p[1]), labels, emphasis: true }],
});
// Same data, a different picture: donut, funnel, treemap, rings, meter, dumbbell or line.
const as = (kind: Chart["kind"], c: Chart, extra: Partial<Chart> = {}): Chart => ({ ...c, kind, orientation: kind === "meter" || kind === "dumbbell" ? "horizontal" : undefined, ...extra });
const twoSeries = (title: string, categories: string[], a: [string, number[]], b: [string, number[]], bLabels?: string[]): Chart => ({
  title,
  categories,
  series: [
    { name: a[0], values: a[1] },
    { name: b[0], values: b[1], labels: bLabels, emphasis: true },
  ],
});

// ---------- the build ----------
export function buildReport(input: Rows, opts: BuildOptions): ReportData {
  const R = (id: string) => input[id] ?? [];
  const kinds = opts.kinds ?? {};
  const kindOf = (id: string): SourceKind => (R(id).length ? kinds[id] ?? "sample" : "waiting");
  const asOf = opts.asOf;
  const today = new Date(asOf + "T12:00:00");
  const ds = (id: string) => datasets.find((d) => d.id === id)!;

  const latestDate = (id: string, col: string) => {
    let best = "";
    for (const r of R(id)) {
      const d = parseDate(val(r, col));
      if (d) { const s = isoDay(d); if (s > best) best = s; }
    }
    return best || undefined;
  };
  const dateCols: Record<string, string> = { hub_checkins: "Date", packways: "Completed on", sbip_applicants: "Applied on", touchscreen: "Time" };
  const prov = (id: string): Provenance => ({
    kind: kindOf(id),
    label: ds(id).name,
    updatedBy: ds(id).owner,
    updatedOn: (dateCols[id] && latestDate(id, dateCols[id])) || asOf,
    ...(opts.links?.[id] && kindOf(id) !== "sample" ? { link: opts.links[id] } : {}),
  });
  const metric = (id: string, src: string, value: string, label: string, extra: Partial<Metric> = {}): Metric => ({ id, value, label, source: prov(src), ...extra });

  const settings = new Map(R("settings").map((r) => [val(r, "Setting").toLowerCase(), val(r, "Value")]));
  const enrollment = Number(String(settings.get("poole undergraduate enrollment") ?? "").replace(/,/g, "")) || 0;

  // ----- Global -----
  function globalSection(): Section {
    const rows = R("global");
    const base: Section = { id: "global", title: "Global programs", kicker: "Global", owner: ds("global").owner, status: kindOf("global"), summary: "Study abroad, exchanges, faculty-led programs and global internships", metrics: [], charts: [] };
    if (!rows.length) return base;
    const students = uniq(rows.map((r) => val(r, "Student key")));
    const terms = sortTerms(rows.map((r) => val(r, "Term")));
    const perTerm = terms.map((t) => uniq(rows.filter((r) => val(r, "Term") === t).map((r) => val(r, "Student key"))).length);
    const latest = terms[terms.length - 1];
    const sameSeason = terms.filter((t) => t !== latest && t.split(" ")[0] === latest.split(" ")[0]).pop();
    const latestN = perTerm[perTerm.length - 1];
    const prevN = sameSeason ? perTerm[terms.indexOf(sameSeason)] : 0;
    const ch = change(latestN, prevN);
    const countries = countBy(rows, "Country");
    const perStudent = new Map<string, number>();
    for (const r of rows) perStudent.set(val(r, "Student key"), (perStudent.get(val(r, "Student key")) ?? 0) + 1);
    const depth = [1, 2, 3].map((k) => [...perStudent.values()].filter((v) => (k === 3 ? v >= 3 : v === k)).length);

    const studentsM = metric("g-students", "global", fmt(students.length), "Poole students in a global program");
    return {
      ...base,
      summary: `students studied, interned or researched abroad across ${terms.length} terms`,
      cardMetric: studentsM,
      metrics: [
        studentsM,
        metric("g-share", "global", `${pct(students.length, enrollment)}%`, "of Poole undergraduates have gone abroad"),
        metric("g-latest", "global", fmt(latestN), `students abroad in ${latest}`, ch !== null && sameSeason ? { change: `${signed(ch)} vs ${sameSeason}` } : {}),
        metric("g-countries", "global", String(countries.length), "countries students went to"),
      ],
      charts: [
        as("line", bar("Students abroad by term", terms, perTerm)),
        as("donut", hbar("Program type", countBy(rows, "Program type"))),
        as("treemap", hbar("Top destinations", countries.slice(0, 12))),
        bar("Students by number of global programs", ["1 program", "2 programs", "3 or more"], depth),
      ],
    };
  }

  // ----- Small Business Internship Program -----
  function internshipSection(): Section {
    // Shows what the program's sheets record, as they record it: applications per cohort and the
    // first-round review columns (status, recommendations, decisions, scores) with their own labels.
    // Nothing is inferred about who was placed.
    const A = mergeRows(R("sbip_applicants"), (r) => `${val(r, "Cohort")}|${val(r, "Student key")}`);
    const E = R("sbip_employers");
    const base: Section = { id: "internships", title: "Small Business Internship Program", kicker: "Internships", owner: ds("sbip_applicants").owner, status: kindOf("sbip_applicants"), summary: "Internships with small and rural North Carolina businesses", metrics: [], charts: [] };
    if (!A.length) return base;
    const cohorts = sortTerms(A.map((r) => val(r, "Cohort")));
    const stats = cohorts.map((c) => ({ c, rows: A.filter((r) => val(r, "Cohort") === c), applicants: A.filter((r) => val(r, "Cohort") === c).length }));
    const latest = stats[stats.length - 1];
    // "This year" is the latest cohort whose summer has started; later ones are still recruiting.
    const yearOf = (c: string) => Number((/(\d{4})/.exec(c) ?? [0, "0"])[1]);
    const started = (c: string) => yearOf(c) < today.getFullYear() || (yearOf(c) === today.getFullYear() && today.getMonth() >= 4);
    const focus = [...stats].reverse().find((s) => started(s.c)) ?? latest;
    const before = stats[stats.indexOf(focus) - 1];
    const upcoming = stats.filter((s) => !started(s.c));
    const F = focus.rows;

    const fc = before ? change(focus.applicants, before.applicants) : null;
    const applicantsM = metric("i-applicants", "sbip_applicants", fmt(focus.applicants), `students applied for ${focus.c}`, fc !== null && before ? { change: `${signed(fc)} vs ${before.c}` } : {});
    const metrics: Metric[] = [applicantsM];
    const interview = F.filter((r) => /interview/i.test(val(r, "Status"))).length;
    if (interview) metrics.push(metric("i-interview", "sbip_applicants", fmt(interview), `marked "Interview" in the first-round review, ${focus.c}`));
    const scores = F.map((r) => Number(val(r, "Score"))).filter((n) => n > 0);
    if (scores.length) metrics.push(metric("i-score", "sbip_applicants", (scores.reduce((x, y) => x + y, 0) / scores.length).toFixed(1), `average application score, ${focus.c} (${scores.length} scored)`));
    for (const u of upcoming) metrics.push(metric(`i-next-${yearOf(u.c)}`, "sbip_applicants", fmt(u.applicants), `applications so far for ${u.c} (still open)`));
    if (E.length) {
      const latestEmp = cohortsOf(E).pop() ?? latest.c;
      const inLatest = E.filter((r) => val(r, "Cohort") === latestEmp);
      metrics.push(metric("i-contacted", "sbip_employers", fmt(inLatest.length), `businesses in the employer tracker for ${latestEmp}`));
    }

    // Applications per week for the most recent cohort.
    const dates = latest.rows.map((r) => parseDate(val(r, "Applied on"))).filter((d): d is Date => !!d).sort((x, y) => x.getTime() - y.getTime());
    const weekCats: string[] = [];
    const weekVals: number[] = [];
    if (dates.length) {
      const start = new Date(dates[0]);
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
      for (let w = new Date(start); w <= dates[dates.length - 1]; w.setDate(w.getDate() + 7)) {
        const end = new Date(w); end.setDate(end.getDate() + 7);
        weekCats.push(shortDate(w));
        weekVals.push(dates.filter((d) => d >= w && d < end).length);
      }
    }

    const charts: Chart[] = [{ ...bar("Applicants by cohort", stats.map((s) => s.c), stats.map((s) => s.applicants)), note: upcoming.length ? `${upcoming.map((u) => u.c).join(", ")} is still taking applications.` : undefined }];
    if (weekVals.length) charts.push(as("line", bar(`Applications per week, ${latest.c}`, weekCats, weekVals)));
    // The review columns, with the sheet's own labels.
    const review: [string, string][] = [["Status", "First-round status"], ["Recommendation", "Reviewer recommendations"], ["Decision", "Decisions"], ["Preliminary decline", "Preliminary decline?"]];
    for (const [col, title] of review) {
      const c = countBy(F, col);
      if (c.length) charts.push(as("donut", hbar(`${title}, ${focus.c}`, c.slice(0, 8))));
    }
    if (scores.length) {
      const byScore = countBy(scores.map((n) => ({ s: String(n) })), "s").sort((x, y) => Number(x[0]) - Number(y[0]));
      charts.push(bar(`Application scores, ${focus.c}`, byScore.map((x) => x[0]), byScore.map((x) => x[1])));
    }
    const heard = countBy(F.flatMap((r) => val(r, "Heard about").split(/,\s*(?=[A-Z])/).map((h) => ({ h: h.trim() }))), "h");
    if (heard.length) charts.push(as("treemap", hbar(`How applicants heard about the program, ${focus.c}`, heard.slice(0, 10))));
    const majors = countBy(F, "Major");
    if (majors.length) charts.push(as("treemap", hbar(`Applicants by major, ${focus.c}`, majors.slice(0, 12))));
    const standing = countBy(F, "Class standing");
    if (standing.length) charts.push(as("donut", hbar(`Class standing, ${focus.c}`, standing.slice(0, 6))));
    const ruralTies = countBy(F, "Rural connection");
    if (ruralTies.length) charts.push(as("donut", hbar(`Connection to a rural community, ${focus.c}`, ruralTies.slice(0, 6))));
    const region = countBy(F, "Region");
    if (region.length) charts.push(as("treemap", hbar(`Region, ${focus.c}`, region.slice(0, 10))));
    if (E.length) {
      const status = countBy(E, "Status");
      if (status.length) charts.push(as("donut", hbar("Employer tracker by status", status.slice(0, 8))));
      const typed = byCountyType(E);
      if (typed.length) charts.push({ ...as("donut", hbar("Businesses in the tracker by county type", typed)), note: "Only businesses whose location matches an NC county or town. County types follow the NC Rural Center's 2020 Census definitions." });
      const sec = countMapped(E, "Industry sector", gicsSector);
      if (sec.length) charts.push(as("treemap", hbar("Businesses in the tracker by industry sector", sec.slice(0, 12))));
    }
    return { ...base, summary: `applied for ${focus.c} internships with small and rural businesses${upcoming.length ? `; ${upcoming.map((u) => `${fmt(u.applicants)} so far for ${u.c}`).join(", ")}` : ""}`, cardMetric: applicantsM, metrics, charts };
    function cohortsOf(rows: Row[]) { return sortTerms(rows.map((r) => val(r, "Cohort")).filter((c) => /\d{4}/.test(c))); }
  }


  // ----- Program surveys (shown on the Internships page) -----
  // Each survey is summarized from its closed questions: before/after pairs, agree statements,
  // yes/no questions, ratings, rankings and hours. Open-ended answers never reach this point.
  function surveySummaries(): SurveySummary[] {
    const S = R("sbip_surveys");
    const num = (a: string) => { const m = /^(\d+(?:\.\d+)?)/.exec(a.trim()); return m ? Number(m[1]) : NaN; };
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    const short = (q: string, max = 64) => {
      let s = q.split("\n")[0].replace(/^the intern\s+/i, "").replace(/\s*throughout the internship\.?$/i, "").replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").replace(/[?.:]$/, "").trim();
      s = s.charAt(0).toUpperCase() + s.slice(1);
      return s.length > max ? s.slice(0, max - 1).replace(/\s+\S*$/, "") + "…" : s;
    };
    // Surveys are told apart by name and cohort (each summer's supervisor survey is its own).
    const keyOf = (r: Row) => `${val(r, "Survey")}\u0000${val(r, "Cohort")}`;
    const names = uniq(S.map(keyOf));
    const out = names.map((k, si): SurveySummary => {
      const rows = S.filter((r) => keyOf(r) === k);
      const name = val(rows[0], "Survey");
      const cohort = val(rows[0], "Cohort");
      const audience = val(rows[0], "Audience") || "Students";
      const responses = uniq(rows.map((r) => val(r, "Respondent"))).length;
      const id = `sv${si}`;
      const byQ = new Map<string, string[]>();
      for (const r of rows) {
        const q = val(r, "Question"), a = val(r, "Answer");
        if (q && a) byQ.set(q, [...(byQ.get(q) ?? []), a]);
      }
      const metrics: Metric[] = [metric(`${id}-n`, "sbip_surveys", fmt(responses), `${audience.toLowerCase()} responded${cohort ? `, ${cohort}` : ""}`)];
      const charts: Chart[] = [];
      const used = new Set<string>();

      // Matrix questions: "Skill [At the beginning]" / "Skill [Now]", or "Rank these [Item]".
      const groups = new Map<string, { label: string; q: string }[]>();
      for (const q of byQ.keys()) {
        const m = /^([\s\S]*?)\s*\[([^\]]+)\]\s*$/.exec(q);
        if (m) groups.set(m[1], [...(groups.get(m[1]) ?? []), { label: m[2], q }]);
      }
      const isStart = (l: string) => /begin|start|before|prior|\bpre\b/i.test(l);
      const isNow = (l: string) => /\bnow\b|\bend\b|after|\bpost\b/i.test(l);
      const pairs = [...groups].filter(([, ls]) => ls.length === 2 && ls.some((x) => isStart(x.label)) && ls.some((x) => isNow(x.label)));
      if (pairs.length) {
        const cats: string[] = [], before: number[] = [], after: number[] = [];
        let top = 0;
        for (const [base, ls] of pairs) {
          const b = byQ.get(ls.find((x) => isStart(x.label))!.q)!.map(num).filter((n) => !isNaN(n));
          const a = byQ.get(ls.find((x) => isNow(x.label))!.q)!.map(num).filter((n) => !isNaN(n));
          cats.push(short(base, 40)); before.push(Math.round(avg(b) * 10) / 10); after.push(Math.round(avg(a) * 10) / 10);
          top = Math.max(top, ...a, ...b);
          ls.forEach((x) => used.add(x.q));
        }
        const gain = avg(after.map((v, i) => v - before[i]));
        metrics.push(metric(`${id}-gain`, "sbip_surveys", `${gain >= 0 ? "+" : ""}${gain.toFixed(1)}`, `average gain in self-rated skills, on a ${top}-point scale`));
        charts.push(as("dumbbell", twoSeries(`Self-rated skills: at the start vs now (average, out of ${top})`, cats, ["At the start", before], ["Now", after], after.map((v) => v.toFixed(1))), { max: top }));
      }
      for (const [base, ls] of groups) {
        if (ls.length < 2 || ls.every((x) => used.has(x.q))) continue;
        const vals = ls.map((x) => ({ label: short(x.label, 40), xs: byQ.get(x.q)!.map(num).filter((n) => !isNaN(n)) }));
        if (vals.every((v) => !v.xs.length)) continue;
        const ranked = ls.some((x) => byQ.get(x.q)!.some((a) => /priority|rank|\d(st|nd|rd|th)\b/i.test(a)));
        const pairsList = vals.map((v) => [v.label, Math.round(avg(v.xs) * 10) / 10] as [string, number]).sort((a, b) => (ranked ? a[1] - b[1] : b[1] - a[1]));
        charts.push(hbar(ranked ? `${short(base, 48)} (average rank, 1 = top)` : `${short(base, 48)} (average)`, pairsList, pairsList.map(([, n]) => n.toFixed(1))));
        ls.forEach((x) => used.add(x.q));
      }

      const single = [...byQ].filter(([q]) => !used.has(q));
      const share = (xs: string[], re: RegExp) => pct(xs.filter((a) => re.test(a)).length, xs.length);
      const agree = single.filter(([, xs]) => share(xs, /agree/i) >= 60);
      if (agree.length) {
        const all = agree.flatMap(([, xs]) => xs);
        metrics.push(metric(`${id}-agree`, "sbip_surveys", `${share(all, /^strongly agree/i)}%`, `of ${audience.toLowerCase()}' ratings were "Strongly agree"`));
        const p = agree.map(([q, xs]) => [short(q, 140), share(xs, /^strongly agree/i)] as [string, number]).sort((a, b) => b[1] - a[1]);
        charts.push(as("meter", hbar(`Rated "Strongly agree" (% of ${audience.toLowerCase()})`, p, p.map(([, n]) => `${n}%`))));
        agree.forEach(([q]) => used.add(q));
      }
      const yesNo = single.filter(([q, xs]) => !used.has(q) && share(xs, /^(yes|no|unsure|maybe|not sure)\b/i) >= 80);
      if (yesNo.length) {
        const p = yesNo.map(([q, xs]) => [short(q, 140), share(xs, /^yes/i)] as [string, number]);
        charts.push(as("meter", hbar(`Answered "Yes" (% of ${audience.toLowerCase()})`, p, yesNo.map(([, xs]) => `${share(xs, /^yes/i)}% · ${xs.filter((a) => /^yes/i.test(a)).length} of ${xs.length}`))));
        const key = yesNo.find(([q]) => /full-?time/i.test(q)) ?? yesNo.find(([q]) => /another|again|future/i.test(q));
        if (key) metrics.push(metric(`${id}-yes`, "sbip_surveys", `${share(key[1], /^yes/i)}%`, /full-?time/i.test(key[0]) ? `would hire their intern full-time if a role opened` : `said yes: ${short(key[0], 80).toLowerCase()}`));
        yesNo.forEach(([q]) => used.add(q));
      }
      const numeric = single.filter(([q, xs]) => !used.has(q) && xs.filter((a) => !isNaN(num(a))).length >= xs.length * 0.8);
      const ratings: [string, number][] = [];
      const ratingLabels: string[] = [];
      for (const [q, xs] of numeric) {
        const ns = xs.map(num).filter((n) => !isNaN(n));
        if (/hours?\b/i.test(q) && /total/i.test(q)) metrics.push(metric(`${id}-hours`, "sbip_surveys", fmt(ns.reduce((a, b) => a + b, 0)), `hours of community service in total`));
        else if (/hours?\b/i.test(q)) metrics.push(metric(`${id}-hrs`, "sbip_surveys", String(Math.round(avg(ns))), /week/i.test(q) ? "hours a week, on average" : short(q, 60).toLowerCase() + " (average)"));
        else {
          const scale = Math.max(...ns) <= 5 ? 5 : 10;
          // Stored as a share of the scale so 1-5 and 1-10 questions sit on one list; the label keeps the real score.
          ratings.push([short(q, 140), Math.round((avg(ns) / scale) * 100)]);
          ratingLabels.push(`${avg(ns).toFixed(1)} / ${scale}`);
          if (/overall/i.test(q)) metrics.push(metric(`${id}-overall`, "sbip_surveys", `${avg(ns).toFixed(1)}/${scale}`, `average ${audience === "Supervisors" ? "rating of their intern's overall performance" : "overall rating"}`));
        }
        used.add(q);
      }
      if (ratings.length) {
        charts.push(as("meter", hbar("Average ratings", ratings, ratingLabels)));
      }
      for (const [q, xs] of single.filter(([q]) => !used.has(q)).slice(0, 3)) {
        const c = countBy(xs.map((a) => ({ a })), "a");
        if (c.length > 1) charts.push(as("donut", hbar(short(q), c.slice(0, 7))));
      }
      return { id, title: name, cohort, audience, responses, metrics: metrics.slice(0, 4), charts };
    });
    return out.sort((a, b) => termKey(b.cohort) - termKey(a.cohort) || a.title.localeCompare(b.title));
  }

  // ----- Sales Excellence Certificate (shown with practicum) -----
  // Acceptance and completion appear once the sheet records them; until then, applicants only.
  function salesPart(S: Row[]): { metrics: Metric[]; charts: Chart[]; summary: string } {
    if (!S.length) return { metrics: [], charts: [], summary: "" };
    const cycles = sortTerms(S.map((r) => val(r, "Cycle")));
    const c = cycles.map((cy) => {
      const rows = S.filter((r) => val(r, "Cycle") === cy);
      const accepted = rows.filter((r) => yes(val(r, "Accepted")));
      const decided = accepted.filter((r) => val(r, "Completed") !== "");
      return { cy, rows, apps: rows.length, accepted: accepted.length, completed: decided.filter((r) => yes(val(r, "Completed"))).length, decided: decided.length };
    });
    const cl = c[c.length - 1];
    const cd = [...c].reverse().find((x) => x.decided > 0);
    const hasDecisions = S.some((r) => val(r, "Accepted") !== "");
    const metrics: Metric[] = [hasDecisions
      ? metric("s-accepted", "sales_cert", fmt(cl.accepted), `accepted to the Sales Excellence Certificate, ${cl.cy} (${pct(cl.accepted, cl.apps)}% of ${cl.apps} applicants)`)
      : metric("s-applicants", "sales_cert", fmt(cl.apps), `students applied to the Sales Excellence Certificate, ${cl.cy}`)];
    if (cd) metrics.push(metric("s-completed", "sales_cert", `${pct(cd.completed, cd.decided)}%`, `of ${cd.cy} certificate students completed it`));
    const charts: Chart[] = [hasDecisions
      ? twoSeries("Sales Excellence Certificate by cycle", cycles, ["Applicants", c.map((x) => x.apps)], ["Accepted", c.map((x) => x.accepted)])
      : bar("Sales Excellence Certificate applicants by cycle", cycles, c.map((x) => x.apps))];
    const majors = countBy(cl.rows, "Major");
    if (majors.length) charts.push(as("donut", hbar(`Sales Excellence Certificate applicants by major, ${cl.cy}`, majors.slice(0, 7))));
    return { metrics, charts, summary: `students applied to the Sales Excellence Certificate in ${cl.cy}` };
  }

  // ----- Practicum and certificates -----
  function practicumSection(): Section {
    const P = R("practicum");
    const S = R("sales_cert");
    const base: Section = { id: "practicum", title: "Practicum courses and certificates", kicker: "Practicum and certificates", owner: ds("practicum").owner, status: kindOf("practicum"), summary: "Client projects with business partners and the Sales Excellence Certificate", metrics: [], charts: [] };
    if (!P.length) {
      const sales = salesPart(S);
      return sales.metrics.length ? { ...base, status: kindOf("sales_cert"), summary: sales.summary, cardMetric: sales.metrics[0], metrics: sales.metrics, charts: sales.charts } : base;
    }
    const isOpen = (r: Row) => /open/i.test(val(r, "Course type"));
    const terms = sortTerms(P.map((r) => val(r, "Term")));
    const t = terms.map((term) => {
      const rows = P.filter((r) => val(r, "Term") === term && !isOpen(r));
      const admitted = rows.filter((r) => /enrol|complet|drop/i.test(val(r, "Status")));
      const dropped = admitted.filter((r) => /drop/i.test(val(r, "Status"))).length;
      return {
        term,
        apps: rows.length,
        admitted: admitted.length,
        dropped,
        offered: uniq(rows.map((r) => val(r, "Course"))).length,
        run: uniq(admitted.map((r) => val(r, "Course"))).length,
        byCourse: countBy(rows, "Course"),
      };
    });
    const latest = t[t.length - 1];
    const first = t[0];
    const dropRate = (x: typeof latest) => pct(x.dropped, x.admitted);

    const openRows = P.filter(isOpen);
    const openEnrolled = (term: string) => openRows.filter((r) => val(r, "Term") === term && /enrol|complet/i.test(val(r, "Status"))).length;
    const enrolledM = metric("p-enrolled", "practicum", fmt(latest.admitted), `students enrolled in practicum courses, ${latest.term}`);
    const metrics: Metric[] = [
      metric("p-apps", "practicum", fmt(latest.apps), `practicum applications, ${latest.term}`),
      enrolledM,
      metric("p-drop", "practicum", `${dropRate(latest)}%`, `of enrolled students dropped, ${latest.term}`, t.length > 1 ? { change: `${dropRate(latest) <= dropRate(first) ? "down" : "up"} from ${dropRate(first)}% in ${first.term}` } : {}),
      metric("p-run", "practicum", `${latest.run} of ${latest.offered}`, `courses ran, ${latest.term}`),
    ];
    const charts: Chart[] = [
      as("line", twoSeries("Applications and enrollment by term", terms, ["Applications", t.map((x) => x.apps)], ["Enrolled", t.map((x) => x.admitted)])),
      as("line", bar("Drop rate by term (%)", terms, t.map(dropRate), {}, t.map((x) => `${dropRate(x)}%`))),
      as("treemap", hbar(`Applications by course, ${latest.term}`, latest.byCourse)),
    ];
    if (openRows.length) {
      charts.push(twoSeries("Students enrolled by course type", terms, ["Application courses", t.map((x) => x.admitted - x.dropped)], ["Open enrollment", terms.map(openEnrolled)]));
    }
    const sales = salesPart(S);
    metrics.push(...sales.metrics);
    charts.push(...sales.charts);
    return { ...base, summary: `students enrolled in practicum courses in ${latest.term}, from ${fmt(latest.apps)} applications`, cardMetric: enrolledM, metrics, charts };
  }

  // ----- Student Leadership -----
  function leadershipSection(): Section {
    const L = R("leadership");
    const base: Section = { id: "leadership", title: "Student Leadership", kicker: "Student Leadership", owner: ds("leadership").owner, status: kindOf("leadership"), summary: "Students on student organization executive boards", metrics: [], charts: [] };
    if (!L.length) return base;
    const years = sortTerms(L.map((r) => val(r, "Academic year")));
    const studentsIn = (y: string) => uniq(L.filter((r) => val(r, "Academic year") === y).map((r) => val(r, "Student key")));
    const latest = years[years.length - 1];
    const prev = years[years.length - 2];
    const now = studentsIn(latest);
    const before = prev ? studentsIn(prev) : [];
    const returning = now.filter((k) => before.includes(k)).length;
    const latestRows = L.filter((r) => val(r, "Academic year") === latest);
    const orgs = countBy(latestRows, "Organization");
    const officer = latestRows.filter((r) => /president|treasurer|secretary/i.test(val(r, "Role"))).length;
    const ch = prev ? change(now.length, before.length) : null;
    const studentsM = metric("l-students", "leadership", fmt(now.length), `students on executive boards, ${latest}`, ch !== null ? { change: `${signed(ch)} vs ${prev}` } : {});
    return {
      ...base,
      summary: `students held executive board roles in ${latest}, across ${orgs.length} organizations`,
      cardMetric: studentsM,
      metrics: [
        studentsM,
        metric("l-orgs", "leadership", String(orgs.length), `student organizations with an executive board on record, ${latest}`),
        metric("l-officers", "leadership", `${pct(officer, latestRows.length)}%`, "of board roles are officer roles (president, vice president, treasurer, secretary)"),
        ...(prev ? [metric("l-returning", "leadership", `${pct(returning, now.length)}%`, `of ${latest} board members also served in ${prev}`)] : []),
      ],
      charts: [
        bar("Students on executive boards by year", years, years.map((y) => studentsIn(y).length)),
        as("treemap", hbar(`Board roles by organization, ${latest}`, orgs.slice(0, 15))),
        as("donut", hbar(`Board roles by type, ${latest}`, countBy(latestRows, "Role"))),
      ],
    };
  }

  // ----- Packways and Dean's Scholars -----
  function packwaysSection(): Section {
    const K = R("packways");
    const D = R("deans_scholars");
    const base: Section = { id: "packways", title: "Poole Packways and Dean's Scholars", kicker: "Packways and Dean's Scholars", owner: "Student Leadership", status: kindOf("packways"), summary: "Competency activities tracked in Poole Packways", metrics: [], charts: [] };
    if (!K.length && !D.length) return base;
    const metrics: Metric[] = [];
    const charts: Chart[] = [];
    let card: Metric | undefined;
    let summary = base.summary;

    if (K.length) {
      const ayStart = new Date(today.getMonth() >= 7 ? today.getFullYear() : today.getFullYear() - 1, 7, 1);
      const lastYearStart = new Date(ayStart.getFullYear() - 1, 7, 1);
      const lastYearSameDay = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate(), 23, 59);
      const dated = K.map((r) => ({ r, d: parseDate(val(r, "Completed on")) })).filter((x): x is { r: Row; d: Date } => !!x.d);
      const cur = dated.filter((x) => x.d >= ayStart && x.d <= new Date(today.getTime() + 86400000)).map((x) => x.r);
      const prev = dated.filter((x) => x.d >= lastYearStart && x.d <= lastYearSameDay).map((x) => x.r);
      const ch = change(cur.length, prev.length);
      const active = uniq(cur.map((r) => val(r, "Student key")));
      const comp = countBy(cur, "Competency");
      const perStudent = new Map<string, number>();
      for (const r of cur) perStudent.set(val(r, "Student key"), (perStudent.get(val(r, "Student key")) ?? 0) + 1);
      const v = [...perStudent.values()];

      // Monthly totals across everything on record.
      const months = new Map<string, number>();
      for (const x of dated) {
        const k = `${x.d.getFullYear()}-${pad(x.d.getMonth() + 1)}`;
        months.set(k, (months.get(k) ?? 0) + 1);
      }
      const monthKeys = [...months.keys()].sort();
      const ayLabel = `${ayStart.getFullYear()}-${String(ayStart.getFullYear() + 1).slice(2)}`;

      card = metric("k-completions", "packways", fmt(cur.length), `Packways activity completions in ${ayLabel} so far`, ch !== null ? { change: `${signed(ch)} vs the same point last year` } : {});
      summary = `Packways activity completions in ${ayLabel} so far, by ${fmt(active.length)} students`;
      metrics.push(
        card,
        metric("k-active", "packways", fmt(active.length), "students completed at least one activity this year"),
        metric("k-depth", "packways", (cur.length / Math.max(1, active.length)).toFixed(1), "activities per active student"),
        metric("k-top", "packways", `${pct(comp[0]?.[1] ?? 0, cur.length)}%`, `of this year's completions are ${comp[0]?.[0] ?? "—"}`),
      );
      charts.push(
        as("line", bar("Activity completions by month", monthKeys.map((k) => `${MONTHS[Number(k.slice(5)) - 1]} ’${k.slice(2, 4)}`), monthKeys.map((k) => months.get(k)!))),
        as("donut", hbar(`Competency mix, ${ayLabel}`, comp)),
        as("funnel", hbar(`How far students go, ${ayLabel}`, [["1 or more activities", v.length], ["2 or more", v.filter((n) => n >= 2).length], ["4 or more", v.filter((n) => n >= 4).length], ["6 or more", v.filter((n) => n >= 6).length]])),
      );
    }
    if (D.length) {
      const comps = ["Beyond Business", "Interpersonal Communication", "Career Development", "Teamwork and Leadership"];
      const totals: [string, number][] = comps.map((c) => [c, D.reduce((a, r) => a + (Number(val(r, c)) || 0), 0)]);
      const jobs = D.filter((r) => yes(val(r, "Internship or campus job"))).length;
      const list = D.filter((r) => yes(val(r, "Dean's List"))).length;
      metrics.push(
        metric("d-jobs", "deans_scholars", `${jobs} of ${D.length}`, "Dean's Scholars with an internship or campus job"),
        metric("d-list", "deans_scholars", `${list} of ${D.length}`, "Dean's Scholars on the Dean's List"),
      );
      charts.push(as("donut", hbar("Dean's Scholars completions by competency", totals.sort((a, b) => b[1] - a[1]))));
      if (!card) { card = metric("d-total", "deans_scholars", fmt(totals.reduce((a, b) => a + b[1], 0)), "Dean's Scholars activity completions"); summary = "activity completions by Dean's Scholars"; }
    }
    return { ...base, summary, cardMetric: card, metrics, charts };
  }

  // ----- Career -----
  function careerSection(): Section {
    const C = R("career");
    const base: Section = { id: "career", title: "Career: internships and co-ops", kicker: "Career", owner: ds("career").owner, status: kindOf("career"), summary: "Internships and co-ops reported through the Career Center", metrics: [], charts: [] };
    if (!C.length) return base;
    const students = uniq(C.map((r) => val(r, "Student key")));
    const terms = sortTerms(C.map((r) => val(r, "Term")));
    const of = (term: string, type: RegExp) => C.filter((r) => val(r, "Term") === term && type.test(val(r, "Type"))).length;
    const lastSummer = terms.filter((t) => /summer/i.test(t)).pop();
    const coop = C.filter((r) => /co-?op/i.test(val(r, "Type"))).length;
    const paid = C.filter((r) => yes(val(r, "Paid"))).length;
    const studentsM = metric("c-students", "career", fmt(students.length), "students with an internship or co-op on record");
    return {
      ...base,
      summary: `students with an internship or co-op across ${terms.length} terms`,
      cardMetric: studentsM,
      metrics: [
        studentsM,
        ...(lastSummer ? [metric("c-summer", "career", fmt(C.filter((r) => val(r, "Term") === lastSummer).length), `internships and co-ops in ${lastSummer}`)] : []),
        metric("c-paid", "career", `${pct(paid, C.length)}%`, "of internships and co-ops were paid"),
        metric("c-coop", "career", `${pct(coop, C.length)}%`, "were co-ops rather than internships"),
      ],
      charts: [
        twoSeries("Internships and co-ops by term", terms, ["Co-ops", terms.map((t) => of(t, /co-?op/i))], ["Internships", terms.map((t) => of(t, /intern/i))]),
        as("treemap", hbar("Industry sector", countMapped(C, "Industry sector", gicsSector))),
        ...(countBy(C, "Functional area").length ? [as("donut", hbar("Functional area", countBy(C, "Functional area").slice(0, 7)))] : []),
        ...(byCountyType(C).length ? [{ ...as("donut", hbar("Where in North Carolina, by county type", byCountyType(C).filter(([t]) => t !== "Outside NC"))), note: "Only internships and co-ops with an NC county. County types follow the NC Rural Center's 2020 Census definitions." }] : []),
      ],
    };
  }

  // ----- HIE Wall Usage (touchscreen wall) -----
  // Mirrors the wall's own stats page: a visit is one screen's visit ID, counted on the day
  // and hour of its first tap. Only per-day totals leave here.
  function wall(): WallUsage | undefined {
    const T = R("touchscreen");
    const days = new Map<string, WallDay>();
    const day = (k: string) => {
      let d = days.get(k);
      if (!d) days.set(k, (d = { date: k, visits: [0, 0, 0], taps: [0, 0, 0], hours: Array(24).fill(0) as number[], depth: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], tops: [{}, {}, {}], qr: {} }));
      return d;
    };
    const visits = new Map<string, { s: number; first: Date; n: number }>();
    for (const r of T) {
      const d = parseDate(val(r, "Time"));
      if (!d) continue;
      const label = val(r, "Label");
      if (/qr/i.test(val(r, "Type"))) {
        const q = day(isoDay(d)).qr;
        q[label] = (q[label] ?? 0) + 1;
        continue;
      }
      const s = WALL_SCREENS.indexOf(val(r, "Screen").toLowerCase());
      if (s < 0) continue;
      const dd = day(isoDay(d));
      dd.taps[s]++;
      if (label && !wallLabelHasName(label)) dd.tops[s][label] = (dd.tops[s][label] ?? 0) + 1;
      const id = `${s}:${val(r, "Visit") || isoDay(d) + d.getHours()}`;
      const v = visits.get(id);
      if (!v) visits.set(id, { s, first: d, n: 1 });
      else { v.n++; if (d < v.first) v.first = d; }
    }
    for (const v of visits.values()) {
      const dd = day(isoDay(v.first));
      dd.visits[v.s]++;
      dd.hours[v.first.getHours()]++;
      dd.depth[v.s][v.n === 1 ? 0 : v.n < 5 ? 1 : 2]++;
    }
    if (!days.size) return undefined;
    return { days: [...days.values()].sort((a, b) => (a.date < b.date ? -1 : 1)), source: prov("touchscreen") };
  }

  // ----- The Hub -----
  function hub(): ReportData["hub"] {
    const src = prov("hub_checkins");
    const empty: Chart = { title: "Kiosk check-ins per week", categories: [], series: [{ name: "Check-ins", values: [], emphasis: true }] };
    const dates = R("hub_checkins").map((r) => parseDate(val(r, "Date"))).filter((d): d is Date => !!d);
    if (!dates.length) return { weekly: empty, hourly: { ...empty, title: "When students come in" }, metrics: [], owner: "Student Leadership" };
    const weekStart = (d: Date) => { const m = new Date(d.getFullYear(), d.getMonth(), d.getDate()); m.setDate(m.getDate() - ((m.getDay() + 6) % 7)); return m; };
    const weeks = new Map<string, number>();
    const hours = Array(24).fill(0) as number[];
    const days = Array(7).fill(0) as number[];
    let first = dates[0];
    for (const d of dates) {
      const k = isoDay(weekStart(d));
      weeks.set(k, (weeks.get(k) ?? 0) + 1);
      hours[d.getHours()]++;
      days[(d.getDay() + 6) % 7]++;
      if (d < first) first = d;
    }
    const keys = [...weeks.keys()].sort();
    const filled: [string, number][] = [];
    for (let w = new Date(keys[0] + "T12:00:00"); isoDay(w) <= keys[keys.length - 1]; w.setDate(w.getDate() + 7)) filled.push([shortDate(w), weeks.get(isoDay(w)) ?? 0]);
    const used = hours.map((n, h) => [h, n]).filter(([, n]) => n > 0);
    const lo = used[0][0], hi = used[used.length - 1][0];
    const hourCats: string[] = [], hourVals: number[] = [];
    for (let h = lo; h <= hi; h++) { hourCats.push(h === 12 ? "12p" : h > 12 ? `${h - 12}p` : `${h}a`); hourVals.push(hours[h]); }
    const dayIdx = days.map((n, i) => [i, n]).filter(([, n]) => n > 0).map(([i]) => i);
    const peakWeek = filled.reduce((a, b) => (b[1] > a[1] ? b : a));
    const peakHour = hours.indexOf(Math.max(...hours));
    const peakDay = days.indexOf(Math.max(...days));
    const zero = filled.filter((w) => w[1] === 0).map((w) => w[0]);
    return {
      owner: "Student Leadership",
      weekly: { title: "Kiosk check-ins per week", categories: filled.map((w) => w[0]), series: [{ name: "Check-ins", values: filled.map((w) => w[1]), emphasis: true }], note: zero.length ? `No check-ins were recorded the week of ${zero.join(", ")}.` : undefined },
      hourly: { title: "When students come in", categories: hourCats, series: [{ name: "Check-ins", values: hourVals, emphasis: true }] },
      weekday: { title: "Check-ins by day of the week", categories: dayIdx.map((i) => DAYS[i]), series: [{ name: "Check-ins", values: dayIdx.map((i) => days[i]), emphasis: true }] },
      metrics: [
        { id: "hub-taps", value: fmt(dates.length), label: `kiosk check-ins since ${shortDate(first)}`, source: src },
        { id: "hub-peak-week", value: String(peakWeek[1]), label: `busiest week (${peakWeek[0]})`, source: src },
        { id: "hub-peak-hour", value: peakHour === 12 ? "12 pm" : peakHour > 12 ? `${peakHour - 12} pm` : `${peakHour} am`, label: "busiest hour of the day", source: src },
        { id: "hub-peak-day", value: DAYS[peakDay], label: `busiest weekday (${days[peakDay]} check-ins)`, source: src },
      ],
    };
  }

  // ----- Progress toward the goal -----
  function coverage(): Coverage {
    const areaStudents: [string, string, string[]][] = [
      ["global", "Global programs", R("global").map((r) => val(r, "Student key"))],
      // Interns: applicants marked placed, plus students who answered a program survey with their email.
      ["internships", "Small Business Internship Program", [
        ...R("sbip_applicants").filter((r) => /placed/i.test(val(r, "Status"))).map((r) => val(r, "Student key")),
        ...R("sbip_surveys").filter((r) => val(r, "Audience") === "Students").map((r) => val(r, "Student key")),
      ]],
      ["practicum", "Practicum and certificates", [
        ...R("practicum").filter((r) => /enrol|complet/i.test(val(r, "Status"))).map((r) => val(r, "Student key")),
        ...R("sales_cert").filter((r) => yes(val(r, "Accepted"))).map((r) => val(r, "Student key")),
      ]],
      ["leadership", "Student Leadership", R("leadership").map((r) => val(r, "Student key"))],
      ["career", "Internships and co-ops", R("career").map((r) => val(r, "Student key"))],
    ];
    const perStudent = new Map<string, number>();
    const byArea = areaStudents.map(([id, label, keys]) => {
      const u = uniq(keys);
      for (const k of u) perStudent.set(k, (perStudent.get(k) ?? 0) + 1);
      return { id, label, n: u.length };
    });
    const counts = [...perStudent.values()];
    const sources = ["global", "sbip_applicants", "sbip_surveys", "practicum", "sales_cert", "leadership", "career"];
    const kind: SourceKind = sources.some((s) => kindOf(s) === "sample") ? "sample" : sources.some((s) => kindOf(s) === "live") ? "live" : "upload";
    return {
      students: perStudent.size,
      enrollment,
      byCount: [
        { label: "1 HIE", n: counts.filter((n) => n === 1).length },
        { label: "2 HIEs", n: counts.filter((n) => n === 2).length },
        { label: "3 or more", n: counts.filter((n) => n >= 3).length },
      ],
      byArea,
      source: { kind, label: "All program datasets", updatedBy: "HIE Office", updatedOn: asOf },
    };
  }

  // ----- Stories -----
  const stories: Story[] = R("stories")
    .filter((r) => val(r, "Quote") && /^(true|yes|y|1)$/i.test(val(r, "Approved")))
    .map((r, i) => ({
      id: `story-${i}`,
      quote: val(r, "Quote"),
      program: val(r, "Program") || "Other",
      audience: (["Student", "Employer", "Faculty"].includes(val(r, "Audience")) ? val(r, "Audience") : "Student") as Story["audience"],
      attribution: val(r, "Attribution") || val(r, "Audience"),
      source: val(r, "Source") || "Stories tab",
    }));

  // ----- Data notes: automatic checks on the incoming rows -----
  function dataNotes(hubWeekly: Chart): string[] {
    const notes: string[] = [];
    for (const d of datasets) {
      const rows = R(d.id);
      if (!rows.length || d.id === "stories" || d.id === "settings") continue;
      for (const c of d.columns.filter((c) => !c.optional)) {
        const blank = rows.filter((r) => val(r, c.name) === "").length;
        if (blank) notes.push(`${d.name}: ${blank} ${blank === 1 ? "row has" : "rows have"} no ${c.name}.`);
      }
    }
    if (hubWeekly.note) notes.push(`The Hub: ${hubWeekly.note.charAt(0).toLowerCase()}${hubWeekly.note.slice(1)}`);
    const sample = datasets.filter((d) => kindOf(d.id) === "sample").map((d) => d.name);
    if (sample.length) notes.push(`Sample rows are standing in for: ${sample.join(", ")}.`);
    if (!enrollment) notes.push("Poole undergraduate enrollment isn't set, so the share of students with an HIE can't be worked out.");
    return notes;
  }

  const surveys = surveySummaries();
  const sections = [globalSection(), internshipSection(), practicumSection(), leadershipSection(), packwaysSection(), careerSection()]
    .map((s) => (s.id === "internships" && surveys.length ? { ...s, surveys } : s));
  const hubData = hub();
  const cov = coverage();
  const multi = cov.byCount.slice(1).reduce((a, b) => a + b.n, 0);

  const areaLabel = (id: string) => sections.find((s) => s.id === id)?.kicker ?? (id === "hub" ? "The Hub" : id === "wall" ? "HIE Wall Usage" : id === "stories" ? "Stories" : "Settings");
  const templates: UploadTemplate[] = datasets.map((d) => ({ ...d, kind: kindOf(d.id), rows: R(d.id).length }));
  const sources: DataSource[] = datasets
    .filter((d) => d.id !== "settings")
    .map((d) => {
      const type = d.id === "touchscreen" ? "Live feed" : d.cadence === "Live" ? "Live sheet" : "File upload";
      return { id: d.id, dataset: d.id, name: d.name, owner: d.owner, feeds: areaLabel(d.area), kind: kindOf(d.id), howItGetsIn: type, type, link: opts.links?.[d.id], lastUpdated: dateCols[d.id] ? latestDate(d.id, dateCols[d.id]) : undefined };
    });

  return {
    title: "Poole HIE Engagement Report",
    goal: "Every Poole student completes at least one high-impact experience by graduation.",
    intro: "Worked out from each program's own records, and updated as they change.",
    asOf,
    headline: [
      { id: "cov-students", value: fmt(cov.students), label: "Poole students with at least one high-impact experience on record", source: cov.source },
      { id: "cov-share", value: `${pct(cov.students, cov.enrollment)}%`, label: `of Poole undergraduates (${fmt(cov.enrollment)}) so far`, source: cov.source },
      { id: "cov-multi", value: fmt(multi), label: "students with two or more high-impact experiences", source: cov.source },
    ],
    sections,
    hub: hubData,
    wall: wall(),
    teams,
    people,
    stories,
    featuredStoryId: stories[0]?.id,
    sources,
    templates,
    openIssues: dataNotes(hubData.weekly),
    coverage: cov,
  };
}
