import { useCallback, useEffect, useState } from "react";
import type { ReportData } from "./data/types";
import { getReport } from "./data/api";
import { Header, type Theme, type View } from "./components/Header";
import { ReportPage } from "./pages/ReportPage";
import { ProgramsPage } from "./pages/ProgramsPage";
import { HubPage } from "./pages/HubPage";
import { StoriesPage } from "./pages/StoriesPage";
import { ContributePage } from "./pages/ContributePage";
import { PhotosProvider } from "./lib/photos";

// The Team page (pages/TeamPage.tsx) is on hold, so it has no tab or route for now.
const views: View[] = ["report", "programs", "hub", "stories", "contribute"];
// Links look like #hub or #programs/internships.
const fromHash = (): { view: View; anchor?: string } => {
  const [v, sub] = window.location.hash.slice(1).split("/");
  if (!views.includes(v as View)) return { view: "report" };
  return { view: v as View, anchor: sub ? `p-${sub}` : undefined };
};

// Light by default; a viewer's dark-mode choice is remembered in this browser only.
const THEME_KEY = "hie-theme";
const initialTheme = (): Theme => {
  try { return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light"; } catch { return "light"; }
};

export default function App() {
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>(() => fromHash().view);
  const [anchor, setAnchor] = useState<string | undefined>(() => fromHash().anchor);
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    getReport().then(setData).catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* storage may be blocked */ }
  }, [theme]);

  const go = useCallback((v: View, a?: string) => {
    setView(v);
    setAnchor(a);
    try { history.replaceState(null, "", `#${v}${a ? "/" + a.replace(/^p-/, "") : ""}`); } catch { /* Apps Script iframe may block this */ }
  }, []);

  // After a view change, jump to the requested card or to the top.
  useEffect(() => {
    const el = anchor ? document.getElementById(anchor) : null;
    if (el) el.scrollIntoView({ block: "start" });
    else window.scrollTo(0, 0);
  }, [view, anchor]);

  return (
    <PhotosProvider>
      <Header view={view} go={go} theme={theme} setTheme={setTheme} />
      <main className="wrap">
        <div className="print-brand" aria-hidden="true">
          <span><b>NC State University</b> · Poole College of Management</span>
          <span>High-Impact Experiences</span>
        </div>
        {error && <div className="msg err">Couldn't load the report: {error}</div>}
        {!data && !error && <div className="loading"><span className="spinner" aria-hidden="true" />Loading the report…</div>}
        {data && view === "report" && <ReportPage data={data} go={go} />}
        {data && view === "programs" && <ProgramsPage data={data} anchor={anchor} />}
        {data && view === "hub" && <HubPage data={data} />}
        {data && view === "stories" && <StoriesPage data={data} />}
        {data && view === "contribute" && <ContributePage data={data} />}
      </main>
      <footer className="foot-site">
        <div className="foot-brick" aria-hidden="true" />
        <div className="wrap foot-in">
          <div className="foot-unit">
            <b>Poole College of Management</b>
            <span>High-Impact Experiences</span>
          </div>
          <div className="foot-links">
            <a href="https://poole.ncsu.edu" target="_blank" rel="noopener noreferrer">poole.ncsu.edu</a>
            <a href="https://www.ncsu.edu" target="_blank" rel="noopener noreferrer">ncsu.edu</a>
          </div>
        </div>
        <div className="foot-legal">
          <div className="wrap">© {new Date().getFullYear()} NC State University. All rights reserved.</div>
        </div>
      </footer>
    </PhotosProvider>
  );
}
