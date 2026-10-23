import { Icon } from "./Icon";

export type View = "report" | "programs" | "hub" | "team" | "stories" | "contribute";
export type Theme = "light" | "dark";

const tabs: { id: View; label: string }[] = [
  { id: "report", label: "Report" },
  { id: "programs", label: "Programs" },
  { id: "hub", label: "The Hub" },
  { id: "stories", label: "Stories" },
];

type Props = { view: View; go: (v: View) => void; theme: Theme; setTheme: (t: Theme) => void };

// Laid out like NC State's WordPress sites: dark utility bar with the red NC State
// block, a centered site title, then a plain text navigation row.
export function Header({ view, go, theme, setTheme }: Props) {
  const dark = theme === "dark";
  return (
    <>
      <div className="utility no-print">
        <a className="ncst-block" href="https://www.ncsu.edu" target="_blank" rel="noopener noreferrer" aria-label="NC State University home">
          <span className="ncst-1">NC STATE</span>
          <span className="ncst-2">UNIVERSITY</span>
        </a>
        <div className="utility-in">
          <button className="theme" onClick={() => setTheme(dark ? "light" : "dark")} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}>
            <Icon name={dark ? "sun" : "moon"} size={15} />
            <span>{dark ? "Light mode" : "Dark mode"}</span>
          </button>
        </div>
      </div>
      <div className="site-title no-print">
        <a className="unit" href="https://poole.ncsu.edu" target="_blank" rel="noopener noreferrer">Poole College of Management</a>
        <button className="title" onClick={() => go("report")}>High-Impact Experiences</button>
      </div>
      <header className="navbar no-print">
        <div className="wrap navbar-in">
          <nav role="tablist" aria-label="Report sections">
            {tabs.map((t) => (
              <button key={t.id} role="tab" aria-selected={view === t.id} onClick={() => go(t.id)}>
                {t.label}
              </button>
            ))}
          </nav>
          <button className="contrib" aria-pressed={view === "contribute"} onClick={() => go("contribute")}>
            Contribute data <Icon name="arrow" size={16} />
          </button>
        </div>
      </header>
    </>
  );
}
