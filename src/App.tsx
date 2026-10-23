import { useCallback, useEffect, useState } from "react";
import type { ReportData } from "./data/types";
import { getReport, isAppsScript } from "./data/api";
import { Header, type View } from "./components/Header";
import { ReportPage } from "./pages/ReportPage";
import { ProgramsPage } from "./pages/ProgramsPage";
import { HubPage } from "./pages/HubPage";
import { StoriesPage } from "./pages/StoriesPage";
import { ContributePage } from "./pages/ContributePage";

const views: View[] = ["report", "programs", "hub", "stories", "contribute"];
const initialView = (): View => {
  const h = window.location.hash.slice(1) as View;
  return views.includes(h) ? h : "report";
};

export default function App() {
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>(initialView);
  const [anchor, setAnchor] = useState<string | undefined>();

  useEffect(() => {
    getReport().then(setData).catch((e: Error) => setError(e.message));
  }, []);

  const go = useCallback((v: View, a?: string) => {
    setView(v);
    setAnchor(a);
    try { history.replaceState(null, "", `#${v}`); } catch { /* Apps Script iframe may block this */ }
  }, []);

  // After a view change, jump to the requested card or to the top.
  useEffect(() => {
    const el = anchor ? document.getElementById(anchor) : null;
    if (el) el.scrollIntoView({ block: "start" });
    else window.scrollTo(0, 0);
  }, [view, anchor]);

  return (
    <>
      <Header view={view} go={go} demo={!isAppsScript()} />
      <main className="wrap">
        {error && <div className="msg err">Couldn't load the report: {error}</div>}
        {!data && !error && <div className="loading">Loading the report…</div>}
        {data && view === "report" && <ReportPage data={data} go={go} />}
        {data && view === "programs" && <ProgramsPage data={data} />}
        {data && view === "hub" && <HubPage data={data} />}
        {data && view === "stories" && <StoriesPage data={data} />}
        {data && view === "contribute" && <ContributePage data={data} />}
      </main>
    </>
  );
}
