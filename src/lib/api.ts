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
  /** true si el archivo trae carátula embebida (ID3 APIC) */
  tiene_caratula_original: boolean;
  /** Data URI (ej. "data:image/jpeg;base64,...") de la carátula embebida, para mostrarla. null si no hay. */
  caratula_original_preview: string | null;
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
  /** Solo importa si el análisis reportó tiene_caratula_original. Default true en el backend. */
  usar_caratula_original?: boolean;
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
  return apiFetchJson<{
    url: string;
    expira_seg: number;
    duracion_seg: number | null;
    // Envolvente de volumen precalculada (ver audio.py::calcular_peaks en
    // el backend) — null si este track todavía no la tiene (temas viejos
    // sin backfill todavía). El player la usa para arrancar rápido; si
    // falta, simplemente tarda lo de siempre para ESE tema puntual.
    peaks: number[] | null;
  }>(`/tracks/${trackId}/download-url?registrar=${registrar}`);
}

export interface ArchivoDescarga {
  nombre: string;
  url: string;
}

interface DescargaMultipleResponse {
  archivos: ArchivoDescarga[];
  expira_seg: number;
}

// El nombre quedó de cuando esto armaba un .zip de verdad — ver el
// comentario de descargar_zip en el backend. Ahora devuelve una URL
// firmada por track (cero bytes de audio pasan por nuestro servidor);
// usar junto con descargarVariosDirecto, más abajo.
export function descargarZip(trackIds: string[]) {
  return apiFetchJson<DescargaMultipleResponse>("/tracks/zip", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ track_ids: trackIds }),
  });
}

export function descargarPlaylistZip(playlistId: string) {
  return apiFetchJson<DescargaMultipleResponse>(`/playlists/${playlistId}/zip`, { method: "POST" });
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

// Aviso a Telegram cuando alguien marca "ya transferí" — el insert en
// `pagos` en sí va directo por Supabase (RLS); esto solo dispara la
// notificación, así el admin no tiene que estar revisando el panel.
export function avisarPagoManual(comentario: string | null) {
  return apiFetchJson<{ ok: boolean }>("/suscripcion/aviso-manual", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ comentario }),
  });
}

// ---- Admin: borrar track (necesita las credenciales de R2, por eso pasa por la API) ----

export function borrarTrackAdmin(trackId: string) {
  return apiFetchJson<{ ok: boolean }>(`/tracks/${trackId}`, { method: "DELETE" });
}

// ---- Admin: backfill de peaks de waveform para temas subidos antes de
// que existiera este cálculo (ver audio.py::calcular_peaks). Los temas
// nuevos ya lo calculan solos en /tracks/confirm — esto es solo para
// vaciar la lista de pendientes una vez. ----

export interface TrackPendientePeaks {
  id: string;
  titulo: string;
}

export function listarPendientesPeaks() {
  return apiFetchJson<{ tracks: TrackPendientePeaks[] }>("/tracks/admin/pendientes-peaks");
}

export function calcularPeaksTrack(trackId: string) {
  return apiFetchJson(`/tracks/${trackId}/calcular-peaks`, { method: "POST" });
}

// ---- Imágenes: portadas de track + herramientas DJ (R2, por eso pasan por la API) ----

const cacheUrlImagen = new Map<string, { url: string; expira: number }>();

export async function urlImagen(path: string): Promise<string> {
  const cacheada = cacheUrlImagen.get(path);
  // Un poco de margen (60s) para no usar una URL firmada justo al vencer.
  if (cacheada && cacheada.expira > Date.now() + 60_000) return cacheada.url;

  const { url } = await apiFetchJson<{ url: string }>(`/imagenes/url?path=${encodeURIComponent(path)}`);
  cacheUrlImagen.set(path, { url, expira: Date.now() + 55 * 60 * 1000 });
  return url;
}

export function subirPortada(trackId: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  return apiFetchJson<{ path: string }>(`/tracks/${trackId}/portada`, { method: "POST", body: form });
}

// Saca la portada propia de un track y lo deja con la genérica de ClubPack.
export function quitarPortada(trackId: string) {
  return apiFetchJson<{ ok: boolean }>(`/tracks/${trackId}/portada`, { method: "DELETE" });
}

export function subirImagenHerramienta(file: File) {
  const form = new FormData();
  form.append("file", file);
  return apiFetchJson<{ path: string }>("/admin/herramientas/imagen", { method: "POST", body: form });
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

// ---- Admin: balance de uso de Cloudflare R2 ----

export interface ItemUsoCloudflare {
  usado: number;
  limite_gratis: number;
  porcentaje: number;
  costo_usd: number;
}

export interface BalanceCloudflare {
  configurado: boolean;
  mensaje?: string;
  periodo_desde?: string;
  periodo_hasta?: string;
  storage?: ItemUsoCloudflare;
  operaciones_a?: ItemUsoCloudflare;
  operaciones_b?: ItemUsoCloudflare;
  costo_total_usd?: number;
}

export function obtenerBalanceCloudflare() {
  return apiFetchJson<BalanceCloudflare>("/admin/uso/cloudflare");
}

// ---- Utilidad: forzar la descarga directa de uno o varios archivos ----

export function abrirDescargaDirecta(url: string) {
  // La URL firmada de R2 ya trae Content-Disposition: attachment,
  // así que una navegación directa alcanza para que el navegador la baje.
  window.open(url, "_blank");
}

function descargarUrlConNombre(url: string, nombreArchivo: string) {
  // Como abrirDescargaDirecta, pero con un <a> en vez de window.open: al
  // no abrir una pestaña nueva, no lo frena el bloqueador de pop-ups del
  // navegador cuando se dispara varias veces seguidas (ver abajo).
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo; // refuerzo — el Content-Disposition de R2 ya fuerza la descarga
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function descargarVariosDirecto(archivos: ArchivoDescarga[]) {
  // Para una selección o una playlist: dispara cada descarga directo de
  // R2 (cero bytes de audio por nuestro servidor), con una pequeña pausa
  // entre una y otra. Todas juntas en el mismo instante pueden hacer que
  // el navegador las trate como descargas automáticas y pida permiso
  // para seguir — normal, y solo pasa una vez por sitio.
  for (const archivo of archivos) {
    descargarUrlConNombre(archivo.url, archivo.nombre);
    await new Promise((resolver) => setTimeout(resolver, 350));
  }
}
