import type { Chart, Coverage, DataSource, Metric, Provenance, ReportData, Section, SourceKind, Story, UploadTemplate } from "../data/types";
import { datasets, type Row, type Rows } from "./datasets";
import { people, teams } from "./teams";

// Turns raw dataset rows into the report: every number, chart and note is computed here.
// Runs in the browser (sample rows, local dev) and in Apps Script (rows from Google Sheets),
// so it uses plain JavaScript only. Only totals come out; no row-level data is returned.

export type BuildOptions = { asOf: string; kinds?: Record<string, SourceKind> };

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
  const dateCols: Record<string, string> = { hub_checkins: "Date", packways: "Completed on", sbip_applicants: "Applied on" };
  const prov = (id: string): Provenance => ({
    kind: kindOf(id),
    label: ds(id).name,
    updatedBy: ds(id).owner,
    updatedOn: (dateCols[id] && latestDate(id, dateCols[id])) || asOf,
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
        bar("Students abroad by term", terms, perTerm),
        hbar("Program type", countBy(rows, "Program type")),
        hbar("Top destinations", countries.slice(0, 8)),
        bar("Students by number of global programs", ["1 program", "2 programs", "3 or more"], depth),
      ],
    };
  }

  // ----- Small Business Internship Program -----
  function internshipSection(): Section {
    const A = R("sbip_applicants");
    const E = R("sbip_employers");
    const base: Section = { id: "internships", title: "Small Business Internship Program", kicker: "Internships", owner: ds("sbip_applicants").owner, status: kindOf("sbip_applicants"), summary: "Internships with small and rural North Carolina businesses", metrics: [], charts: [] };
    if (!A.length) return base;
    const cohorts = sortTerms(A.map((r) => val(r, "Cohort")));
    const stats = cohorts.map((c) => {
      const rows = A.filter((r) => val(r, "Cohort") === c);
      return {
        c,
        applicants: rows.length,
        interviewed: rows.filter((r) => /interview|placed/i.test(val(r, "Status"))).length,
        placed: rows.filter((r) => /placed/i.test(val(r, "Status"))).length,
        rows,
      };
    });
    const latest = stats[stats.length - 1];
    const prev = stats[stats.length - 2];
    const done = [...stats].reverse().find((s) => s.placed > 0) ?? latest;
    const ch = prev ? change(latest.applicants, prev.applicants) : null;

    // Applications per week for the latest cohort.
    const dates = latest.rows.map((r) => parseDate(val(r, "Applied on"))).filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime());
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

    const emp = (c: string) => E.filter((r) => val(r, "Cohort") === c);
    const empLatest = emp(latest.c);
    const empDone = emp(done.c);
    const hosts = empDone.filter((r) => /host/i.test(val(r, "Status")));
    const ruralCounties = uniq(hosts.filter((r) => yes(val(r, "Rural"))).map((r) => val(r, "County")));

    const applicantsM = metric("i-applicants", "sbip_applicants", fmt(latest.applicants), `students applied for ${latest.c}`, ch !== null && prev ? { change: `${signed(ch)} vs ${prev.c}` } : {});
    const metrics = [
      applicantsM,
      metric("i-interviewed", "sbip_applicants", fmt(latest.interviewed), `invited to interview for ${latest.c}`),
      metric("i-placement", "sbip_applicants", `${pct(done.placed, done.applicants)}%`, `of ${done.c} applicants were placed (${done.placed})`),
    ];
    if (E.length) {
      metrics.push(
        metric("i-contacted", "sbip_employers", fmt(empLatest.length), `businesses contacted for ${latest.c}`),
        metric("i-hosts", "sbip_employers", fmt(hosts.length), `businesses hosted interns in ${done.c}`),
        metric("i-rural", "sbip_employers", String(ruralCounties.length), `rural counties with a host business, ${done.c}`),
      );
    }
    const charts: Chart[] = [
      {
        ...twoSeries("Applicants and placements by cohort", stats.map((s) => s.c), ["Applicants", stats.map((s) => s.applicants)], ["Placed", stats.map((s) => s.placed)], stats.map((s) => (s.placed ? String(s.placed) : "—"))),
        note: stats.some((s) => !s.placed) ? `Placements for ${stats.filter((s) => !s.placed).map((s) => s.c).join(", ")} are still in progress.` : undefined,
      },
      hbar(`Applicant funnel, ${done.c}`, [["Applied", done.applicants], ["Interviewed", done.interviewed], ["Placed", done.placed]], [done.applicants, done.interviewed, done.placed].map((n) => `${n} (${pct(n, done.applicants)}%)`)),
    ];
    if (weekVals.length) charts.push(bar(`Applications per week, ${latest.c}`, weekCats, weekVals));
    if (empLatest.length) {
      const interested = empLatest.filter((r) => /interest|host/i.test(val(r, "Status"))).length;
      const hosting = empLatest.filter((r) => /host/i.test(val(r, "Status"))).length;
      charts.push(hbar(`Employer outreach, ${latest.c}`, [["Contacted", empLatest.length], ["Interested", interested], ["Hosting", hosting]], [empLatest.length, interested, hosting].map((n) => `${n} (${pct(n, empLatest.length)}%)`)));
    }
    return { ...base, summary: `applied for ${latest.c} internships with small and rural businesses`, cardMetric: applicantsM, metrics, charts };
  }

  // ----- Practicum and certificates -----
  function practicumSection(): Section {
    const P = R("practicum");
    const S = R("sales_cert");
    const base: Section = { id: "practicum", title: "Practicum courses and certificates", kicker: "Practicum and certificates", owner: ds("practicum").owner, status: kindOf("practicum"), summary: "Client projects with business partners and the Sales Excellence Certificate", metrics: [], charts: [] };
    if (!P.length) return base;
    const terms = sortTerms(P.map((r) => val(r, "Term")));
    const t = terms.map((term) => {
      const rows = P.filter((r) => val(r, "Term") === term);
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

    const enrolledM = metric("p-enrolled", "practicum", fmt(latest.admitted), `students enrolled in practicum courses, ${latest.term}`);
    const metrics: Metric[] = [
      metric("p-apps", "practicum", fmt(latest.apps), `practicum applications, ${latest.term}`),
      enrolledM,
      metric("p-drop", "practicum", `${dropRate(latest)}%`, `of enrolled students dropped, ${latest.term}`, t.length > 1 ? { change: `${dropRate(latest) <= dropRate(first) ? "down" : "up"} from ${dropRate(first)}% in ${first.term}` } : {}),
      metric("p-run", "practicum", `${latest.run} of ${latest.offered}`, `courses ran, ${latest.term}`),
    ];
    const charts: Chart[] = [
      twoSeries("Applications and enrollment by term", terms, ["Applications", t.map((x) => x.apps)], ["Enrolled", t.map((x) => x.admitted)]),
      bar("Drop rate by term", terms, t.map(dropRate), {}, t.map((x) => `${dropRate(x)}%`)),
      hbar(`Applications by course, ${latest.term}`, latest.byCourse),
    ];
    if (S.length) {
      const cycles = sortTerms(S.map((r) => val(r, "Cycle")));
      const c = cycles.map((cy) => {
        const rows = S.filter((r) => val(r, "Cycle") === cy);
        const accepted = rows.filter((r) => yes(val(r, "Accepted")));
        const decided = accepted.filter((r) => val(r, "Completed") !== "");
        return { cy, apps: rows.length, accepted: accepted.length, completed: decided.filter((r) => yes(val(r, "Completed"))).length, decided: decided.length };
      });
      const cl = c[c.length - 1];
      const cd = [...c].reverse().find((x) => x.decided > 0);
      metrics.push(metric("s-accepted", "sales_cert", fmt(cl.accepted), `accepted to the Sales Excellence Certificate, ${cl.cy} (${pct(cl.accepted, cl.apps)}% of ${cl.apps} applicants)`));
      if (cd) metrics.push(metric("s-completed", "sales_cert", `${pct(cd.completed, cd.decided)}%`, `of ${cd.cy} certificate students completed it`));
      charts.push(twoSeries("Sales Excellence Certificate by cycle", cycles, ["Applicants", c.map((x) => x.apps)], ["Accepted", c.map((x) => x.accepted)]));
    }
    return { ...base, summary: `students enrolled in practicum courses in ${latest.term}, from ${fmt(latest.apps)} applications`, cardMetric: enrolledM, metrics, charts };
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
      const depth: [string, number][] = [["1 activity", v.filter((n) => n === 1).length], ["2 to 3", v.filter((n) => n >= 2 && n <= 3).length], ["4 to 5", v.filter((n) => n >= 4 && n <= 5).length], ["6 or more", v.filter((n) => n >= 6).length]];

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
        bar("Activity completions by month", monthKeys.map((k) => `${MONTHS[Number(k.slice(5)) - 1]} ’${k.slice(2, 4)}`), monthKeys.map((k) => months.get(k)!)),
        hbar(`Competency mix, ${ayLabel}`, comp, comp.map(([, n]) => `${pct(n, cur.length)}%`)),
        bar(`Students by activities completed, ${ayLabel}`, depth.map((d) => d[0]), depth.map((d) => d[1])),
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
      charts.push(hbar("Dean's Scholars completions by competency", totals.sort((a, b) => b[1] - a[1])));
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
        hbar("Industry mix", countBy(C, "Industry").slice(0, 8)),
      ],
    };
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
      ["internships", "Small Business Internship Program", R("sbip_applicants").filter((r) => /placed/i.test(val(r, "Status"))).map((r) => val(r, "Student key"))],
      ["practicum", "Practicum and certificates", [
        ...R("practicum").filter((r) => /enrol|complet/i.test(val(r, "Status"))).map((r) => val(r, "Student key")),
        ...R("sales_cert").filter((r) => yes(val(r, "Accepted"))).map((r) => val(r, "Student key")),
      ]],
      ["career", "Internships and co-ops", R("career").map((r) => val(r, "Student key"))],
    ];
    const perStudent = new Map<string, number>();
    const byArea = areaStudents.map(([id, label, keys]) => {
      const u = uniq(keys);
      for (const k of u) perStudent.set(k, (perStudent.get(k) ?? 0) + 1);
      return { id, label, n: u.length };
    });
    const counts = [...perStudent.values()];
    const sources = ["global", "sbip_applicants", "practicum", "sales_cert", "career"];
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
      source: "Stories form",
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

  const sections = [globalSection(), internshipSection(), practicumSection(), packwaysSection(), careerSection()];
  const hubData = hub();
  const cov = coverage();
  const multi = cov.byCount.slice(1).reduce((a, b) => a + b.n, 0);

  const areaLabel = (id: string) => sections.find((s) => s.id === id)?.kicker ?? (id === "hub" ? "The Hub" : id === "stories" ? "Stories" : "Settings");
  const templates: UploadTemplate[] = datasets.map((d) => ({ ...d, kind: kindOf(d.id), rows: R(d.id).length }));
  const sources: DataSource[] = datasets
    .filter((d) => d.id !== "settings")
    .map((d) => ({ name: d.name, owner: d.owner, feeds: areaLabel(d.area), kind: kindOf(d.id), howItGetsIn: d.cadence, lastUpdated: dateCols[d.id] ? latestDate(d.id, dateCols[d.id]) : undefined }));

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
