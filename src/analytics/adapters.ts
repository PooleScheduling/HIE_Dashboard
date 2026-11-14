import { datasets, type Row } from "./datasets";
import { NC_COUNTIES, gicsSector } from "./reference";

// Turns a program's own sheet (form responses, trackers) into the few columns the analysis
// needs. Runs on the server only, before the report is built. Names, emails, phone numbers,
// GPAs and the like are never carried over: the email becomes an anonymous student key, so
// the same student matches across programs without anyone's identity leaving the sheet.
//
// Columns are found by what they mean ("a column mentioning NC State email"), not their exact
// wording, so next year's form imports without code changes. A sheet that already has the
// template's columns is passed through as is.

export type AdaptMeta = { year?: string; source?: string };

// cyrb53: a fast 53-bit hash. One-way in practice; the keys stay on the server anyway.
function hash(s: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
export const studentKey = (email: string) => {
  const e = String(email || "").trim().toLowerCase();
  return e ? `K-${hash(e)}` : "";
};

// First column whose header matches, tried in order of preference.
function findCol(row: Row, ...patterns: RegExp[]): string | undefined {
  const keys = Object.keys(row);
  for (const p of patterns) {
    const k = keys.find((h) => p.test(h.trim()));
    if (k) return k;
  }
  return undefined;
}
const get = (r: Row, k?: string) => (k ? String(r[k] ?? "").trim() : "");

function hasTemplate(id: string, rows: Row[]): boolean {
  const d = datasets.find((x) => x.id === id);
  if (!d || !rows.length) return true;
  const head = Object.keys(rows[0]).map((h) => h.toLowerCase());
  return d.columns.filter((c) => !c.optional).every((c) => head.includes(c.name.toLowerCase()));
}

// "2027" or "summer 27" → "Summer 2027".
function summerOf(raw: string): string {
  const y = /(20\d{2})/.exec(raw)?.[1] ?? (/\b(\d{2})\b/.exec(raw) ? `20${/\b(\d{2})\b/.exec(raw)![1]}` : "");
  return y ? `Summer ${y}` : "";
}
// Applications that open in the fall are for the next summer.
function summerAfter(date: string): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) return "";
  return `Summer ${d.getMonth() >= 7 ? d.getFullYear() + 1 : d.getFullYear()}`;
}
function academicYearOf(date: string): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) return "";
  const start = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;
  return `${start}-${String(start + 1).slice(2)}`;
}

