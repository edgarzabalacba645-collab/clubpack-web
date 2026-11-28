import { zipSync, type Zippable } from "fflate";
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

// Cuántos reintentos le quedan a este pedido si `fetch` directamente no
// consigue respuesta (no es un 4xx/5xx — eso ya es un Response, y ese
// camino no reintenta, ver más abajo). Solo para GET: son pedidos de
// lectura, repetirlos no tiene efecto secundario. Para un POST/PUT/DELETE
// (subir un tema, crear una suscripción, etc.) NO conviene reintentar
// solo — si la primera vez sí llegó a procesarse en el backend pero la
// respuesta se perdió en el camino, reintentar duplicaría la acción.
function intentosIniciales(init: RequestInit): number {
  const metodo = (init.method ?? "GET").toUpperCase();
  return metodo === "GET" ? 2 : 0;
}

async function apiFetchJson<T>(path: string, init: RequestInit = {}, intentosRestantes?: number): Promise<T> {
  if (intentosRestantes === undefined) intentosRestantes = intentosIniciales(init);

  const token = await accessToken();
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${token}`,
      },
    });
  } catch (e) {
    // Acá cae *solo* una falla de red real (no una respuesta HTTP de
    // error): el caso de lejos más común en este proyecto es el backend
    // (Render, plan gratis) recién despertándose — se duerme a los 15 min
    // sin tráfico y tarda 50+ segundos en volver a arrancar (ver
    // usarDespertarBackend en App.tsx, que ya adelanta ese despertar al
    // abrir la app, pero no siempre alcanza a terminar antes de que el
    // usuario toque algo). Antes esto mostraba al toque "no se pudo
    // conectar con el servidor" — con un par de reintentos con espera,
    // la mayoría de las veces el backend ya terminó de levantar durante
    // esos segundos y la acción sigue de largo sin que el usuario note
    // nada raro.
    if (intentosRestantes > 0) {
      await new Promise((r) => setTimeout(r, 3500));
      return apiFetchJson<T>(path, init, intentosRestantes - 1);
    }
    throw e;
  }
  if (!res.ok) await manejarError(res);
  return res.json() as Promise<T>;
}

// ---- Tipos que devuelve la API ----

export interface DuplicadoCandidato {
  id: string;
  titulo: string;
  remixer: string | null;
  // A pedido de Edgar: Artista y Género asignado al lado de Remixer,
  // para juzgar mejor si un candidato es un duplicado real (ver
  // app/duplicados.py del backend).
  artista_original: string | null;
  genero: string | null;
  duracion_seg: number | null;
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
  tipo: "fingerprint_exacto" | "fingerprint_similar" | "texto_similar";
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

// Puente admin: analiza un audio que ya está compartido en el chat (ver
// /chat/audio) directo desde R2, sin bajarlo/resubirlo a mano — mismo
// resultado que analizarTrack, se sigue con el formulario de siempre y
// el mismo confirmarSubida de acá abajo.
export function analizarDesdeChat(mensajeId: string): Promise<AnalisisTrack> {
  return apiFetchJson<AnalisisTrack>(`/chat/mensajes/${mensajeId}/analizar`, { method: "POST" });
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
// usar junto con descargarVariosComoZip, más abajo.
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

// ---- Chat: audio adjunto (mp3/wav/flac, sin transcodificar — R2 por las credenciales) ----

export interface AudioChatSubido {
  storage_path: string;
  nombre_original: string;
  tamano_mb: number;
  duracion_seg: number | null;
}

export function subirAudioChat(file: File) {
  const form = new FormData();
  form.append("file", file);
  return apiFetchJson<AudioChatSubido>("/chat/audio", { method: "POST", body: form });
}

export function obtenerUrlAudioChat(mensajeId: string) {
  return apiFetchJson<{ url: string }>(`/chat/mensajes/${mensajeId}/audio-url`);
}

// Vacía TODO el chat (mensajes + audios en R2) — admin. Pasa por acá (y
// no un delete directo contra Supabase) porque también hay que borrar
// cada audio adjunto de R2, que necesita las credenciales del bucket.
export function limpiarChat() {
  return apiFetchJson<{ ok: boolean; borrados: number }>("/chat/mensajes", { method: "DELETE" });
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

// tipo: qué licencia quiere pagar — ver sql/022_precios_por_licencia.sql,
// ahora hay un precio distinto para Simple y para DJ.
export function crearSuscripcionMP(tipo: "simple" | "dj") {
  return apiFetchJson<CrearSuscripcionMPResponse>("/suscripcion/mercadopago/crear", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tipo_licencia: tipo }),
  });
}

// Aviso a Telegram cuando alguien marca "ya transferí" — el insert en
// `pagos` en sí va directo por Supabase (RLS); esto solo dispara la
// notificación, así el admin no tiene que estar revisando el panel.
// tipo: qué licencia eligió, solo para que el texto del aviso ya lo diga
// (lo "oficial" ya quedó guardado en perfiles.tipo_licencia_solicitada).
export function avisarPagoManual(comentario: string | null, tipo: "simple" | "dj" | null) {
  return apiFetchJson<{ ok: boolean }>("/suscripcion/aviso-manual", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ comentario, tipo_licencia: tipo }),
  });
}

// Aviso a Telegram cuando un suscriptor YA ACTIVO pide cambiar de licencia
// (Simple↔DJ) sin que haya un pago nuevo de por medio — distinto de
// avisarPagoManual, que es para la primera vez que alguien paga. El valor
// "pedido" ya quedó guardado en perfiles.tipo_licencia_solicitada por el
// propio frontend (update directo a Supabase, ver elegirTipo en
// SuscripcionPage); esto solo dispara el aviso para que el admin se entere.
export function pedirCambioLicencia(tipo: "simple" | "dj", comentario: string | null) {
  return apiFetchJson<{ ok: boolean }>("/suscripcion/pedir-cambio-licencia", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tipo_licencia: tipo, comentario }),
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

// ---- Admin: backfill de la portada genérica DENTRO del archivo para
// temas subidos antes de que esa elección también se grabara en el MP3
// (ver audio.py::fijar_caratula_generica) — antes solo cambiaba lo que
// mostraba el catálogo web, el archivo real seguía con la carátula
// vieja. Nunca toca temas con portada propia guardada (portada_url). ----

export interface TrackPendientePortada {
  id: string;
  titulo: string;
}

export function listarPendientesPortadaGenerica() {
  return apiFetchJson<{ tracks: TrackPendientePortada[] }>("/tracks/admin/pendientes-portada-generica");
}

export function fijarPortadaGenericaTrack(trackId: string) {
  return apiFetchJson(`/tracks/${trackId}/fijar-portada-generica`, { method: "POST" });
}

// ---- Admin: backfill del nivelado de volumen (ver audio.py::
// transcodificar_a_mp3_320 / sql/023_nivelado_volumen.sql) para temas
// subidos antes de que existiera. Los temas nuevos ya se nivelan solos
// en /tracks/confirm — esto es solo para vaciar la lista de pendientes
// una vez. A diferencia de los backfills de arriba, acá sí se reencodea
// el audio entero (una segunda pasada de MP3 320 a MP3 320 — pérdida
// muy menor, normalmente inaudible), por eso tarda más por tema. ----

export interface TrackPendienteVolumen {
  id: string;
  titulo: string;
}

export function listarPendientesVolumen() {
  return apiFetchJson<{ tracks: TrackPendienteVolumen[] }>("/tracks/admin/pendientes-volumen");
}

export function nivelarVolumenTrack(trackId: string) {
  return apiFetchJson(`/tracks/${trackId}/nivelar-volumen`, { method: "POST" });
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

export interface ItemUso {
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
  storage?: ItemUso;
  operaciones_a?: ItemUso;
  operaciones_b?: ItemUso;
  costo_total_usd?: number;
}

export function obtenerBalanceCloudflare() {
  return apiFetchJson<BalanceCloudflare>("/admin/uso/cloudflare");
}

// ---- Admin: balance de ancho de banda de Render ----

export interface BalanceRender {
  configurado: boolean;
  mensaje?: string;
  periodo_desde?: string;
  periodo_hasta?: string;
  bandwidth?: ItemUso;
}

export function obtenerBalanceRender() {
  return apiFetchJson<BalanceRender>("/admin/uso/render");
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

export interface ResultadoDescargaZip {
  fallidos: string[]; // nombres de los temas que no se pudieron incluir (link vencido, red, etc.)
}

/**
 * Para una selección o una playlist completa: arma UN solo .zip en el
 * propio navegador (fetch de cada URL firmada de R2 + fflate) y dispara
 * una única descarga al final.
 *
 * Antes se disparaba una descarga del navegador por archivo
 * (descargarUrlConNombre en loop) — con una selección grande el
 * navegador las trata como "descargas automáticas": a partir de la
 * 2da/3ra pide permiso para seguir, y aun permitiéndolo varias se
 * pierden en silencio (bien notorio en Chrome de Android) — por eso no
 * bajaba todo lo seleccionado, sin ningún aviso de qué había quedado
 * afuera. Armando todo en un solo .zip no hay nada que el navegador
 * pueda bloquear a mitad de camino: una sola descarga, un solo archivo.
 * Sigue siendo cero bytes de audio por nuestro servidor (Render) — cada
 * fetch va directo a R2, el zip se arma en la memoria del navegador.
 *
 * Los fetch van en paralelo (con un tope de concurrencia) y no uno por
 * uno: las URLs firmadas de R2 vencen a los 5 minutos, y una selección
 * grande bajada en serie (un archivo entero tras otro) puede no
 * alcanzar a terminar antes de que las últimas ya hayan vencido. En
 * paralelo además es varias veces más rápido para el usuario. Esto no
 * reabre el problema de las "descargas automáticas" del navegador: acá
 * no se dispara ninguna descarga por archivo, son fetch() a memoria.
 *
 * onProgreso: para mostrar "Preparando… 12/34" mientras arma el zip. El
 * resultado devuelve los nombres de los temas que no se pudieron
 * incluir, para avisar cuáles en vez de dejar a alguien buscando a
 * ciegas qué falta en una selección grande.
 */
export async function descargarVariosComoZip(
  archivos: ArchivoDescarga[],
  nombreZip: string,
  onProgreso?: (hechos: number, total: number) => void,
): Promise<ResultadoDescargaZip> {
  const CONCURRENCIA = 6;
  const entradas: Zippable = {};
  const fallidos: string[] = [];
  const nombresUsados = new Set<string>();
  let hechos = 0;

  async function procesar(i: number) {
    const archivo = archivos[i];
    try {
      const resp = await fetch(archivo.url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const bytes = new Uint8Array(await resp.arrayBuffer());

      // Si dos temas comparten nombre de archivo (puede pasar: mismo
      // título/remixer), que no se pisen uno a otro dentro del zip.
      let nombre = archivo.nombre;
      if (nombresUsados.has(nombre)) {
        const punto = nombre.lastIndexOf(".");
        const base = punto === -1 ? nombre : nombre.slice(0, punto);
        const ext = punto === -1 ? "" : nombre.slice(punto);
        nombre = `${base} (${i + 1})${ext}`;
      }
      nombresUsados.add(nombre);
      // level: 0 — sin comprimir. El MP3 ya viene comprimido, intentar
      // recomprimirlo con zlib no ahorra casi nada y solo suma tiempo.
      entradas[nombre] = [bytes, { level: 0 }];
    } catch {
      fallidos.push(archivo.nombre);
    }
    hechos++;
    onProgreso?.(hechos, archivos.length);
  }

  // Pool de workers con tope de concurrencia: cada uno toma el próximo
  // índice libre hasta que no queden.
  let siguiente = 0;
  async function worker() {
    while (siguiente < archivos.length) {
      const i = siguiente++;
      await procesar(i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCIA, archivos.length) }, worker));

  if (Object.keys(entradas).length === 0) {
    throw new Error("No se pudo bajar ninguno de los temas seleccionados.");
  }

  const zip = zipSync(entradas);
  const blobUrl = URL.createObjectURL(new Blob([zip], { type: "application/zip" }));
  descargarUrlConNombre(blobUrl, nombreZip);
  // Demora antes de revocar: algunos navegadores necesitan un instante
  // para empezar a leer el blob antes de que la URL se invalide.
  setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);

  return { fallidos };
}
