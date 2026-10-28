import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { Metric, Provenance, SourceKind } from "../data/types";
import { Icon, iconFor, type IconName } from "./Icon";
import { usePhotos } from "../lib/photos";
import { PhotoPicker } from "./PhotoPicker";

const kindLabel: Record<SourceKind, string> = {
  live: "Live",
  upload: "Uploaded",
  report: "Report",
  waiting: "Not reported",
  sample: "Sample data",
};

export const statusText = { live: "Live", upload: "Uploaded", report: "Annual report", waiting: "Not reported", sample: "Sample data" } as const;

// Each program area gets one NC State brand color. The colors are tokens in styles.css:
// --a-<id> for text and icons (adjusted for dark mode), --b-<id> for solid color blocks.
const accentIds = ["global", "internships", "practicum", "leadership", "packways", "career", "hub", "stories", "contribute"];
const programToSection: Record<string, string> = {
  global: "global",
  internships: "internships",
  courses: "practicum",
  practicum: "practicum",
  packways: "packways",
  leadership: "leadership",
  "student leadership": "leadership",
  career: "career",
  hub: "hub",
};

export function accentVar(id: string): string {
  return accentIds.includes(id) ? `var(--a-${id})` : "var(--red)";
}
export function accentForProgram(program: string): string {
  return programToSection[program.toLowerCase()] ?? "red";
}
export const accentStyle = (id: string) =>
  ({ "--accent": accentVar(id), "--block": accentIds.includes(id) ? `var(--b-${id})` : "var(--b-red)" }) as CSSProperties;

export function formatDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function Chip({ kind, text }: { kind: SourceKind; text?: string }) {
  return <span className={`chip c-${kind}`}>{text ?? kindLabel[kind]}</span>;
}

export function SourceLine({ source }: { source: Provenance }) {
  const parts = [source.label, source.updatedBy, source.updatedOn && formatDate(source.updatedOn)].filter(Boolean);
  return <span className="src">{parts.join(" · ")}</span>;
}

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// True once the element has scrolled into view.
function useInView<T extends Element>(): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (!("IntersectionObserver" in window)) { setSeen(true); return; }
    const io = new IntersectionObserver(
      (entries) => { if (entries.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); } },
      { threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen];
}