// NC towns and cities that commonly show up in employer locations, mapped to their county.
// Anything not listed (and not already a county name) is left blank rather than guessed.
const NC_PLACES: Record<string, string> = {
  raleigh: "Wake", cary: "Wake", apex: "Wake", "wake forest": "Wake", morrisville: "Wake", garner: "Wake",
  "holly springs": "Wake", "fuquay-varina": "Wake", "fuquay varina": "Wake", knightdale: "Wake", wendell: "Wake",
  zebulon: "Wake", rolesville: "Wake", durham: "Durham", "research triangle park": "Durham", rtp: "Durham",
  "chapel hill": "Orange", carrboro: "Orange", hillsborough: "Orange", charlotte: "Mecklenburg",
  huntersville: "Mecklenburg", matthews: "Mecklenburg", cornelius: "Mecklenburg", davidson: "Mecklenburg",
  "mint hill": "Mecklenburg", greensboro: "Guilford", "high point": "Guilford", "winston-salem": "Forsyth",
  "winston salem": "Forsyth", wilmington: "New Hanover", asheville: "Buncombe", fayetteville: "Cumberland",
  greenville: "Pitt", concord: "Cabarrus", kannapolis: "Cabarrus", gastonia: "Gaston", jacksonville: "Onslow",
  hickory: "Catawba", boone: "Watauga", "rocky mount": "Nash", wilson: "Wilson", goldsboro: "Wayne",
  "new bern": "Craven", clayton: "Johnston", smithfield: "Johnston", sanford: "Lee", burlington: "Alamance",
  mooresville: "Iredell", statesville: "Iredell", salisbury: "Rowan", lumberton: "Robeson",
  "elizabeth city": "Pasquotank", kinston: "Lenoir", pittsboro: "Chatham", siler: "Chatham", louisburg: "Franklin",
  henderson: "Vance", oxford: "Granville", roxboro: "Person", "southern pines": "Moore", pinehurst: "Moore",
  "morehead city": "Carteret", "beaufort": "Carteret", washington: "Beaufort", tarboro: "Edgecombe",
  "roanoke rapids": "Halifax", dunn: "Harnett", "lillington": "Harnett", asheboro: "Randolph", lexington: "Davidson",
  thomasville: "Davidson", "mount airy": "Surry", "north wilkesboro": "Wilkes", morganton: "Burke", lenoir: "Caldwell",
  shelby: "Cleveland", monroe: "Union", albemarle: "Stanly", rockingham: "Richmond", whiteville: "Columbus",
  clinton: "Sampson", "kill devil hills": "Dare", manteo: "Dare", nags: "Dare",
};
export function countyOf(location: string): string {
  const s = String(location || "").toLowerCase().replace(/,?\s*(nc|north carolina)\.?\s*$/i, "").trim();
  if (!s) return "";
  const county = /^(.+?)\s+(county|co\.?)$/.exec(s)?.[1];
  const asCounty = NC_COUNTIES.find((c) => c.toLowerCase() === (county ?? s));
  if (asCounty) return asCounty;
  const place = Object.keys(NC_PLACES).find((p) => s === p || s.startsWith(p + ",") || s.startsWith(p + " "));
  return place ? NC_PLACES[place] : "";
}

function sbipApplicants(rows: Row[], meta: AdaptMeta): Row[] {
  // Keeps only countable columns, with the sheet's own values: no names, contact details or essays.
  const r0 = rows[0];
  const ts = findCol(r0, /^timestamp$/i, /time ?stamp/i);
  const email = findCol(r0, /nc state email/i, /ncsu email/i, /^email address$/i, /email/i);
  const major = findCol(r0, /^major$/i, /current (poole )?major/i, /\bmajor\b/i);
  const rural = findCol(r0, /rural community/i, /^rural tie$/i);
  const status = findCol(r0, /zoom interview status/i, /^status$/i, /^decision status$/i);
  const rec = findCol(r0, /reviewer'?s recommendation/i, /recommendation for a zoom/i, /^r1 recommendation/i, /recommendation/i);
  const decision = findCol(r0, /^final decision$/i, /^decision category$/i);
  const prelim = findCol(r0, /preliminary decline/i);
  const score = findCol(r0, /^total score$/i, /total score/i, /average application score/i, /application score/i);
  const region = findCol(r0, /north carolina region/i, /regional preference/i, /^location$/i);
  const heard = findCol(r0, /how did you hear/i);
  const standing = findCol(r0, /anticipated status/i);
  const seen = new Set<string>();
  const out: Row[] = [];
  for (const r of rows) {
    const key = studentKey(get(r, email));
    if (!key) continue;
    const cohort = meta.year ? summerOf(meta.year) || meta.year : summerAfter(get(r, ts));
    if (seen.has(cohort + key)) continue; // someone who submitted twice counts once
    seen.add(cohort + key);
    out.push({
      Cohort: cohort,
      "Student key": key,
      "Applied on": get(r, ts),
      Status: get(r, status),
      Recommendation: get(r, rec),
      Decision: get(r, decision),
      "Preliminary decline": get(r, prelim),
      Score: /^\d+(\.\d+)?$/.test(get(r, score)) ? get(r, score) : "",
      Major: get(r, major),
      "Class standing": get(r, standing),
      "Rural connection": get(r, rural),
      Region: get(r, region).length <= 60 ? get(r, region) : "",
      "Heard about": get(r, heard),
    });
  }
  return out;
}

function sbipEmployers(rows: Row[], meta: AdaptMeta): Row[] {
  const r0 = rows[0];
  const company = findCol(r0, /company/i, /business|organization|employer/i);
  const industry = findCol(r0, /industry/i);
  const location = findCol(r0, /county/i, /location|city/i);
  const target = findCol(r0, /target summer/i, /summer|cohort/i);
  const final = findCol(r0, /^final/i);
  const workflow = findCol(r0, /workflow/i);
  const status = findCol(r0, /^status/i);
  const seen = new Set<string>();
  const out: Row[] = [];
  for (const r of rows) {
    const name = get(r, company).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!name) continue;
    const cohort = summerOf(get(r, target)) || (meta.year ? summerOf(meta.year) : "") || "Not set";
    if (seen.has(cohort + name)) continue;
    seen.add(cohort + name);
    out.push({
      Cohort: cohort,
      "Employer key": `E-${hash(name)}`,
      County: countyOf(get(r, location)),
      "Industry sector": gicsSector(get(r, industry)),
      Status: get(r, final) || get(r, workflow) || get(r, status) || "Contacted",
    });
  }
  return out;
}

