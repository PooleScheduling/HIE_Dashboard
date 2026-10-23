import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { deletePhoto, getPhotos, setPhotoSlot, uploadPhoto, type PhotoItem, type PhotoLibrary } from "../data/api";

// Places a photo can go: the main pages plus one per program area.
export const pageSlots: { id: string; label: string }[] = [
  { id: "report", label: "Report (front page)" },
  { id: "hub", label: "The Hub" },
  { id: "stories", label: "Stories" },
  { id: "contribute", label: "Contribute data" },
];

type Ctx = {
  lib: PhotoLibrary;
  photoFor: (slot: string) => PhotoItem | undefined;
  upload: (files: File[]) => Promise<PhotoItem[]>;
  remove: (id: string) => Promise<void>;
  assign: (slot: string, id: string | null) => Promise<void>;
};

const empty: PhotoLibrary = { photos: [], slots: {}, canEdit: false };
const PhotosContext = createContext<Ctx | null>(null);

export function PhotosProvider({ children }: { children: ReactNode }) {
  const [lib, setLib] = useState<PhotoLibrary>(empty);
  const refresh = useCallback(() => getPhotos().then(setLib).catch(() => setLib(empty)), []);
  useEffect(() => { void refresh(); }, [refresh]);

  const ctx: Ctx = {
    lib,
    photoFor: (slot) => lib.photos.find((p) => p.id === lib.slots[slot]),
    upload: async (files) => {
      const added: PhotoItem[] = [];
      for (const f of files) {
        if (!f.type.startsWith("image/")) throw new Error(`${f.name} isn't an image.`);
        added.push(await uploadPhoto(f.name.replace(/\.[^.]+$/, ""), await resizeImage(f)));
      }
      await refresh();
      return added;
    },
    remove: async (id) => { await deletePhoto(id); await refresh(); },
    assign: async (slot, id) => { await setPhotoSlot(slot, id); await refresh(); },
  };
  return <PhotosContext.Provider value={ctx}>{children}</PhotosContext.Provider>;
}

export function usePhotos(): Ctx {
  const c = useContext(PhotosContext);
  if (!c) throw new Error("usePhotos must be used inside PhotosProvider");
  return c;
}

// Shrinks a photo to at most 1600px on the long side as a JPEG, so uploads stay small.
export function resizeImage(file: File, max = 1600, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Couldn't read ${file.name}.`)); };
    img.src = url;
  });
}
