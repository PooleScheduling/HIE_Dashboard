// The datasets the dashboard reads. Each one is a template: the columns a program team
// keeps (in a Sheet tab, a form, or an export), and what the dashboard works out from them.
//
// status "confirmed": we know this data exists and roughly what it looks like.
// status "placeholder": a starting point to confirm with the team; the source isn't known yet.

export type Column = { name: string; example: string; note?: string; optional?: boolean };

export type Dataset = {
  id: string;
  name: string;
  area: string; // section id, or "hub" / "stories" / "settings"
  owner: string;
  status: "confirmed" | "placeholder";
  description: string;
  likelySource: string;
  cadence: string;
  sheetTab: string; // tab name in the HIE Data Hub workbook
  columns: Column[];
  powers: string[]; // analysis this dataset feeds
};

export const datasets: Dataset[] = [
  {
    id: "hub_checkins",
    name: "Hub kiosk check-ins",
    area: "hub",
    owner: "Student Leadership",
    status: "confirmed",
    description: "One row per tap on the Hub kiosk iPad. Only the time of the tap is used.",
    likelySource: "Feedback Kiosk Data (Google Sheet), linked live",
    cadence: "Live",
    sheetTab: "Responses",
    columns: [{ name: "Date", example: "10/14/2026 14:03:22", note: "Date and time of the tap. Other columns are ignored." }],
    powers: ["Check-ins by week, hour and weekday", "Busiest times", "Recent trend", "Weeks with no check-ins"],
  },
  {
    id: "packways",
    name: "Packways activity completions",
    area: "packways",
    owner: "Packways admin",
    status: "confirmed",
    description: "One row per completed activity, from the Suitable activity completion report.",
    likelySource: "Suitable admin export (emailed spreadsheet)",
    cadence: "Monthly",
    sheetTab: "Packways",
    columns: [
      { name: "Student key", example: "S-0412", note: "Any anonymous ID that's the same for a student across datasets. No names or emails." },
      { name: "Activity", example: "Resume review" },
      { name: "Competency", example: "Career Development" },
      { name: "Completed on", example: "2026-10-14" },
      { name: "Level", example: "2", note: "Packways level, if the export includes it.", optional: true },
    ],
    powers: ["Completions and active students", "Completions per student", "Competency mix", "Monthly trend"],
  },
  {
    id: "deans_scholars",
    name: "Dean's Scholars engagement",
    area: "packways",
    owner: "Student Leadership",
    status: "confirmed",
    description: "One row per Dean's Scholar, with completions by competency.",
    likelySource: "DSP Engagement Dashboard (Google Sheet)",
    cadence: "Live",
    sheetTab: "DeansScholars",
    columns: [
      { name: "Student key", example: "S-1180" },
      { name: "Beyond Business", example: "6" },
      { name: "Interpersonal Communication", example: "4" },
      { name: "Career Development", example: "3" },
      { name: "Teamwork and Leadership", example: "2" },
      { name: "Internship or campus job", example: "Yes" },
      { name: "Dean's List", example: "No" },
    ],
    powers: ["Completions by competency", "Share with an internship or job", "Share on the Dean's List"],
  },
  {
    id: "sbip_applicants",
    name: "Small Business Internship applicants",
    area: "internships",
    owner: "Internship program team",
    status: "confirmed",
    description: "One row per applicant per summer cohort, with how far they got.",
    likelySource: "Program sheet, one per summer",
    cadence: "Each application cycle",
    sheetTab: "SBIP Applicants",
    columns: [
      { name: "Cohort", example: "Summer 2027" },
      { name: "Student key", example: "S-2051" },
      { name: "Applied on", example: "2026-09-18" },
      { name: "Status", example: "Interviewed", note: "Applied, Interviewed or Placed" },
    ],
    powers: ["Applicants by cohort and growth", "Interview and placement rates", "Applications by week"],
  },
  {
    id: "sbip_employers",
    name: "Small Business Internship employers",
    area: "internships",
    owner: "Internship program team",
    status: "confirmed",
    description: "One row per business contacted for a cohort.",
    likelySource: "Program sheet (employer outreach tab)",
    cadence: "Each application cycle",
    sheetTab: "SBIP Employers",
    columns: [
      { name: "Cohort", example: "Summer 2027" },
      { name: "Employer key", example: "E-118", note: "Anonymous ID or business name." },
      { name: "County", example: "Wilson" },
      { name: "Rural", example: "Yes" },
      { name: "Status", example: "Hosting", note: "Contacted, Interested or Hosting" },
    ],
    powers: ["Employer outreach funnel", "Host businesses", "Rural counties served"],
  },
  {
    id: "practicum",
    name: "Practicum applications",
    area: "practicum",
    owner: "Practicum team",
    status: "confirmed",
    description: "One row per student application to a practicum course, with the final status.",
    likelySource: "Practicum Smartsheet export",
    cadence: "Each semester",
    sheetTab: "Practicum",
    columns: [
      { name: "Term", example: "Fall 2026" },
      { name: "Course", example: "Supply chain practicum" },
      { name: "Student key", example: "S-0877" },
      { name: "Status", example: "Enrolled", note: "Applied, Enrolled, Dropped or Completed" },
    ],
    powers: ["Applications and enrollment by term", "Acceptance and drop rates", "Courses offered vs run", "Demand by course"],
  },
  {
    id: "sales_cert",
    name: "Sales Excellence Certificate",
    area: "practicum",
    owner: "Internship program team",
    status: "confirmed",
    description: "One row per applicant per cycle.",
    likelySource: "Certificate program sheet",
    cadence: "Each cycle",
    sheetTab: "Sales Certificate",
    columns: [
      { name: "Cycle", example: "2026-27" },
      { name: "Student key", example: "S-1422" },
      { name: "Accepted", example: "Yes" },
      { name: "Completed", example: "", note: "Yes, No, or blank while in progress", optional: true },
    ],
    powers: ["Applicants and acceptance rate by cycle", "Completion rate"],
  },
  {
    id: "global",
    name: "Global program participation",
    area: "global",
    owner: "Global programs team",
    status: "placeholder",
    description: "One row per student per program. To confirm with the Global team.",
    likelySource: "To confirm (study abroad office records)",
    cadence: "Each semester",
    sheetTab: "Global",
    columns: [
      { name: "Term", example: "Spring 2026" },
      { name: "Student key", example: "S-0091" },
      { name: "Program type", example: "Semester exchange", note: "Semester exchange, Faculty-led, IBDD, Hamilton Scholars or Global internship" },
      { name: "Country", example: "Spain" },
    ],
    powers: ["Students abroad by term", "Program type mix", "Top destinations", "Share of Poole undergraduates"],
  },
  {
    id: "career",
    name: "Internships and co-ops",
    area: "career",
    owner: "Career Center",
    status: "placeholder",
    description: "One row per reported internship or co-op. To confirm with the Career team.",
    likelySource: "To confirm (Career Center records)",
    cadence: "Each semester",
    sheetTab: "Career",
    columns: [
      { name: "Term", example: "Summer 2026" },
      { name: "Student key", example: "S-1733" },
      { name: "Type", example: "Internship", note: "Internship or Co-op" },
      { name: "Industry", example: "Financial services" },
      { name: "Paid", example: "Yes" },
    ],
    powers: ["Internships and co-ops by term", "Industry mix", "Share paid"],
  },
  {
    id: "stories",
    name: "Stories",
    area: "stories",
    owner: "All program teams",
    status: "confirmed",
    description: "Quotes from students, employers and faculty. Only approved rows appear.",
    likelySource: "Google Form linked to a Sheet tab",
    cadence: "Anytime",
    sheetTab: "Stories",
    columns: [
      { name: "Quote", example: "This internship showed me…" },
      { name: "Program", example: "Internships" },
      { name: "Audience", example: "Student", note: "Student, Employer or Faculty" },
      { name: "Attribution", example: "Business HIRE intern" },
      { name: "Approved", example: "TRUE" },
    ],
    powers: ["Stories page", "Featured story on the report"],
  },
  {
    id: "settings",
    name: "Report settings",
    area: "settings",
    owner: "HIE Office",
    status: "placeholder",
    description: "Numbers the analysis needs that don't come from a program, like total enrollment.",
    likelySource: "Entered by the HIE Office",
    cadence: "Once a year",
    sheetTab: "Settings",
    columns: [
      { name: "Setting", example: "Poole undergraduate enrollment" },
      { name: "Value", example: "3000", note: "Placeholder. Replace with the official headcount." },
    ],
    powers: ["Share of students with an HIE (progress toward the goal)"],
  },
];

export type Row = Record<string, string>;
export type Rows = Record<string, Row[]>;
