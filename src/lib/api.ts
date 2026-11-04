import { supabase, API_BASE_URL } from "./supabase";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function accessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiError(401, "No hay sesión activa.");
  return token;
}

async function manejarError(res: Response): Promise<never> {
  let detalle = res.statusText;
  try {
    const body = await res.json();
    detalle = body.detail ?? detalle;
  } catch {
    /* no era JSON */
  }
  throw new ApiError(res.status, detalle);
}

async function apiFetchJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) await manejarError(res);
  return res.json() as Promise<T>;
}

async function apiFetchBlob(path: string, init: RequestInit = {}): Promise<Blob> {
  const token = await accessToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) await manejarError(res);
  return res.blob();
}

// ---- Tipos que devuelve la API ----

export interface DuplicadoCandidato {
  id: string;
  titulo: string;
  remixer: string | null;
  similitud: number;
}

export interface AnalisisTrack {
  staging_id: string;
  nombre_original: string;
  tamano_mb: number;
  duracion_seg: number | null;
  bpm_detectado: number | null;
  key_detectada: string | null;
  fingerprint: string | null;
  advertencias: string[];
  duplicados_sospechosos: DuplicadoCandidato[];
}

export interface ConfirmarSubidaBody {
  staging_id: string;
  titulo: string;
  artista_original?: string | null;
  remixer?: string | null;
  genero_id?: string | null;
  bpm?: number | null;
  key_armonica?: string | null;
  tags?: string[];
}

export interface EscaneoResultado {
  tracks_analizados: number;
  nuevos_por_fingerprint: number;
  nuevos_por_texto: number;
}

export interface TrackDuplicadoRef {
  id: string;
  titulo: string;
  remixer: string | null;
  fecha_subida: string;
}

export interface DuplicadoPendiente {
  id: string;
  track_id_a: string;
  track_id_b: string;
  tipo: "fingerprint_exacto" | "texto_similar";
  similitud: number | null;
  estado: string;
  fecha_deteccion: string;
  track_a: TrackDuplicadoRef | null;
  track_b: TrackDuplicadoRef | null;
}

// ---- Tracks ----

export function analizarTrack(
  file: File,
  titulo: string,
  remixer: string,
): Promise<AnalisisTrack> {
  const form = new FormData();
  form.append("file", file);
  form.append("titulo", titulo);
  form.append("remixer", remixer);
  return apiFetchJson<AnalisisTrack>("/tracks/analyze", { method: "POST", body: form });
}

export function confirmarSubida(body: ConfirmarSubidaBody) {
  return apiFetchJson("/tracks/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function obtenerUrlDescarga(trackId: string, registrar = true) {
  return apiFetchJson<{ url: string; expira_seg: number }>(
    `/tracks/${trackId}/download-url?registrar=${registrar}`,
  );
}

export function descargarZip(trackIds: string[], nombreZip?: string) {
  return apiFetchBlob("/tracks/zip", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ track_ids: trackIds, nombre_zip: nombreZip }),
  });
}

export function descargarPlaylistZip(playlistId: string) {
  return apiFetchBlob(`/playlists/${playlistId}/zip`, { method: "POST" });
}

// ---- Suscripción: Mercado Pago ----
// (La configuración de precio/CBU y el aviso de transferencia manual van
// directo contra Supabase desde las páginas — no necesitan pasar por acá.
// Solo lo que habla con la API de Mercado Pago, que exige el Access Token
// secreto, pasa por este backend.)

export interface CrearSuscripcionMPResponse {
  preapproval_id: string;
  init_point: string;
  sandbox_init_point: string | null;
}

export function crearSuscripcionMP() {
  return apiFetchJson<CrearSuscripcionMPResponse>("/suscripcion/mercadopago/crear", {
    method: "POST",
  });
}

// ---- Admin: borrar track (necesita las credenciales de R2, por eso pasa por la API) ----

export function borrarTrackAdmin(trackId: string) {
  return apiFetchJson<{ ok: boolean }>(`/tracks/${trackId}`, { method: "DELETE" });
}

// ---- Admin: duplicados ----

export function escanearDuplicados() {
  return apiFetchJson<EscaneoResultado>("/admin/duplicados/scan", { method: "POST" });
}

export function listarDuplicadosPendientes() {
  return apiFetchJson<DuplicadoPendiente[]>("/admin/duplicados");
}

export function marcarDuplicado(id: string, estado: "descartado" | "resuelto") {
  return apiFetchJson(`/admin/duplicados/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ estado }),
  });
}

// ---- Utilidad: forzar la descarga de un Blob en el navegador ----

export function abrirDescargaDirecta(url: string) {
  // La URL firmada de R2 ya trae Content-Disposition: attachment,
  // así que una navegación directa alcanza para que el navegador la baje.
  window.open(url, "_blank");
}

export function descargarBlob(blob: Blob, nombreArchivo: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
