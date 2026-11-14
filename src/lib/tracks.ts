/** Forma "liviana" de un track para listas fuera del catálogo (Favoritos,
 *  Novedades, Descargas) — alcanza para mostrarlo, reproducirlo y bajarlo. */
export interface TrackResumen {
  id: string;
  titulo: string;
  artista_original: string | null;
  remixer: string | null;
  bpm: number | null;
  key_armonica: string | null;
  duracion_seg: number | null;
  genero_id: string | null;
  generos: { nombre: string } | null;
  portada_url: string | null;
  fecha_subida: string | null;
  perfiles: { nombre_dj: string | null; email: string | null } | null;
}

export const SELECT_TRACK_RESUMEN =
  "id, titulo, artista_original, remixer, bpm, key_armonica, duracion_seg, genero_id, generos(nombre), portada_url, fecha_subida, perfiles!tracks_subido_por_fkey(nombre_dj, email)";

/** "Hoy", "Ayer" o dd/mm/yyyy — para agrupar listas por día. */
export function rotuloDia(iso: string | null): string {
  if (!iso) return "Sin fecha";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Sin fecha";
  const hoy = new Date();
  const mismoDia = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (mismoDia(d, hoy)) return "Hoy";
  const ayer = new Date(hoy);
  ayer.setDate(hoy.getDate() - 1);
  if (mismoDia(d, ayer)) return "Ayer";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}
