import { useState } from "react";
import type { ReportData, UploadTemplate } from "../data/types";
import { appendRows } from "../data/api";
import { Chip, LabeledSection, Reveal, SplitHeader, accentStyle } from "../components/ui";
import { parseCsv, validateAgainstTemplate } from "../lib/csv";
import { saveCsv, slug } from "../lib/download";
import { Icon, iconFor, type IconName } from "../components/Icon";
import { PhotoGallery } from "../components/PhotoGallery";

type Status = { ok: boolean; text: string } | null;

const ways: { icon: IconName; title: string; text: string; best: string }[] = [
  { icon: "table", title: "A tab in a shared Google Sheet", text: "The team adds rows in the template's columns. The dashboard reads the tab directly, so there's nothing to send.", best: "Best for most programs" },
  { icon: "file", title: "A Google Form", text: "Each response becomes a row. Good for things logged one at a time, like stories, events or applications.", best: "Best for ongoing entries" },
  { icon: "upload", title: "An export you already make", text: "Download from Smartsheet, Suitable or another system and upload the file below. It's checked before anything changes.", best: "Best for systems we can't link" },
  { icon: "spark", title: "A live link to an existing sheet", text: "If a sheet already exists, like the Hub kiosk, the dashboard can read it as it is.", best: "Best when a sheet already exists" },
];

const kindText = { live: "Live", upload: "Uploaded", report: "Report", waiting: "No rows yet", sample: "Using sample rows" } as const;

