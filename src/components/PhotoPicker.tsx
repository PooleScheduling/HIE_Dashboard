import { useEffect, useRef, useState } from "react";
import { usePhotos } from "../lib/photos";
import { Icon } from "./Icon";

// Modal for choosing a page's header photo from the gallery, or uploading a new one.
export function PhotoPicker({ slot, label, onClose }: { slot: string; label: string; onClose: () => void }) {
  const { lib, upload, assign } = usePhotos();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const current = lib.slots[slot];
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    dialog.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setErr(null);
    try { await fn(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="modal-back no-print" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={`Photo for ${label}`} tabIndex={-1} ref={dialog}>
        <div className="modal-head">
          <div>
            <p className="label">Header photo</p>
            <h2>{label}</h2>
          </div>
          <button className="sq-dark" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </div>
        <div className="modal-actions">
          <label className="btn">
            <Icon name="upload" size={18} /> Upload new photo
            <input type="file" accept="image/*" hidden disabled={busy} onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void act(async () => { const [item] = await upload([f]); await assign(slot, item.id); onClose(); });
            }} />
          </label>
          {current && <button className="btn-ghost" disabled={busy} onClick={() => void act(async () => { await assign(slot, null); onClose(); })}>Remove photo from this page</button>}
        </div>
        {err && <div className="msg err">{err}</div>}
        {lib.photos.length ? (
          <>
            <p className="label">Or pick from the gallery</p>
            <div className="pick-grid">
              {lib.photos.map((p) => (
                <button key={p.id} className="pick" aria-pressed={p.id === current} disabled={busy} onClick={() => void act(async () => { await assign(slot, p.id); onClose(); })}>
                  <img src={p.src} alt={p.name} />
                  <span>{p.name}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <p className="note">The gallery is empty. Upload a photo to get started.</p>
        )}
        {busy && <p className="note">Saving…</p>}
      </div>
    </div>
  );
}
