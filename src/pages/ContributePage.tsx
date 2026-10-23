import { useState } from "react";
import type { ReportData } from "../data/types";
import { appendRows, isAppsScript } from "../data/api";
import { Chip, PageHead, formatDate } from "../components/ui";
import { parseCsv, validateAgainstTemplate } from "../lib/csv";

type Status = { ok: boolean; text: string } | null;

export function ContributePage({ data }: { data: ReportData }) {
  const [templateId, setTemplateId] = useState(data.templates[0]?.id ?? "");
  const [rows, setRows] = useState<string[][] | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const template = data.templates.find((t) => t.id === templateId);

  async function readFile(file: File) {
    if (!template) return;
    const result = validateAgainstTemplate(parseCsv(await file.text()), template.columns);
    if (!result.ok) {
      setRows(null);
      setStatus({ ok: false, text: result.error });
      return;
    }
    setRows(result.rows);
    setStatus({ ok: true, text: `${result.rows.length} rows look good. Check the preview, then add them.` });
  }

  async function commit() {
    if (!rows || !template) return;
    setBusy(true);
    try {
      const res = await appendRows(template.id, rows);
      setStatus({
        ok: true,
        text: `Added ${res.added} rows to the ${template.sheetTab} tab.${isAppsScript() ? "" : " (Local demo: nothing was saved.)"}`,
      });
      setRows(null);
    } catch (e) {
      setStatus({ ok: false, text: `Upload failed: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="view">
      <PageHead
        eyebrow="For program owners"
        title="Contribute data"
        lead="Every number in the report comes from a source listed here. Live sources update by themselves. For upload sources, the owner sends a fresh file on a set schedule."
      />

      {data.openIssues.length > 0 && (
        <div className="callout">
          <strong>Needs attention</strong>
          <ul>
            {data.openIssues.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="panel tscroll">
        <table>
          <thead>
            <tr>
              <th>Source</th>
              <th>Owner</th>
              <th>Feeds</th>
              <th>How it gets in</th>
              <th>Last updated</th>
            </tr>
          </thead>
          <tbody>
            {data.sources.map((s) => (
              <tr key={s.name}>
                <td><strong>{s.name}</strong></td>
                <td>{s.owner}</td>
                <td>{s.feeds}</td>
                <td><Chip kind={s.kind} text={s.howItGetsIn} /></td>
                <td className="num">{formatDate(s.lastUpdated)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2>Upload data</h2>
        <p className="src">Pick what you're uploading, then drop a CSV that uses that template's columns. The file is checked before anything changes.</p>
        <label className="field" htmlFor="tpl">
          Dataset
          <select id="tpl" className="f" value={templateId} onChange={(e) => { setTemplateId(e.target.value); setRows(null); setStatus(null); }}>
            {data.templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>
        <p className="eyebrow" style={{ marginTop: 14 }}>Required columns</p>
        <div className="cols">{template?.columns.join(", ")}</div>
        <div
          className={`drop${over ? " over" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) void readFile(f); }}
        >
          Drop a CSV here, or{" "}
          <label htmlFor="file" className="link">choose a file</label>
          <input id="file" type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void readFile(f); e.target.value = ""; }} />
        </div>
        {status && <div className={`msg ${status.ok ? "ok" : "err"}`}>{status.text}</div>}
        {rows && template && (
          <div className="tscroll">
            <table>
              <thead><tr>{template.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>
                {rows.slice(0, 6).map((r, i) => (
                  <tr key={i}>{r.map((v, j) => <td key={j}>{v}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div>
          <button className="btn" disabled={!rows || busy} onClick={commit}>
            {busy ? "Adding…" : "Add to report"}
          </button>
        </div>
      </div>
    </section>
  );
}
