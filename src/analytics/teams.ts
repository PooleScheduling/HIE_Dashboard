import type { Person, Team } from "../data/types";

// Team structure for the Team page (on hold). Sample roles only; real names come from
// the Team tab in the Data Hub workbook (server/Code.js overlayTeam_).
export const teams: Team[] = [
  { id: "hie-office", name: "HIE Office", summary: "Sets the HIE goal, runs the mini-grants and publishes the annual impact report." },
  { id: "global", name: "Global Programs", summary: "Study abroad, exchanges, faculty-led programs and global internships.", parent: "hie-office" },
  { id: "internships", name: "Internship Programs", summary: "Small Business Internship Program, practicum applications and the Sales Excellence Certificate.", parent: "hie-office" },
  { id: "practicum", name: "Practicum", summary: "Practicum courses and client projects with business partners.", parent: "hie-office" },
  { id: "student-leadership", name: "Student Leadership", summary: "Executive boards, Poole Packways, Dean's Scholars and the Hub.", parent: "hie-office" },
  { id: "career", name: "Career Center", summary: "Internships, co-ops and career services.", parent: "hie-office" },
];

export const people: Person[] = [
  { id: "p1", role: "Director, High-Impact Experiences", team: "hie-office", areas: ["global", "internships", "practicum", "packways", "career", "hub"], lead: true },
  { id: "p2", role: "Data and reporting", team: "hie-office", areas: ["packways", "hub"] },
  { id: "p3", role: "Global programs lead", team: "global", areas: ["global"], lead: true },
  { id: "p4", role: "Global programs coordinator", team: "global", areas: ["global"] },
  { id: "p5", role: "Experiential programs director", team: "internships", areas: ["internships", "practicum"], lead: true },
  { id: "p6", role: "Practicum coordinator", team: "practicum", areas: ["practicum"], lead: true },
  { id: "p7", role: "Student leadership advisor", team: "student-leadership", areas: ["packways"], lead: true },
  { id: "p8", role: "Packways and Hub coordinator", team: "student-leadership", areas: ["packways", "hub"] },
  { id: "p9", role: "Packways administrator", team: "student-leadership", areas: ["packways"] },
  { id: "p10", role: "Career services lead", team: "career", areas: ["career", "internships"], lead: true },
];