// Fades its children in when they scroll into view.
export function Reveal({ children, className = "", delay = 0, style, id, title }: { children: ReactNode; className?: string; delay?: number; style?: CSSProperties; id?: string; title?: string }) {
  const [ref, seen] = useInView<HTMLDivElement>();
  return (
    <div ref={ref} id={id} title={title} className={`reveal${seen ? " in" : ""} ${className}`} style={{ ...style, transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

// Counts a number up from zero the first time it's seen. Values with more than one
// number in them (e.g. "5 of 10") are shown as they are. Print always shows the final value.
export function CountUp({ value }: { value: string }) {
  const match = /^(\D*)(\d[\d,]*(?:\.\d+)?)(\D*)$/.exec(value);
  const [ref, seen] = useInView<HTMLSpanElement>();
  const target = match ? parseFloat(match[2].replace(/,/g, "")) : 0;
  const [n, setN] = useState(0);

  useEffect(() => {
    if (!match || !seen) return;
    if (reducedMotion()) { setN(target); return; }
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 1100);
      setN(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [seen, target]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!match) return <span>{value}</span>;
  const decimals = match[2].includes(".") ? match[2].split(".")[1].length : 0;
  const shown = n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: match[2].includes(",") });
  return (
    <span ref={ref} aria-label={value}>
      <span className="cu-screen" aria-hidden="true">{match[1]}{seen ? shown : "0"}{match[3]}</span>
      <span className="cu-print" aria-hidden="true">{value}</span>
    </span>
  );
}

// NC State-style big statistic.
export function Fact({ m, accent = "hub", delay = 0, icon }: { m: Metric; accent?: string; delay?: number; icon?: IconName }) {
  return (
    <Reveal className="fact" delay={delay} style={accentStyle(accent)} title={sourceTitle(m.source)}>
      <span className="fact-ic"><Icon name={icon ?? iconFor(m.id)} size={22} /></span>
      <div className="fact-n"><CountUp value={m.value} /></div>
      <div className="fact-l">{m.label}</div>
      {m.change && <div className="d">{m.change}</div>}
    </Reveal>
  );
}

// NC State "split header": an uploaded photo next to a solid brand-color block.
// With no photo for this page, the color block runs full width.
// People who can manage photos see a button to add or change it.
export function SplitHeader({ eyebrow, title, lead, accent = "red", slot, children, compact }: {
  eyebrow?: string; title: string; lead?: ReactNode; icon?: IconName; accent?: string; slot?: string; children?: ReactNode; compact?: boolean;
}) {
  const { lib, photoFor } = usePhotos();
  const key = slot ?? accent;
  const photo = photoFor(key);
  const [picking, setPicking] = useState(false);
  return (
    <section className={`split${compact ? " compact" : ""}${photo ? "" : " no-photo"}`} style={accentStyle(accent)}>
      {photo && <div className="photo-panel"><img src={photo.src} alt={photo.name} /></div>}
      <div className="split-body">
        {lib.canEdit && (
          <button className="photo-btn no-print" onClick={() => setPicking(true)}>
            <Icon name="camera" size={15} /> {photo ? "Change photo" : "Add photo"}
          </button>
        )}
        {eyebrow && <p className="split-eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {lead && <p className="split-lead">{lead}</p>}
        {children && <div className="split-cta">{children}</div>}
      </div>
      {picking && <PhotoPicker slot={key} label={title} onClose={() => setPicking(false)} />}
    </section>
  );
}

// One sources note per page, instead of a source line under every number.
// Each number still shows its own source on hover.
export function SourcesNote({ metrics }: { metrics: Metric[] }) {
  const bySource = new Map<string, Provenance>();
  for (const m of metrics) {
    const prev = bySource.get(m.source.label);
    if (!prev || (m.source.updatedOn ?? "") > (prev.updatedOn ?? "")) bySource.set(m.source.label, m.source);
  }
  if (!bySource.size) return null;
  return (
    <footer className="sources">
      <span className="label">Sources</span>
      <ul>
        {[...bySource.values()].map((p) => (
          <li key={p.label}>
            <b>{p.label}</b>
            {[p.updatedBy, p.kind === "sample" ? "sample rows" : p.updatedOn && `updated ${formatDate(p.updatedOn)}`].filter(Boolean).map((x) => ` · ${x}`).join("")}
          </li>
        ))}
      </ul>
    </footer>
  );
}

export const sourceTitle = (p: Provenance) =>
  `Source: ${[p.label, p.updatedBy, p.updatedOn && `updated ${formatDate(p.updatedOn)}`].filter(Boolean).join(" · ")}`;

// Tiny bar chart for cards. Bars grow in when the card scrolls into view.
export function MiniBars({ chart }: { chart: { title: string; categories: string[]; series: { name: string; values: number[] }[] } }) {
  // Show the biggest series (e.g. applicants rather than placements).
  const total = (x: { values: number[] }) => x.values.reduce((a, b) => a + b, 0);
  const s = [...chart.series].sort((a, b) => total(b) - total(a))[0];
  if (!s || s.values.length < 2) return null;
  const max = Math.max(...s.values, 1);
  const peak = s.values.indexOf(max);
  const w = 100 / s.values.length;
  return (
    <span className="mini">
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
        {s.values.map((v, i) => (
          <rect
            key={i}
            x={i * w + w * 0.12}
            width={w * 0.76}
            y={40 - Math.max(1.5, (v / max) * 40)}
            height={Math.max(1.5, (v / max) * 40)}
            className={i === peak ? "mini-peak" : "mini-bar"}
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <title>{`${chart.categories[i]}: ${v}`}</title>
          </rect>
        ))}
      </svg>
      <span className="mini-cap">{chart.series.length > 1 ? `${s.name}, ${chart.categories[0]} to ${chart.categories[chart.categories.length - 1]}` : chart.title}</span>
    </span>
  );
}

export function LabeledSection({ label, title, aside, children, className = "" }: { label: string; title?: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`labeled ${className}`}>
      <div className="labeled-head">
        <div>
          <p className="label">{label}</p>
          {title && <h2>{title}</h2>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

export type DownloadItem = { label: string; hint?: string; icon: IconName; run: () => void | Promise<void> };

// Button with a dropdown of download formats.
export function DownloadMenu({ items, label = "Download", compact }: { items: DownloadItem[]; label?: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);

  async function run(item: DownloadItem) {
    setBusy(item.label);
    // Let "Preparing…" paint before heavy work starts.
    await new Promise((r) => setTimeout(r, 30));
    try { await item.run(); } finally { setBusy(null); setOpen(false); }
  }

  return (
    <div className={`dl no-print${compact ? " compact" : ""}`} ref={ref}>
      <button className={compact ? "dl-btn" : "btn"} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} title={label} aria-label={compact ? label : undefined}>
        <Icon name="download" size={compact ? 16 : 18} />
        {!compact && <span>{label}</span>}
        {!compact && <Icon name="down" size={16} />}
      </button>
      {open && (
        <div className="dl-menu" role="menu">
          {items.map((it) => (
            <button key={it.label} role="menuitem" className="dl-item" disabled={!!busy} onClick={() => void run(it)}>
              <Icon name={it.icon} size={18} />
              <span>
                <b>{busy === it.label ? "Preparing…" : it.label}</b>
                {it.hint && <small>{it.hint}</small>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w) && !["and", "team", "the"].includes(w.toLowerCase()))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}
