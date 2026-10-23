export type View = "report" | "programs" | "hub" | "stories" | "contribute";

const tabs: { id: View; label: string }[] = [
  { id: "report", label: "Report" },
  { id: "programs", label: "Programs" },
  { id: "hub", label: "The Hub" },
  { id: "stories", label: "Stories" },
];

export function Header({ view, go, demo }: { view: View; go: (v: View) => void; demo: boolean }) {
  return (
    <header>
      <div className="wrap">
        <div className="hrow">
          <div className="brand">
            <b>POOLE HIE</b>
            <span>Engagement Report</span>
          </div>
          {demo && <span className="proto">Demo data</span>}
        </div>
        <div className="navrow">
          <nav role="tablist" aria-label="Report sections">
            {tabs.map((t) => (
              <button key={t.id} role="tab" aria-selected={view === t.id} onClick={() => go(t.id)}>
                {t.label}
              </button>
            ))}
          </nav>
          <button className="contrib" aria-selected={view === "contribute"} onClick={() => go("contribute")}>
            Contribute data
          </button>
        </div>
      </div>
    </header>
  );
}
