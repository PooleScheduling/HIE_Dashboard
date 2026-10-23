import { useState } from "react";
import type { Section } from "../data/types";
import { pageSlots, usePhotos } from "../lib/photos";
import { Icon } from "./Icon";

// Gallery on the Contribute page: upload photos once, then place them on any page.
export function PhotoGallery({ sections }: { sections: Section[] }) {
  const { lib, upload, remove, assign } = usePhotos();
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const slots = [...pageSlots, ...sections.map((s) => ({ id: s.id, label: `Programs · ${s.kicker}` }))];
  const labelFor = (id: string) => slots.find((s) => s.id === id)?.label ?? id;

  async function act(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true);
    setMsg(null);
    try { await fn(); if (ok) setMsg({ ok: true, text: ok }); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } finally { setBusy(false); }
  }
  const add = (files: File[]) => files.length && void act(() => upload(files), `Added ${files.length} ${files.length === 1 ? "photo" : "photos"}.`);

  if (!lib.canEdit) return null;

  return (
    <div className="panel">
      <p className="label">Photo gallery</p>
      <h2>Photos for page headers</h2>
      <p className="src">Upload photos once, then choose where each one appears. Photos are resized before upload. Use photos you have permission to share.</p>
      <div
        className={`drop${over ? " over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); add([...e.dataTransfer.files]); }}
      >
        <span className="drop-ic"><Icon name="image" size={28} /></span>
        <span>Drop photos here, or{" "}
          <label className="link">choose files<input type="file" accept="image/*" multiple hidden disabled={busy} onChange={(e) => { add([...(e.target.files ?? [])]); e.target.value = ""; }} /></label>
        </span>
      </div>
      {msg && <div className={`msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</div>}
      {lib.photos.length > 0 && (
        <div className="gallery">
          {lib.photos.map((p) => {
            const usedOn = Object.entries(lib.slots).filter(([, id]) => id === p.id).map(([slot]) => slot);
            return (
              <figure key={p.id} className="g-item">
                <img src={p.src} alt={p.name} />
                <figcaption>
                  <b>{p.name}</b>
                  <div className="tags">
                    {usedOn.length ? usedOn.map((s) => (
                      <button key={s} className="tag removable" disabled={busy} title="Remove from this page" onClick={() => void act(() => assign(s, null))}>
                        {labelFor(s)} <Icon name="close" size={12} />
                      </button>
                    )) : <span className="src">Not used yet</span>}
                  </div>
                  <div className="g-actions">
                    <select className="f" value="" disabled={busy} aria-label={`Use ${p.name} on a page`} onChange={(e) => e.target.value && void act(() => assign(e.target.value, p.id), `Photo placed on ${labelFor(e.target.value)}.`)}>
                      <option value="">Use on…</option>
                      {slots.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                    <button className="sq-dark" disabled={busy} aria-label={`Delete ${p.name}`} title="Delete photo" onClick={() => { if (confirm(`Delete "${p.name}"? It will be removed from every page that uses it.`)) void act(() => remove(p.id)); }}>
                      <Icon name="trash" size={16} />
                    </button>
                  </div>
                </figcaption>
              </figure>
            );
          })}
        </div>
      )}
    </div>
  );
}
