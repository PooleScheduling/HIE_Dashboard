import { useEffect, useState } from "react";
import type { DataSource, ReportData, UploadTemplate } from "../data/types";
import { getAccess, importSource, importUpload } from "../data/api";
import { Chip, LabeledSection, Reveal, SplitHeader, accentStyle, formatDate } from "../components/ui";
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

const kindText = { live: "Live", upload: "Source file", report: "Report", waiting: "No rows yet", sample: "Sample data" } as const;

// "2026-27" for the academic year (Aug to Jul) that contains the report date.
const academicYear = (iso: string) => {
  const y = Number(iso.slice(0, 4)), m = Number(iso.slice(5, 7));
  const start = m >= 8 ? y : y - 1;
  return `${start}-${String(start + 1).slice(2)}`;
};

export function ContributePage({ data }: { data: ReportData }) {
  const takesFiles = (s: DataSource) => !/^live/i.test(s.type ?? s.howItGetsIn);
  const uploadSources = data.sources.filter(takesFiles);
  const [canEdit, setCanEdit] = useState(false);
  const [filter, setFilter] = useState<"all" | "confirmed" | "placeholder">("all");
  const [open, setOpen] = useState<string | null>(null);
  const [sourceId, setSourceId] = useState(uploadSources[0]?.id ?? "");
  const [year, setYear] = useState(academicYear(data.asOf));
  const [table, setTable] = useState<string[][] | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [pullStatus, setPullStatus] = useState<Status>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const source = uploadSources.find((s) => s.id === sourceId);
  const template = data.templates.find((t) => t.id === source?.dataset);
  const required = (t: UploadTemplate) => t.columns.filter((c) => !c.optional).map((c) => c.name);
  const areaName = (id: string) => data.sections.find((s) => s.id === id)?.kicker ?? (id === "hub" ? "The Hub" : id === "wall" ? "HIE Wall" : id === "stories" ? "Stories" : "Settings");
  const list = data.templates.filter((t) => filter === "all" || t.status === filter);

  useEffect(() => { getAccess().then((a) => setCanEdit(a.canEdit)).catch(() => setCanEdit(false)); }, []);

  async function readFile(file: File) {
    if (!template) return;
    const parsed = parseCsv(await file.text());
    const result = validateAgainstTemplate(parsed, required(template));
    if (!result.ok) {
      setTable(null);
      setStatus({ ok: false, text: result.error });
      return;
    }
    setTable(parsed);
    setStatus({ ok: true, text: `${result.rows.length} rows look good. Check the preview, then import.` });
  }

  async function commit() {
    if (!table || !source) return;
    setBusy("upload");
    try {
      const res = await importUpload(source.id!, year.trim(), table);
      setStatus({ ok: true, text: `Imported ${res.added} rows for ${res.year}.${res.archived ? ` ${res.archived} older rows from the same source and year were moved to the Archive tab.` : ""} Reload to see the new numbers.` });
      setTable(null);
    } catch (e) {
      setStatus({ ok: false, text: `Import failed: ${(e as Error).message}` });
    } finally {
      setBusy(null);
    }
  }

  async function pull(s: DataSource) {
    setBusy(s.id ?? "");
    try {
      const res = await importSource(s.id!);
      setPullStatus({ ok: true, text: `${s.name}: imported ${res.added} rows for ${res.year}.${res.archived ? ` ${res.archived} older rows were archived.` : ""} Reload to see the new numbers.` });
    } catch (e) {
      setPullStatus({ ok: false, text: `${s.name}: ${(e as Error).message}` });
    } finally {
      setBusy(null);
    }
  }

  const downloadTemplate = (t: UploadTemplate) =>
    saveCsv([t.columns.map((c) => c.name), t.columns.map((c) => c.example)], `HIE-template-${slug(t.name)}.csv`);
  const chooseSource = (id: string) => {
    setSourceId(id);
    setTable(null);
    setStatus(null);
    const s = uploadSources.find((x) => x.id === id);
    if (s?.year) setYear(s.year);
    document.getElementById("uploader")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const useForUpload = (t: UploadTemplate) => {
    const s = uploadSources.find((x) => x.dataset === t.id);
    if (s?.id) chooseSource(s.id);
  };

  return (
    <div className="view">
      <SplitHeader
        eyebrow="For program teams"
        title="Data and templates"
        lead="The dashboard does the analysis. Each program only needs to keep a simple list of what happened, in the columns below. Templates marked “to confirm” are starting points to talk through with that team."
        accent="contribute"
      />

      <LabeledSection label="Sources" title="Where the data comes from">
        <p className="src" style={{ marginBottom: 12 }}>
          The list lives in the Sources tab of the HIE Data Hub sheet. Sources are only ever read: imports copy the rows into the Data Hub, and a new import for the same source and year replaces the old rows after moving them to the Archive tab. Links open the original for anyone with access to it.
        </p>
        <div className="tscroll">
          <table>
            <thead><tr><th>Source</th><th>Feeds</th><th>Owner</th><th>How it gets in</th><th>Year</th><th>Status</th><th>Last updated</th>{canEdit && <th />}</tr></thead>
            <tbody>
              {data.sources.map((s) => (
                <tr key={s.id ?? s.name}>
                  <td>{s.link ? <a href={s.link} target="_blank" rel="noopener noreferrer"><b>{s.name}</b> ↗</a> : <b>{s.name}</b>}</td>
                  <td>{s.feeds}</td>
                  <td>{s.owner}</td>
                  <td>{s.type ?? s.howItGetsIn}</td>
                  <td>{s.year ?? "—"}</td>
                  <td><Chip kind={s.kind} text={kindText[s.kind]} /></td>
                  <td>{s.lastUpdated ? formatDate(s.lastUpdated) : "—"}{s.rows ? ` · ${s.rows.toLocaleString("en-US")} rows` : ""}</td>
                  {canEdit && (
                    <td>
                      {/google sheet/i.test(s.type ?? "") && s.link && (
                        <button className="btn-ghost" disabled={!!busy} onClick={() => void pull(s)}>{busy === s.id ? "Importing…" : "Import"}</button>
                      )}
                      {/file upload/i.test(s.type ?? "") && s.id && (
                        <button className="btn-ghost" onClick={() => chooseSource(s.id!)}>Upload</button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pullStatus && <div className={`msg ${pullStatus.ok ? "ok" : "err"}`}>{pullStatus.text}</div>}
      </LabeledSection>

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
                      {canEdit && t.cadence !== "Live" && uploadSources.some((s) => s.dataset === t.id) && <button className="btn-ghost" onClick={() => useForUpload(t)}>Upload a filled file</button>}
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

      {canEdit && (
      <div className="panel" id="uploader">
        <p className="label">Import a file</p>
        <h2>Add a year of data from an export</h2>
        <p className="src">Pick the source and the year the file covers, then drop a CSV with the template's columns (any order). The file is checked before anything changes. Importing the same source and year again replaces those rows; the old ones are archived, never deleted.</p>
        <label className="field" htmlFor="src">
          Source
          <select id="src" className="f" value={sourceId} onChange={(e) => chooseSource(e.target.value)}>
            {uploadSources.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.feeds})</option>
            ))}
          </select>
        </label>
        <label className="field" htmlFor="year">
          Year this file covers
          <input id="year" className="f" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2026-27, Summer 2027 or Fall 2026" />
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
        {table && template && (
          <div className="tscroll">
            <table>
              <thead><tr>{table[0].map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
              <tbody>
                {table.slice(1, 7).map((r, i) => (
                  <tr key={i}>{r.map((v, j) => <td key={j}>{v}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div>
          <button className="btn" disabled={!table || !year.trim() || !!busy} onClick={commit}>
            {busy === "upload" ? "Importing…" : `Import for ${year.trim() || "…"}`}
          </button>
        </div>
      </div>
      )}

      <PhotoGallery sections={data.sections} />
    </div>
  );
}
