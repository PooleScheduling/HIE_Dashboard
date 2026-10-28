// Public reference lists the analysis uses to group rows. Nothing here is student data.

// North Carolina county types, as defined by the NC Rural Center from 2020 Census
// population density (people per square mile):
//   Urban: 750 or more · Suburban / regional city: 250 to 750 · Rural: 250 or fewer.
// 6 urban, 16 suburban, 78 rural. Source: ncruralcenter.org/how-we-define-rural
// The lists stand until the 2030 Census.
export const NC_URBAN = ["Durham", "Forsyth", "Guilford", "Mecklenburg", "New Hanover", "Wake"];
export const NC_SUBURBAN = [
  "Alamance", "Buncombe", "Cabarrus", "Catawba", "Cumberland", "Davidson", "Gaston", "Henderson",
  "Iredell", "Johnston", "Lincoln", "Onslow", "Orange", "Pitt", "Rowan", "Union",
];
export const NC_COUNTIES = [
  "Alamance", "Alexander", "Alleghany", "Anson", "Ashe", "Avery", "Beaufort", "Bertie", "Bladen", "Brunswick",
  "Buncombe", "Burke", "Cabarrus", "Caldwell", "Camden", "Carteret", "Caswell", "Catawba", "Chatham", "Cherokee",
  "Chowan", "Clay", "Cleveland", "Columbus", "Craven", "Cumberland", "Currituck", "Dare", "Davidson", "Davie",
  "Duplin", "Durham", "Edgecombe", "Forsyth", "Franklin", "Gaston", "Gates", "Graham", "Granville", "Greene",
  "Guilford", "Halifax", "Harnett", "Haywood", "Henderson", "Hertford", "Hoke", "Hyde", "Iredell", "Jackson",
  "Johnston", "Jones", "Lee", "Lenoir", "Lincoln", "Macon", "Madison", "Martin", "McDowell", "Mecklenburg",
  "Mitchell", "Montgomery", "Moore", "Nash", "New Hanover", "Northampton", "Onslow", "Orange", "Pamlico", "Pasquotank",
  "Pender", "Perquimans", "Person", "Pitt", "Polk", "Randolph", "Richmond", "Robeson", "Rockingham", "Rowan",
  "Rutherford", "Sampson", "Scotland", "Stanly", "Stokes", "Surry", "Swain", "Transylvania", "Tyrrell", "Union",
  "Vance", "Wake", "Warren", "Washington", "Watauga", "Wayne", "Wilkes", "Wilson", "Yadkin", "Yancey",
];

export type CountyType = "Rural" | "Suburban" | "Urban" | "Outside NC";
export const COUNTY_TYPES: CountyType[] = ["Rural", "Suburban", "Urban", "Outside NC"];

// "wake", "Wake County", "WAKE CO." → "Urban". Blank → "". Not an NC county → "Outside NC".
export function countyType(raw: string): CountyType | "" {
  const name = String(raw || "").trim().replace(/\s+(county|co\.?)$/i, "").toLowerCase();
  if (!name) return "";
  const match = NC_COUNTIES.find((c) => c.toLowerCase() === name);
  if (!match) return "Outside NC";
  return NC_URBAN.includes(match) ? "Urban" : NC_SUBURBAN.includes(match) ? "Suburban" : "Rural";
}

// The 11 GICS sectors (Global Industry Classification Standard, MSCI and S&P), as listed at
// msci.com/indexes/index-resources/gics, including the 2023 reclassification.
// Government agencies and nonprofits don't fit GICS, so they go under "Government or nonprofit".
export const GICS_SECTORS = [
  "Energy", "Materials", "Industrials", "Consumer Discretionary", "Consumer Staples", "Health Care",
  "Financials", "Information Technology", "Communication Services", "Utilities", "Real Estate",
];
export const OTHER_SECTOR = "Government or nonprofit";

// Matches a typed sector to the official name, so "IT", "healthcare" or "financial" still group correctly.
export function gicsSector(raw: string): string {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return "";
  const exact = GICS_SECTORS.find((g) => g.toLowerCase() === s);
  if (exact) return exact;
  const alias: [RegExp, string][] = [
    [/payment|fintech|transaction/, "Financials"], // moved from IT to Financials in MSCI's 2023 GICS update
    [/^it$|tech|software/, "Information Technology"],
    [/health|medical|pharma|biotech/, "Health Care"],
    [/financ|bank|insur/, "Financials"],
    [/real estate|property/, "Real Estate"],
    [/telecom|media|communication/, "Communication Services"],
    [/staples|grocery|food|beverage|agricultur/, "Consumer Staples"],
    [/retail|restaurant|hospitality|consumer/, "Consumer Discretionary"],
    [/manufactur|logistic|transport|construct|industrial|consult|accounting|professional/, "Industrials"],
    [/chemical|material|mining|paper|packag/, "Materials"],
    [/oil|gas|energy/, "Energy"],
    [/utilit/, "Utilities"],
    [/gov|nonprofit|non-profit|public/, OTHER_SECTOR],
  ];
  return alias.find(([re]) => re.test(s))?.[1] ?? raw.trim();
}

// Suggested functional areas for internships. Not a standard list; teams can confirm or change it.
export const FUNCTIONAL_AREAS = [
  "Accounting", "Finance", "Marketing", "Sales", "Operations and supply chain", "Human resources",
  "Information systems and analytics", "Management and strategy", "Entrepreneurship",
];
