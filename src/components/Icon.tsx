// Small line icons drawn inline so the app needs no icon library.
const paths = {
  globe: ["M3 12h18", "M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18"],
  briefcase: ["M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2", "M3 13h18"],
  clipboard: ["M9 4V3h6v1", "M9 11h6", "M9 15h4"],
  compass: ["M15.5 8.5l-2 5-5 2 2-5z"],
  rocket: ["M9 15l-3-3c1-4 4.5-8.5 12-9-.5 7.5-5 11-9 12z", "M6.5 15.5C5 16.5 4.5 18.5 4.5 19.5c1 0 3-.5 4-2"],
  pin: ["M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z"],
  home: ["M4 11l8-7 8 7", "M6 10v10h12V10"],
  quote: ["M4 5h16v11H9l-5 4z"],
  upload: ["M12 16V4", "M7 9l5-5 5 5", "M4 16v4h16v-4"],
  arrow: ["M5 12h14", "M13 6l6 6-6 6"],
  left: ["M15 6l-6 6 6 6"],
  right: ["M9 6l6 6-6 6"],
  moon: ["M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"],
  sun: ["M12 2v2", "M12 20v2", "M2 12h2", "M20 12h2", "M4.9 4.9l1.4 1.4", "M17.7 17.7l1.4 1.4", "M4.9 19.1l1.4-1.4", "M17.7 6.3l1.4-1.4"],
  users: ["M2.5 20a6.5 6.5 0 0 1 13 0", "M16 4.5a3.5 3.5 0 0 1 0 7", "M18 14a6 6 0 0 1 3.5 6"],
  clock: ["M12 7v5l3 2"],
  calendar: ["M3 10h18", "M8 3v4", "M16 3v4"],
  spark: ["M12 3v4", "M12 17v4", "M3 12h4", "M17 12h4", "M6 6l2.5 2.5", "M15.5 15.5L18 18", "M6 18l2.5-2.5", "M15.5 8.5L18 6"],
  database: ["M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6", "M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"],
  download: ["M12 4v12", "M7 11l5 5 5-5", "M4 20h16"],
  image: ["M3 16l5-5 4 4 3-3 6 6", "M15 8.5h.01"],
  table: ["M3 9h18", "M3 15h18", "M9 3v18"],
  file: ["M14 3H6v18h12V7z", "M14 3v4h4", "M9 13h6", "M9 17h6"],
  printer: ["M6 9V3h12v6", "M6 17H4v-6h16v6h-2", "M6 14h12v7H6z"],
  down: ["M6 9l6 6 6-6"],
  close: ["M6 6l12 12", "M18 6L6 18"],
  trash: ["M4 7h16", "M10 11v6", "M14 11v6", "M6 7l1 13h10l1-13", "M9 7V4h6v3"],
  camera: ["M4 8h3l2-3h6l2 3h3v12H4z"],
  tree: ["M12 3v6", "M5 15v-3h14v3", "M12 9v3"],
  trend: ["M3 17l6-6 4 4 8-8", "M15 7h6v6"],
  sun2: ["M12 3v2", "M5.6 5.6l1.4 1.4", "M3 12h2", "M19 12h2", "M17 7l1.4-1.4"],
} as const;

export type IconName = keyof typeof paths;

// Extra shapes (circles, rects) for icons that need more than paths.
const extras: Partial<Record<IconName, JSX.Element>> = {
  globe: <circle cx="12" cy="12" r="9" />,
  briefcase: <rect x="3" y="7" width="18" height="13" rx="2" />,
  clipboard: <rect x="5" y="4" width="14" height="17" rx="2" />,
  compass: <circle cx="12" cy="12" r="9" />,
  rocket: <circle cx="14.5" cy="9.5" r="1.5" />,
  pin: <circle cx="12" cy="9" r="2.5" />,
  sun: <circle cx="12" cy="12" r="4" />,
  users: <circle cx="9" cy="8" r="3.5" />,
  clock: <circle cx="12" cy="12" r="9" />,
  calendar: <rect x="3" y="5" width="18" height="16" rx="2" />,
  database: <ellipse cx="12" cy="6" rx="8" ry="3" />,
  image: <rect x="3" y="4" width="18" height="16" rx="1" />,
  table: <rect x="3" y="3" width="18" height="18" rx="1" />,
  camera: <circle cx="12" cy="14" r="3.5" />,
  tree: <><rect x="9" y="1" width="6" height="4" rx="1" /><rect x="2" y="15" width="6" height="5" rx="1" /><rect x="16" y="15" width="6" height="5" rx="1" /></>,
};

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="icon"
    >
      {extras[name]}
      {paths[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

// Which icon goes with which section, metric or program.
const byId: Record<string, IconName> = {
  global: "globe",
  abroad: "globe",
  internships: "briefcase",
  "sbip-apps": "briefcase",
  practicum: "clipboard",
  packways: "compass",
  career: "rocket",
  hub: "pin",
  "hub-taps": "users",
  "hub-peak-week": "calendar",
  "hub-peak-hour": "clock",
  "hub-peak-day": "calendar",
  team: "tree",
  "cov-students": "users",
  "cov-share": "trend",
  "cov-multi": "spark",
  "hub-avg": "calendar",
  "hub-trend": "trend",
  "hub-window": "clock",
};

export const iconFor = (id: string): IconName => byId[id] ?? "spark";
