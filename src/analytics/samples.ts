import type { Row, Rows } from "./datasets";
import { FUNCTIONAL_AREAS, NC_COUNTIES, NC_SUBURBAN, NC_URBAN, OTHER_SECTOR } from "./reference";

// Sample rows for every dataset, generated in code (no data files in the repo).
// They follow what program teams have told us about volumes and patterns, but the
// rows themselves are made up: student keys are random, not real students.
// When a team's real data is connected, it replaces that dataset's sample rows.

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20261023);
const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
const weighted = <T,>(pairs: [T, number][]) => {
  const total = pairs.reduce((a, [, w]) => a + w, 0);
  let r = rand() * total;
  for (const [v, w] of pairs) if ((r -= w) <= 0) return v;
  return pairs[pairs.length - 1][0];
};
function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const pad = (n: number, w = 2) => String(n).padStart(w, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const dayBetween = (a: string, b: string) => {
  const s = new Date(a + "T12:00:00"), e = new Date(b + "T12:00:00");
  return iso(addDays(s, int(0, Math.round((e.getTime() - s.getTime()) / 86400000))));
};
const POOL = 3000;
const student = () => `S-${pad(int(1, POOL), 4)}`;
const repeat = (n: number, f: (i: number) => Row) => Array.from({ length: n }, (_, i) => f(i));

// Hub kiosk: matches the real kiosk sheet's weekly, hourly and weekday totals for fall 2026.
function hub(): Row[] {
  const weekly = [1, 6, 10, 5, 4, 0, 13, 13, 38, 47, 16];
  const hourCounts = [4, 1, 12, 5, 16, 13, 15, 32, 9, 27, 9, 8, 2]; // 7 am to 7 pm
  const dayCounts = [24, 30, 53, 28, 18]; // Mon to Fri
  const hours = shuffle(hourCounts.flatMap((n, i) => Array(n).fill(7 + i) as number[]));
  const days = shuffle(dayCounts.flatMap((n, i) => Array(n).fill(i) as number[]));
  const firstMonday = new Date(2026, 7, 10);
  const rows: Row[] = [];
  let k = 0;
  weekly.forEach((n, w) => {
    for (let j = 0; j < n; j++, k++) {
      const day = w === 0 ? 2 : days[k];
      const d = addDays(firstMonday, w * 7 + day);
      rows.push({ Date: `${iso(d)}T${pad(hours[k])}:${pad(int(0, 59))}:00` });
    }
  });
  return rows;
}

const competencies: [string, string[], number][] = [
  ["Beyond Business", ["Service day", "Wellness workshop", "Cultural event", "Speaker series"], 32],
  ["Interpersonal Communication", ["Networking night", "Presentation workshop", "Peer mentoring"], 27],
  ["Career Development", ["Resume review", "Mock interview", "Career fair", "Employer info session"], 24],
  ["Teamwork and Leadership", ["Leadership workshop", "Case competition", "Student org meeting"], 17],
];

function packways(): Row[] {
  // Monthly completions, Aug 2025 to Oct 2026 (fall 2026 is partial through Oct 23).
  const months = [55, 120, 140, 95, 35, 90, 150, 165, 105, 20, 12, 15, 210, 330, 290];
  const active = Array.from({ length: 900 }, student);
  const rows: Row[] = [];
  months.forEach((n, m) => {
    const y = 2025 + Math.floor((7 + m) / 12);
    const mo = (7 + m) % 12;
    const last = m === months.length - 1 ? 23 : new Date(y, mo + 1, 0).getDate();
    for (let i = 0; i < n; i++) {
      const [comp, acts] = weighted(competencies.map(([c, a, w]) => [[c, a] as [string, string[]], w]));
      rows.push({
        "Student key": active[Math.floor(Math.pow(rand(), 1.6) * active.length)],
        Activity: pick(acts),
        Competency: comp,
        "Completed on": `${y}-${pad(mo + 1)}-${pad(int(1, last))}`,
        Level: String(weighted([[1, 5], [2, 3], [3, 2]])),
      });
    }
  });
  return rows;
}

// Dean's Scholars: 10 scholars; totals match the DSP sheet (51, 42, 31, 25).
function deansScholars(): Row[] {
  const totals = [51, 42, 31, 25];
  const counts = Array.from({ length: 10 }, () => [0, 0, 0, 0]);
  totals.forEach((t, c) => { for (let i = 0; i < t; i++) counts[int(0, 9)][c]++; });
  const jobs = shuffle([1, 1, 1, 1, 1, 0, 0, 0, 0, 0]);
  const list = shuffle([1, 1, 1, 1, 0, 0, 0, 0, 0, 0]);
  return counts.map((c, i) => ({
    "Student key": student(),
    "Beyond Business": String(c[0]),
    "Interpersonal Communication": String(c[1]),
    "Career Development": String(c[2]),
    "Teamwork and Leadership": String(c[3]),
    "Internship or campus job": jobs[i] ? "Yes" : "No",
    "Dean's List": list[i] ? "Yes" : "No",
  }));
}

// Small businesses mostly hire interns for marketing, operations and sales work.
const smallBizRoles: [string, number][] = [["Marketing", 30], ["Operations and supply chain", 18], ["Sales", 14], ["Finance", 10], ["Accounting", 8], ["Management and strategy", 8], ["Human resources", 5], ["Information systems and analytics", 4], ["Entrepreneurship", 3]];

// Small Business Internship Program: applicants 23 → 57 → 110; placed 11 → 15; summer 2027 interviews under way.
function sbipApplicants(): Row[] {
  const cohorts: [string, number, number, number, string, string][] = [
    ["Summer 2025", 23, 16, 11, "2024-10-01", "2025-01-31"],
    ["Summer 2026", 57, 30, 15, "2025-09-01", "2026-01-31"],
    ["Summer 2027", 110, 41, 0, "2026-09-01", "2026-10-22"],
  ];
  return cohorts.flatMap(([cohort, n, interviewed, placed, from, to]) =>
    repeat(n, (i) => ({
      Cohort: cohort,
      "Student key": student(),
      "Applied on": dayBetween(from, to),
      Status: i < placed ? "Placed" : i < interviewed ? "Interviewed" : "Applied",
      "Functional area": i < placed ? weighted(smallBizRoles) : "",
    })),
  );
}

const rural = NC_COUNTIES.filter((c) => !NC_URBAN.includes(c) && !NC_SUBURBAN.includes(c));
const nearbyRural = ["Wilson", "Nash", "Edgecombe", "Harnett", "Sampson", "Duplin", "Wayne", "Lenoir", "Halifax", "Warren", "Vance", "Granville", "Person", "Caswell", "Robeson", "Bladen", "Columbus", "Lee", "Moore", "Richmond", "Hoke", "Montgomery", "Franklin", "Chatham"];
const smallBizSectors: [string, number][] = [["Consumer Discretionary", 24], ["Industrials", 20], ["Consumer Staples", 14], ["Financials", 10], ["Health Care", 9], ["Real Estate", 7], ["Information Technology", 6], ["Materials", 4], ["Communication Services", 3], ["Energy", 1], ["Utilities", 1], [OTHER_SECTOR, 6]];

function sbipEmployers(): Row[] {
  let e = 0;
  const make = (cohort: string, contacted: number, interested: number, hosting: number, hostCounties: string[]) =>
    repeat(contacted, (i) => {
      const host = i < hosting;
      const r = rand();
      const county = host ? hostCounties[i % hostCounties.length] : r < 0.6 ? pick(rand() < 0.7 ? nearbyRural : rural) : r < 0.85 ? pick(NC_SUBURBAN) : pick(NC_URBAN);
      return {
        Cohort: cohort,
        "Employer key": `E-${pad(++e, 3)}`,
        County: county,
        "Industry sector": weighted(smallBizSectors),
        Status: host ? "Hosting" : i < interested ? "Interested" : "Contacted",
      };
    });
  return [
    ...make("Summer 2026", 120, 30, 18, shuffle(nearbyRural).slice(0, 11)),
    ...make("Summer 2027", 300, 45, 6, shuffle(nearbyRural).slice(0, 5)),
  ];
}

const courses = ["Supply chain", "Marketing analytics", "Business analytics", "Sales", "Finance", "Entrepreneurship", "HR consulting", "Accounting advisory"].map((c) => `${c} practicum`);

function practicum(): Row[] {
  const terms: [string, number, number, boolean][] = [
    ["Fall 2025", 118, 10, true],
    ["Spring 2026", 124, 6, true],
    ["Fall 2026", 121, 4, false],
  ];
  return terms.flatMap(([term, apps, drops, done]) => {
    const run = shuffle(courses).slice(0, int(4, 5));
    const demand = courses.map((c) => [c, run.includes(c) ? 3 : 1] as [string, number]);
    let dropped = 0;
    return repeat(apps, () => {
      const course = weighted(demand);
      const admitted = run.includes(course) && rand() < 0.62;
      let status = "Applied";
      if (admitted) {
        status = dropped < drops && rand() < 0.2 ? "Dropped" : done ? "Completed" : "Enrolled";
        if (status === "Dropped") dropped++;
      }
      return { Term: term, Course: course, "Student key": student(), Status: status, "Course type": "Application" };
    }).concat(repeat(int(16, 22), () => ({
      Term: term,
      Course: "Business analytics honors practicum",
      "Student key": student(),
      Status: done ? "Completed" : "Enrolled",
      "Course type": "Open enrollment",
    })));
  });
}

function salesCert(): Row[] {
  return [
    ...repeat(32, (i) => ({ Cycle: "2025-26", "Student key": student(), Accepted: "Yes", Completed: i < 27 ? "Yes" : "No" })),
    ...repeat(40, (i) => ({ Cycle: "2026-27", "Student key": student(), Accepted: i < 37 ? "Yes" : "No", Completed: "" })),
  ];
}

const countries: [string, number][] = [["Spain", 16], ["Italy", 14], ["United Kingdom", 12], ["Ireland", 8], ["France", 7], ["Germany", 6], ["Czech Republic", 5], ["Netherlands", 5], ["Japan", 5], ["South Korea", 4], ["Australia", 4], ["Costa Rica", 4], ["Denmark", 3], ["Chile", 2], ["South Africa", 2]];

function global(): Row[] {
  const terms: [string, number][] = [["Fall 2025", 150], ["Spring 2026", 190], ["Summer 2026", 230], ["Fall 2026", 140]];
  return terms.flatMap(([term, n]) =>
    repeat(n, () => ({
      Term: term,
      "Student key": student(),
      "Program type": weighted(term.startsWith("Summer")
        ? [["Faculty-led", 60], ["Global internship", 25], ["IBDD", 5], ["Hamilton Scholars", 10]]
        : [["Semester exchange", 70], ["Faculty-led", 15], ["IBDD", 10], ["Hamilton Scholars", 5]]),
      Country: weighted(countries),
    })),
  );
}

function career(): Row[] {
  const terms: [string, number][] = [["Summer 2025", 180], ["Fall 2025", 40], ["Spring 2026", 45], ["Summer 2026", 210], ["Fall 2026", 50]];
  const sectors: [string, number][] = [["Financials", 24], ["Industrials", 18], ["Information Technology", 16], ["Consumer Discretionary", 11], ["Health Care", 9], ["Consumer Staples", 7], ["Real Estate", 5], ["Communication Services", 4], ["Materials", 2], ["Energy", 2], ["Utilities", 2], [OTHER_SECTOR, 8]];
  const counties: [string, number][] = [["Wake", 45], ["Mecklenburg", 20], ["Durham", 12], ["Guilford", 4], ["Forsyth", 3], ["Johnston", 3], ["Orange", 3], ["Cabarrus", 2], ["Buncombe", 2], ["Wilson", 1], ["Harnett", 1], ["Nash", 1], ["Lee", 1], ["Chatham", 1], ["Franklin", 1]];
  return terms.flatMap(([term, n]) =>
    repeat(n, () => ({
      Term: term,
      "Student key": student(),
      Type: rand() < (term.startsWith("Summer") ? 0.08 : 0.45) ? "Co-op" : "Internship",
      "Industry sector": weighted(sectors),
      "Functional area": weighted(FUNCTIONAL_AREAS.map((f, i) => [f, [14, 22, 16, 12, 15, 5, 10, 4, 2][i] ?? 3] as [string, number])),
      County: rand() < 0.72 ? weighted(counties) : "",
      Paid: rand() < 0.84 ? "Yes" : "No",
    })),
  );
}

// Student organization executive boards: about 15 organizations, 4 to 7 board roles each.
const orgs = ["Finance Club", "Marketing Club", "Accounting Society", "Supply Chain Club", "Entrepreneurship Club", "Business Analytics Club", "Economics Society", "Women in Business", "Sales Club", "Investment Club", "Real Estate Club", "Consulting Club", "Human Resources Club", "Information Systems Club", "Business Student Council"];
function leadership(): Row[] {
  const officers = ["President", "Vice president", "Treasurer", "Secretary"];
  let returning: string[] = [];
  return ["2024-25", "2025-26", "2026-27"].flatMap((year) => {
    const rows = orgs.flatMap((org) =>
      [...officers, ...Array(int(0, 3)).fill("Executive board member") as string[]].map((role) => ({
        "Academic year": year,
        "Student key": returning.length && rand() < 0.25 ? returning.splice(int(0, returning.length - 1), 1)[0] : student(),
        Organization: org,
        Role: role,
      })),
    );
    returning = rows.map((r) => r["Student key"]);
    return rows;
  });
}

function stories(): Row[] {
  const s = (Quote: string, Program: string, Audience: string, Attribution: string) => ({ Quote, Program, Audience, Attribution, Approved: "TRUE" });
  return [
    s("As I finish my time in the Poole College of Management, I can confidently say that I feel prepared to step into the professional world, and a lot of that credit goes to the high-impact experiences provided to me here.", "Courses", "Student", "Management 120 student"),
    s("When I first stepped into my internship role, my goal was simple: bring fresh energy to the brand and build a genuine connection with our local community. As I head back to NC State to continue my studies in marketing, I'm leaving with a renewed passion for storytelling and a whole lot of gratitude for this experience.", "Internships", "Student", "Business HIRE intern"),
    s("Not only did the study-abroad experience allow me to learn firsthand about the differences between cultures, but it also allowed me to build new skills, learn more about myself and discover how I want to live my life.", "Global", "Student", "Study abroad student"),
    s("Over the last year I have found Packways to be a solid way of tracking attendance and engagement for events and meetings. Once it was explained to me all you could do with it, I found it a very useful tool.", "Packways", "Student", "Poole student, class of 2027"),
    s("In the future, I want it to be fully normalized. I don't want people to question it but have it engrained in the college culture.", "Packways", "Student", "Poole student"),
  ];
}

// Touchscreen wall: one week from Oct 22, 2026, when the wall started counting. Mostly middle
// and right screen visits of one to a few taps, busiest around midday, a few QR scans.
// Uses its own random sequence so it doesn't change the other samples.
function touchscreen(): Row[] {
  const r = rng(20261022);
  const pickR = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const weightedR = <T,>(pairs: [T, number][]) => {
    let x = r() * pairs.reduce((a, [, w]) => a + w, 0);
    for (const [v, w] of pairs) if ((x -= w) <= 0) return v;
    return pairs[pairs.length - 1][0];
  };
  const labels: Record<string, [string, number][]> = {
    left: [["bar > Career", 5], ["bar > Practicum", 4], ["bar > Global", 4], ["stage > Next slide", 3]],
    middle: [
      ["btns > Directory Who can help, and where to find them", 5], ["tabs > Career Center", 2], ["tabs > Advising", 2], ["letters > B", 2],
      ["who > ◀ Everyone", 3], ["btns > Building Map Find your way around Nelson Hall", 3], ["p-map > Close", 1],
      ["btns > Learn More High-Impact Experiences at Poole", 3], ["hie-areas > Career Internships and mentors", 1], ["hie-areas > Global Study and work abroad", 1],
      ["hie-areas > Community Villages and local impact", 1], ["opener > Tap here to play A welcome from the dean", 4], ["mid > Stop the video", 1],
    ],
    right: [
      ["stage > Next slide", 10], ["btns > What’s Happening in Poole", 4], ["events > Corporate presentation", 2], ["sec-events > Close", 1],
      ["btns > Student Spotlight", 3], ["sec-spot > Next", 4], ["btns > Monthly Movers", 2], ["btns > Join Packways", 2],
      ["sec-orgs > Finance Club", 2], ["sec-orgs > Marketing Club", 1],
    ],
  };
  const rows: Row[] = [];
  const start = new Date(2026, 9, 22);
  for (let day = 0; day < 7; day++) {
    const date = addDays(start, day);
    const weekend = date.getDay() === 0 || date.getDay() === 6;
    const visits = weekend ? 2 + Math.floor(r() * 4) : 18 + Math.floor(r() * 14);
    for (let v = 0; v < visits; v++) {
      const screen = weightedR<string>([["middle", 45], ["right", 38], ["left", 17]]);
      const hour = weightedR<number>([[8, 2], [9, 4], [10, 6], [11, 9], [12, 11], [13, 10], [14, 8], [15, 7], [16, 5], [17, 3], [18, 1]]);
      const visit = Math.floor(r() * 36 ** 8).toString(36).padStart(8, "0");
      let t = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, Math.floor(r() * 60), Math.floor(r() * 60));
      const taps = 1 + Math.floor(-Math.log(1 - r()) * 2.5);
      for (let i = 0; i < taps; i++) {
        rows.push({ Time: `${iso(t)}T${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`, Type: "Tap", Label: weightedR(labels[screen]), Screen: screen, Visit: visit });
        t = new Date(t.getTime() + (2 + Math.floor(r() * 12)) * 1000);
      }
    }
    if (r() < 0.8) {
      const t = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 10 + Math.floor(r() * 7), Math.floor(r() * 60));
      rows.push({ Time: `${iso(t)}T${pad(t.getHours())}:${pad(t.getMinutes())}:00`, Type: "QR scan", Label: pickR(["hie", "practicum-apply", "poole.ncsu.edu/global/study-abroad/", "getinvolved.ncsu.edu/"]), Screen: "", Visit: "" });
    }
  }
  return rows;
}

