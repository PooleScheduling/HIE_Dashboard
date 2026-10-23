import type { ReportData } from "./types";

// Local demo data, built from published totals and program summaries:
// - Annual impact report, AY 2025-26
// - Program team summaries
// - DSP Engagement Dashboard sheet
// - Feedback Kiosk Data sheet (Hub iPad), Aug 12 - Oct 23, 2026, Eastern time
// Student-level data (names, emails, GPAs) is never included; only totals.

const annualReport = { kind: "report" as const, label: "Annual impact report", updatedBy: "HIE office", updatedOn: "2026-10-14" };
const programSheet = { kind: "upload" as const, label: "Program sheet", updatedBy: "Program team", updatedOn: "2026-10-14" };
const dsp = { kind: "live" as const, label: "DSP Engagement Dashboard", updatedBy: "Student Leadership", updatedOn: "2026-10-21" };
const kiosk = { kind: "live" as const, label: "Feedback Kiosk Data", updatedBy: "Hub iPad", updatedOn: "2026-10-23" };

export const mockReport: ReportData = {
  title: "Poole HIE Engagement Report",
  goal: "Every Poole student completes at least one high-impact experience by graduation.",
  intro:
    "This report tracks how close we are, in numbers kept current by the people who run each program.",
  asOf: "2026-10-23",

  headline: [
    { id: "abroad", value: "606", label: "Poole students studied abroad last year, up 6.3%", period: "AY26", source: annualReport },
    { id: "packways", value: "6,776", label: "competency engagements logged in Poole Packways, 444% above the year before", period: "AY26", source: annualReport },
    { id: "sbip-apps", value: "110", label: "students applied for about 20 small-business internships next summer", period: "Summer 2027", source: programSheet },
  ],

  sections: [
    {
      id: "global",
      title: "Global programs",
      kicker: "Global",
      summary: "of Poole students studied abroad in AY26",
      owner: "Global programs team",
      status: "waiting",
      cardMetric: { id: "abroad-pct", value: "28%", label: "of Poole students studied abroad, AY26", source: annualReport },
      metrics: [
        { id: "abroad-n", value: "606", label: "Poole students studied abroad, AY26", change: "+6.3% vs AY25", source: annualReport },
        { id: "abroad-pct2", value: "28%", label: "of Poole students studied abroad, AY26", source: annualReport },
        { id: "abroad-share", value: ">25%", label: "of all NC State students who studied abroad were in Poole", source: annualReport },
      ],
      charts: [],
      note: "Semester exchange, faculty-led, IBDD, Hamilton Scholars and global internships will split out once the global programs team connects its data.",
    },
    {
      id: "internships",
      title: "Small Business Internship Program",
      kicker: "Internships",
      summary: "interns placed with small and rural businesses, summer 2026 to summer 2027",
      owner: "Internship program team",
      status: "upload",
      cardMetric: { id: "sbip-placed", value: "15 → ~20", label: "interns placed", source: programSheet },
      metrics: [
        { id: "sbip-int", value: "41", label: "invited to interview, summer 2027", source: programSheet },
        { id: "sbip-emp", value: "~300", label: "employers in outreach", source: programSheet },
        { id: "sbip-counties", value: "11", label: "rural counties served, summer 2026", source: annualReport },
      ],
      charts: [
        {
          title: "Applicants and interns placed, by summer cohort",
          categories: ["Summer 2025", "Summer 2026", "Summer 2027"],
          series: [
            { name: "Applicants", values: [23, 57, 110], labels: ["23", "57*", "110"] },
            { name: "Interns placed", values: [11, 15, 20], labels: ["11", "15", "~20"], emphasis: true },
          ],
          note: "*The annual report lists 54 applications for AY26; program records show 57. Summer 2027 placements are a target.",
        },
      ],
    },
    {
      id: "practicum",
      title: "Practicum courses and certificates",
      kicker: "Practicum and certificates",
      summary: "real-world projects for business partners in AY26",
      owner: "Practicum team",
      status: "upload",
      cardMetric: { id: "prac-proj", value: "101", label: "practicum projects, AY26", source: annualReport },
      metrics: [
        { id: "prac-apps", value: "~120", label: "practicum applicants per cycle", source: programSheet },
        { id: "prac-drops", value: "−40%", label: "student drops vs AY25", source: annualReport },
        { id: "sales-apps", value: "32", label: "Sales Excellence Certificate applicants (about 40 expected)", source: programSheet },
      ],
      charts: [],
      note: "Applicants and enrollment by course will appear once the Smartsheet export is uploaded.",
    },
    {
      id: "packways",
      title: "Poole Packways and Dean's Scholars",
      kicker: "Packways and Dean's Scholars",
      summary: "activity completions by 10 Dean's Scholars this fall",
      owner: "Student Leadership",
      status: "live",
      cardMetric: { id: "dsp-total", value: "147", label: "Dean's Scholars activity completions", source: dsp },
      metrics: [
        { id: "dsp-work", value: "5 of 10", label: "Dean's Scholars with an internship or campus job", source: dsp },
        { id: "dsp-list", value: "4 of 10", label: "made the Dean's List", source: dsp },
        { id: "push", value: "31%", label: "of Poole students enabled Packways notifications, AY26", source: annualReport },
      ],
      charts: [
        {
          title: "Dean's Scholars completions by competency",
          categories: ["Beyond Business", "Interpersonal Communication", "Career Development", "Teamwork and Leadership"],
          series: [{ name: "Completions", values: [51, 42, 31, 25], emphasis: true }],
          orientation: "horizontal",
        },
      ],
    },
    {
      id: "career",
      title: "Career: internships and co-ops",
      kicker: "Career",
      summary: "Internships and co-ops reported through the Career Center",
      owner: "Career Center",
      status: "waiting",
      metrics: [],
      charts: [],
      note: "No source connected yet.",
    },
  ],

  hub: {
    metrics: [
      { id: "hub-taps", value: "153", label: "kiosk check-ins since Aug 12", source: kiosk },
      { id: "hub-peak-week", value: "47", label: "busiest week (Oct 12)", source: kiosk },
      { id: "hub-peak-hour", value: "2 pm", label: "busiest hour of the day", source: kiosk },
      { id: "hub-peak-day", value: "Wed", label: "busiest weekday (53 check-ins)", source: kiosk },
    ],
    weekly: {
      title: "Kiosk check-ins per week",
      categories: ["Aug 10", "Aug 17", "Aug 24", "Aug 31", "Sep 7", "Sep 14", "Sep 21", "Sep 28", "Oct 5", "Oct 12", "Oct 19"],
      series: [{ name: "Check-ins", values: [1, 6, 10, 5, 4, 0, 13, 13, 38, 47, 16], emphasis: true }],
      note: "No check-ins the week of Sep 14. Was the kiosk offline?",
    },
    hourly: {
      title: "When students come in (Eastern time)",
      categories: ["7a", "8a", "9a", "10a", "11a", "12p", "1p", "2p", "3p", "4p", "5p", "6p", "7p"],
      series: [{ name: "Check-ins", values: [4, 1, 12, 5, 16, 13, 15, 32, 9, 27, 9, 8, 2], emphasis: true }],
    },
  },

  stories: [
    { id: "s1", quote: "As I finish my time in the Poole College of Management, I can confidently say that I feel prepared to step into the professional world, and a lot of that credit goes to the high-impact experiences provided to me here.", program: "Courses", audience: "Student", attribution: "Management 120 student", source: "Annual impact report AY26" },
    { id: "s2", quote: "When I first stepped into my internship role, my goal was simple: bring fresh energy to the brand and build a genuine connection with our local community. As I head back to NC State to continue my studies in marketing, I'm leaving with a renewed passion for storytelling and a whole lot of gratitude for this experience.", program: "Internships", audience: "Student", attribution: "Business HIRE intern", source: "Annual impact report AY26" },
    { id: "s3", quote: "Not only did the study-abroad experience allow me to learn firsthand about the differences between cultures, but it also allowed me to build new skills, learn more about myself and discover how I want to live my life.", program: "Global", audience: "Student", attribution: "Study abroad student", source: "Annual impact report AY26" },
    { id: "s4", quote: "Over the last year I have found Packways to be a solid way of tracking attendance and engagement for events and meetings. Once it was explained to me all you could do with it, I found it a very useful tool.", program: "Packways", audience: "Student", attribution: "Poole student, class of 2027", source: "Pathways 2026 presentation" },
    { id: "s5", quote: "In the future, I want it to be fully normalized. I don't want people to question it but have it engrained in the college culture.", program: "Packways", audience: "Student", attribution: "Poole student", source: "Pathways 2026 presentation" },
  ],
  featuredStoryId: "s1",

  sources: [
    { name: "Feedback Kiosk Data", owner: "Student Leadership", feeds: "The Hub", kind: "live", howItGetsIn: "Live link", lastUpdated: "2026-10-23" },
    { name: "DSP Engagement Dashboard", owner: "Student Leadership", feeds: "Packways and Dean's Scholars", kind: "live", howItGetsIn: "Live link", lastUpdated: "2026-10-21" },
    { name: "Packways activity completion report", owner: "Packways admin", feeds: "Packways engagement", kind: "upload", howItGetsIn: "Monthly upload" },
    { name: "Small Business Internship sheets", owner: "Internship program team", feeds: "Internships", kind: "waiting", howItGetsIn: "Requested" },
    { name: "Sales Certificate sheet", owner: "Internship program team", feeds: "Practicum and certificates", kind: "waiting", howItGetsIn: "Requested" },
    { name: "Practicum Smartsheet", owner: "Practicum team", feeds: "Practicum and certificates", kind: "waiting", howItGetsIn: "Export each semester" },
    { name: "Global programs", owner: "Global programs team", feeds: "Global", kind: "waiting", howItGetsIn: "Not connected yet" },
    { name: "Career internships and co-ops", owner: "Career Center", feeds: "Career", kind: "waiting", howItGetsIn: "Not connected yet" },
    { name: "Annual impact report AY26", owner: "HIE office", feeds: "AY26 baseline", kind: "report", howItGetsIn: "Fixed baseline", lastUpdated: "2026-10-14" },
  ],

  templates: [
    { id: "practicum", name: "Practicum enrollment", columns: ["Term", "Course", "Applicants", "Enrolled"], sheetTab: "Practicum" },
    { id: "global", name: "Global program participation", columns: ["Term", "Program", "Students"], sheetTab: "Global" },
    { id: "career", name: "Internships and co-ops", columns: ["Term", "Type", "Students"], sheetTab: "Career" },
  ],

  openIssues: [
    "Business HIRE AY26 applications: the annual report lists 54, program records show 57. Which is official?",
    "Hub kiosk recorded no check-ins the week of Sep 14.",
  ],
};