function salesCert(rows: Row[], meta: AdaptMeta): Row[] {
  const r0 = rows[0];
  const ts = findCol(r0, /^timestamp$/i, /time ?stamp/i);
  const email = findCol(r0, /nc state email/i, /^email address$/i, /email/i);
  const major = findCol(r0, /current (poole )?major/i, /\bmajor\b/i);
  const accepted = findCol(r0, /^accepted/i, /^(final )?(status|decision|outcome)$/i);
  const completed = findCol(r0, /^completed/i);
  const seen = new Set<string>();
  const out: Row[] = [];
  for (const r of rows) {
    const key = studentKey(get(r, email));
    if (!key) continue;
    const cycle = meta.year || academicYearOf(get(r, ts));
    if (seen.has(cycle + key)) continue;
    seen.add(cycle + key);
    const a = get(r, accepted);
    out.push({
      Cycle: cycle,
      "Student key": key,
      Accepted: /^(y|yes|true|accept|admit)/i.test(a) ? "Yes" : /^(n|no|false|declin|deny|reject)/i.test(a) ? "No" : "",
      Completed: get(r, completed),
      Major: get(r, major),
    });
  }
  return out;
}

// Any Google Form response sheet → one row per answer to a closed question:
// Survey | Cohort | Audience | Respondent | Question | Answer.
// Identifying, demographic and pay questions are skipped, and so are open-ended answers
// (anything long or mostly unique), so only countable answers leave the sheet.
const SKIP_QUESTION = /time ?stamp|name|e-?mail|phone|linkedin|company|organization|supervisor|employer's|race|ethnic|gender|pronoun|pay\b|rate of pay|wage|salary|stipend|date/i;
function survey(rows: Row[], meta: AdaptMeta): Row[] {
  const heads = Object.keys(rows[0]).filter((h) => h.trim() && !SKIP_QUESTION.test(h.split("\n")[0]));
  const audience = Object.keys(rows[0]).some((h) => /^the intern\b|intern's/i.test(h)) ? "Supervisors" : "Students";
  const keep = heads.filter((h) => {
    const vals = rows.map((r) => get(r, h)).filter(Boolean);
    if (!vals.length) return false;
    const numeric = vals.filter((v) => /^\d+(\.\d+)?\b/.test(v)).length / vals.length >= 0.8;
    const distinct = new Set(vals.map((v) => v.toLowerCase())).size;
    const avgLen = vals.reduce((a, v) => a + v.length, 0) / vals.length;
    return numeric || (distinct <= 8 && avgLen <= 40);
  });
  // Student surveys that collect an email let us count those students as program participants
  // (as an anonymous key, like everywhere else). Supervisor emails are never used.
  const email = audience === "Students" ? findCol(rows[0], /nc state email/i, /^email address$/i) : undefined;
  const out: Row[] = [];
  rows.forEach((r, i) => {
    // One marker row per response, so a survey with only open questions still counts responses.
    out.push({ Survey: meta.source || "Survey", Cohort: meta.year || "", Audience: audience, Respondent: String(i + 1), Question: "", Answer: "", "Student key": studentKey(get(r, email)) });
    for (const h of keep) {
      const a = get(r, h);
      if (a) out.push({ Survey: meta.source || "Survey", Cohort: meta.year || "", Audience: audience, Respondent: String(i + 1), Question: h.trim(), Answer: a.slice(0, 60) });
    }
  });
  return out;
}

// Dean's Scholars (DSP Engagement Dashboard). Handles its three tab shapes: badge completion,
// competency completions and the HIE tab. Names, emails, profile links and GPA are dropped; the
// HIE tab's entries (employers, places, orgs) become Yes/No so only counts remain. Rows are keyed
// by a hash of the scholar's name, since the HIE tab has no email.
function deansScholars(rows: Row[]): Row[] {
  const r0 = rows[0];
  const first = findCol(r0, /^first name$/i);
  const last = findCol(r0, /^last name$/i);
  const heads = Object.keys(r0);
  const competency = heads.filter((h) => /\(completions\)\s*$/i.test(h));
  const totalComp = findCol(r0, /^total completions$/i);
  const badgePct = findCol(r0, /^completion percentage$/i);
  const totalActs = heads.indexOf(findCol(r0, /^total activities$/i) ?? "");
  const badgeActs = totalActs >= 0 ? heads.slice(totalActs + 1).filter((h) => h.trim()) : [];
  const hieCols = heads.filter((h) => /^(internship\/work|study abroad|practicum|engagement|honors college|dean'?s list)$/i.test(h.trim()));
  const pctNum = (v: string) => { const n = parseFloat(String(v).replace("%", "")); return isNaN(n) ? "" : String(n); };
  const out: Row[] = [];
  for (const r of rows) {
    const name = `${get(r, first)} ${get(r, last)}`.trim().toLowerCase();
    if (!name) continue; // totals rows have no name
    const row: Row = {
      "Student key": `N-${hash(name)}`,
      Cohort: get(r, findCol(r0, /^cohort$/i)),
      Classification: get(r, findCol(r0, /classification/i)),
      "Home county": get(r, findCol(r0, /^home county$/i)),
      Major: get(r, findCol(r0, /^major$/i)),
      Level: get(r, findCol(r0, /^current level$/i)),
    };
    for (const h of competency) row[h.replace(/\s*\(completions\)\s*$/i, "").trim()] = get(r, h);
    if (totalComp) row["Total completions"] = get(r, totalComp);
    if (badgePct) row["Badge completion %"] = pctNum(get(r, badgePct));
    for (const h of badgeActs) row[`Badge: ${h.trim()}`] = pctNum(get(r, h));
    for (const h of hieCols) { const v = get(r, h); row[`HIE: ${h.trim()}`] = v && !/^false$/i.test(v) ? "Yes" : "No"; }
    out.push(row);
  }
  return out;
}

const ADAPTERS: Record<string, (rows: Row[], meta: AdaptMeta) => Row[]> = {
  deans_scholars: deansScholars,
  sbip_applicants: sbipApplicants,
  sbip_employers: sbipEmployers,
  sales_cert: salesCert,
  sbip_surveys: survey,
};

// Called by the server for each source's rows before the report is built.
export function adaptRows(datasetId: string, rows: Row[], meta: AdaptMeta = {}): Row[] {
  const f = ADAPTERS[datasetId];
  if (!f || !rows.length || hasTemplate(datasetId, rows)) return rows;
  return f(rows, meta);
}