// Program surveys: two made-up surveys in the summarized shape (no real answers).
function surveys(): Row[] {
  const r = rng(20260821);
  const pickR = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const rows: Row[] = [];
  const add = (Survey: string, Audience: string, Respondent: number, Question: string, Answer: string) =>
    rows.push({ Survey, Cohort: "Summer 2026", Audience, Respondent: String(Respondent), Question, Answer });
  const statements = ["demonstrated a strong work ethic", "communicated effectively with others", "contributed meaningfully to your company's goals", "showed initiative and worked proactively", "completed high-quality work"];
  for (let i = 1; i <= 12; i++) {
    add("Supervisor survey", "Supervisors", i, "", "");
    for (const st of statements) add("Supervisor survey", "Supervisors", i, `The intern ${st} throughout the internship.`, pickR(["Strongly Agree", "Strongly Agree", "Strongly Agree", "Somewhat Agree"]));
    add("Supervisor survey", "Supervisors", i, "How would you rate the overall performance of the intern?", pickR(["10", "9", "10", "8"]));
    add("Supervisor survey", "Supervisors", i, "Would you hire this intern for a full-time position if a suitable opening were available?", pickR(["Yes", "Yes", "Unsure"]));
    add("Supervisor survey", "Supervisors", i, "Would you be interested in having another intern in the future?", pickR(["Yes", "Yes", "Yes", "Unsure"]));
  }
  const skills = ["Professional Communication", "Critical Thinking", "Leadership & Team Collaboration", "Career & Professional Development", "Professional Confidence"];
  const scale = ["1 - Limited", "2 - Developing", "3 - Proficient", "4 - Highly Proficient"];
  for (let i = 1; i <= 14; i++) {
    add("End-of-program survey", "Students", i, "", "");
    for (const s of skills) {
      const b = 1 + Math.floor(r() * 3);
      add("End-of-program survey", "Students", i, `${s} [At the beginning of my internship]`, scale[b - 1]);
      add("End-of-program survey", "Students", i, `${s} [Now]`, scale[Math.min(3, b + (r() < 0.8 ? 1 : 0))]);
    }
    add("End-of-program survey", "Students", i, "How did the experience affect your interest in working for a small business in the future?", pickR(["Much more interested", "Much more interested", "Somewhat more interested", "No change"]));
  }
  return rows;
}

export const sampleRows: Rows = {
  hub_checkins: hub(),
  packways: packways(),
  deans_scholars: deansScholars(),
  sbip_applicants: sbipApplicants(),
  sbip_employers: sbipEmployers(),
  practicum: practicum(),
  sales_cert: salesCert(),
  leadership: leadership(),
  global: global(),
  career: career(),
  stories: stories(),
  touchscreen: touchscreen(),
  sbip_surveys: surveys(),
  settings: [{ Setting: "Poole undergraduate enrollment", Value: "3000" }],
};