export function ContributePage({ data }: { data: ReportData }) {
  const uploadable = data.templates.filter((t) => t.id !== "hub_checkins");
  const [filter, setFilter] = useState<"all" | "confirmed" | "placeholder">("all");
  const [open, setOpen] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState(uploadable[0]?.id ?? "");
  const [rows, setRows] = useState<string[][] | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const template = uploadable.find((t) => t.id === templateId);
  const required = (t: UploadTemplate) => t.columns.filter((c) => !c.optional).map((c) => c.name);
  const areaName = (id: string) => data.sections.find((s) => s.id === id)?.kicker ?? (id === "hub" ? "The Hub" : id === "stories" ? "Stories" : "Settings");
  const list = data.templates.filter((t) => filter === "all" || t.status === filter);

  async function readFile(file: File) {
    if (!template) return;
    const result = validateAgainstTemplate(parseCsv(await file.text()), required(template));
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
      setStatus({ ok: true, text: `Added ${res.added} rows to the ${template.sheetTab} tab.` });
      setRows(null);
    } catch (e) {
      setStatus({ ok: false, text: `Upload failed: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  }

  const downloadTemplate = (t: UploadTemplate) =>
    saveCsv([t.columns.map((c) => c.name), t.columns.map((c) => c.example)], `HIE-template-${slug(t.name)}.csv`);
  const useForUpload = (t: UploadTemplate) => {
    setTemplateId(t.id);
    setRows(null);
    setStatus(null);
    document.getElementById("uploader")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="view">
      <SplitHeader
        eyebrow="For program teams"
        title="Data and templates"
        lead="The dashboard does the analysis. Each program only needs to keep a simple list of what happened, in the columns below. Templates marked “to confirm” are starting points to talk through with that team."
        accent="contribute"
      />

      <LabeledSection label="Ways to share data" title="Pick whatever is easiest for the team">
        <div className="ways">
          {ways.map((w, i) => (
            <Reveal key={w.title} className="way" delay={i * 60}>
              <span className="way-ic"><Icon name={w.icon} size={22} /></span>
              <b>{w.title}</b>
              <p>{w.text}</p>
              <span className="way-best">{w.best}</span>
            </Reveal>
          ))}
        </div>
      </LabeledSection>

      <LabeledSection
        label="Templates"
        title="What each program keeps"
        aside={
          <div className="filters" role="group" aria-label="Filter templates">
            {(["all", "confirmed", "placeholder"] as const).map((f) => (
              <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {f === "all" ? "All" : f === "confirmed" ? "Format known" : "To confirm"}
              </button>
            ))}
          </div>
        }
      >
        <div className="tpl-list">
          {list.map((t) => {
            const isOpen = open === t.id;
            const accent = ["hub", "stories", "settings"].includes(t.area) ? (t.area === "hub" ? "hub" : t.area === "stories" ? "stories" : "red") : t.area;
            return (
              <div key={t.id} className={`tpl${isOpen ? " open" : ""}`} style={accentStyle(accent)}>
                <button className="tpl-head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : t.id)}>
                  <span className="tpl-ic"><Icon name={t.area === "settings" ? "spark" : iconFor(t.area)} size={20} /></span>
                  <span className="tpl-name">
                    <b>{t.name}</b>
                    <small>{areaName(t.area)} · {t.owner} · {t.columns.length} {t.columns.length === 1 ? "column" : "columns"}</small>
                  </span>
                  <span className={`tpl-status ${t.status}`}>{t.status === "confirmed" ? "Format known" : "To confirm"}</span>
                  <Chip kind={t.kind} text={kindText[t.kind]} />
                  <Icon name="down" size={18} />
                </button>
                {isOpen && (
                  <div className="tpl-body">
                    <p className="tpl-desc">{t.description}</p>
                    <div className="tpl-grid">
                      <div className="tscroll">
                        <table>
                          <thead><tr><th>Column</th><th>Example</th><th>Notes</th></tr></thead>
                          <tbody>
                            {t.columns.map((c) => (
                              <tr key={c.name}>
                                <td><b>{c.name}</b>{c.optional && <small className="src"> (optional)</small>}</td>
                                <td className="num">{c.example || "—"}</td>
                                <td className="src">{c.note ?? ""}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="tpl-side">
                        <p className="label">The dashboard works out</p>
                        <ul className="tpl-powers">
                          {t.powers.map((p) => <li key={p}><Icon name="spark" size={14} /> {p}</li>)}
                        </ul>
                        <dl className="tpl-meta">
                          <dt>Likely source</dt><dd>{t.likelySource}</dd>
                          <dt>How often</dt><dd>{t.cadence}</dd>
                          <dt>Sheet tab</dt><dd>{t.sheetTab}</dd>
                        </dl>
                      </div>
                    </div>
                    <div className="tpl-actions">
                      <button className="btn" onClick={() => downloadTemplate(t)}><Icon name="download" size={16} /> Download template</button>
                      {t.id !== "hub_checkins" && <button className="btn-ghost" onClick={() => useForUpload(t)}>Upload a filled file</button>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </LabeledSection>

      {data.openIssues.length > 0 && (
        <div className="notice">
          <strong><Icon name="spark" size={16} /> Data notes</strong>
          <p className="src">Checked automatically each time the data loads.</p>
          <ul>
            {data.openIssues.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="panel" id="uploader">
        <p className="label">Upload a file</p>
        <h2>Add rows from a spreadsheet</h2>
        <p className="src">Pick the template, then drop a CSV with those columns (any order). The file is checked before anything changes.</p>
        <label className="field" htmlFor="tpl">
          Template
          <select id="tpl" className="f" value={templateId} onChange={(e) => { setTemplateId(e.target.value); setRows(null); setStatus(null); }}>
            {uploadable.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>
        <p className="label" style={{ marginTop: 6 }}>Required columns</p>
        <div className="cols">{template ? required(template).join(", ") : ""}</div>
        <div
          className={`drop${over ? " over" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) void readFile(f); }}
        >
          <span className="drop-ic"><Icon name="upload" size={28} /></span>
          <span>Drop a CSV here, or{" "}
            <label htmlFor="file" className="link">choose a file</label></span>
          <input id="file" type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void readFile(f); e.target.value = ""; }} />
        </div>
        {status && <div className={`msg ${status.ok ? "ok" : "err"}`}>{status.text}</div>}
        {rows && template && (
          <div className="tscroll">
            <table>
              <thead><tr>{required(template).map((c) => <th key={c}>{c}</th>)}</tr></thead>
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
            {busy ? "Adding…" : "Add to the dashboard"}
          </button>
        </div>
      </div>

      <PhotoGallery sections={data.sections} />
    </div>
  );
}
