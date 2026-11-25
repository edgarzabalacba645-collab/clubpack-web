import { obtenerUrlDescarga } from "./api";

/**
 * Escuchar sin conexión, sin gastar datos — para TODOS los usuarios
 * (a diferencia de la descarga real de verdad, que es solo DJ — ver
 * requiere_puede_descargar en el backend). Esto no es eso: no deja un
 * MP3 normal en el celular, guarda el audio cifrado en IndexedDB y solo
 * esta misma app lo puede volver a convertir en sonido. Es "ahorrar
 * datos", no "llevarte el archivo".
 *
 * Un mismo track puede estar guardado por más de un motivo a la vez
 * ("origenes": "manual" si el usuario tocó el ícono en un tema suelto,
 * o "playlist:<id>" si vino de "Guardar offline" en una playlist
 * completa) — así, borrar una playlist no te borra un tema que también
 * guardaste a mano, y viceversa. El audio en sí (y su espacio) recién
 * se borra cuando el último origen que lo sostenía desaparece.
 *
 * Nombre de la base a propósito con el prefijo "clubpack" (igual que la
 * key de localStorage) — ver nota de branding en catalogo-colaborativo-djs.
 */

const DB_NOMBRE = "clubpack_offline";
const DB_VERSION = 1;
const STORE_CLAVE = "clave";
const STORE_AUDIOS = "audios";
const ID_CLAVE_DISPOSITIVO = "dispositivo";

export interface TrackOfflineMeta {
  id: string;
  titulo: string;
  artista_original: string | null;
  remixer: string | null;
  bpm: number | null;
  duracion_seg: number | null;
  genero_nombre: string | null;
  portada_url: string | null;
}

interface RegistroOffline {
  id: string;
  meta: TrackOfflineMeta;
  iv: ArrayBuffer;
  audioCifrado: Blob;
  bytes: number;
  peaks: number[] | null;
  fecha_guardado: string;
  /** "manual" (ícono en un tema suelto) y/o "playlist:<playlist_id>". */
  origenes: string[];
}

/** Resumen sin el blob/iv — lo que necesita la pantalla "Sin conexión" para listar. */
export interface ItemOffline {
  meta: TrackOfflineMeta;
  bytes: number;
  fecha_guardado: string;
  origenes: string[];
}

function abrirDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NOMBRE, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_CLAVE)) db.createObjectStore(STORE_CLAVE);
      if (!db.objectStoreNames.contains(STORE_AUDIOS)) db.createObjectStore(STORE_AUDIOS, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function prom<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Espera a que una transacción de escritura termine de verdad (todas sus
 * operaciones confirmadas) — más prolijo que colgar un get de más atrás
 * de cada put/delete solo para tener algo que esperar. */
function completarTx(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function obtenerClave(db: IDBDatabase): Promise<CryptoKey> {
  const tx = db.transaction(STORE_CLAVE, "readonly");
  const existente = await prom(tx.objectStore(STORE_CLAVE).get(ID_CLAVE_DISPOSITIVO) as IDBRequest<ArrayBuffer>);
  if (existente) {
    return crypto.subtle.importKey("raw", existente, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
  }
  const clave = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const bytes = await crypto.subtle.exportKey("raw", clave);
  const txw = db.transaction(STORE_CLAVE, "readwrite");
  txw.objectStore(STORE_CLAVE).put(bytes, ID_CLAVE_DISPOSITIVO);
  await completarTx(txw);
  return clave;
}

// ------------------------------------------------------------
// Notificación a los componentes que muestran estado offline (ícono en
// ListaTracks, botón de playlist, pantalla "Sin conexión") — sin esto,
// cada uno tendría que refrescar a lo loco o quedar desactualizado tras
// una acción hecha en OTRA pantalla.
// ------------------------------------------------------------
type Escucha = () => void;
const escuchas = new Set<Escucha>();
function notificar() {
  escuchas.forEach((cb) => cb());
}
export function onCambioOffline(cb: Escucha): () => void {
  escuchas.add(cb);
  return () => escuchas.delete(cb);
}

/** Lo mínimo que hace falta para guardar un track offline — TrackResumen
 * (Catálogo/Favoritos/Novedades) cumple esto de sobra; el tipo más chico
 * que usa PlaylistsPage (sin portada/género) también, con esos dos en
 * null. */
export interface TrackParaOffline {
  id: string;
  titulo: string;
  artista_original: string | null;
  remixer: string | null;
  bpm?: number | null;
  duracion_seg: number | null;
  portada_url?: string | null;
  generos?: { nombre: string } | null;
}

function metaDesde(track: TrackParaOffline): TrackOfflineMeta {
  return {
    id: track.id,
    titulo: track.titulo,
    artista_original: track.artista_original,
    remixer: track.remixer,
    bpm: track.bpm ?? null,
    duracion_seg: track.duracion_seg,
    genero_nombre: track.generos?.nombre ?? null,
    portada_url: track.portada_url ?? null,
  };
}

/** Lista completa (sin los bytes de audio) — para la pantalla "Sin conexión". */
export async function listarGuardados(): Promise<ItemOffline[]> {
  const db = await abrirDB();
  const tx = db.transaction(STORE_AUDIOS, "readonly");
  const filas = await prom(tx.objectStore(STORE_AUDIOS).getAll() as IDBRequest<RegistroOffline[]>);
  return filas.map((f) => ({ meta: f.meta, bytes: f.bytes, fecha_guardado: f.fecha_guardado, origenes: f.origenes }));
}

/** Suma de bytes guardados — informativo, sin ningún límite impuesto por la app. */
export async function espacioUsadoBytes(): Promise<number> {
  const items = await listarGuardados();
  return items.reduce((acc, it) => acc + it.bytes, 0);
}

async function leerRegistro(db: IDBDatabase, id: string): Promise<RegistroOffline | undefined> {
  const tx = db.transaction(STORE_AUDIOS, "readonly");
  return prom(tx.objectStore(STORE_AUDIOS).get(id) as IDBRequest<RegistroOffline | undefined>);
}

/** ¿Este track está guardado por CUALQUIER motivo? (uso interno, para decidir cómo reproducir). */
export async function estaCacheado(id: string): Promise<boolean> {
  const db = await abrirDB();
  return !!(await leerRegistro(db, id));
}

/** ¿El USUARIO lo guardó a mano (ícono de un tema suelto)? Es lo que refleja el ícono — a
 * propósito no cuenta el origen "playlist:…": guardar una playlist entera no prende el
 * ícono de cada tema suelto en el Catálogo, para no confundir "esto lo elegí yo" con
 * "esto vino de guardar una lista completa". */
export async function esGuardadoManual(id: string): Promise<boolean> {
  const db = await abrirDB();
  const reg = await leerRegistro(db, id);
  return !!reg?.origenes.includes("manual");
}

/** Ids con origen "manual" — para que el ícono de cada tema en pantalla
 * sepa su estado con una sola lectura, en vez de una consulta a
 * IndexedDB por fila visible. */
export async function listarIdsManualOffline(): Promise<Set<string>> {
  const items = await listarGuardados();
  return new Set(items.filter((it) => it.origenes.includes("manual")).map((it) => it.meta.id));
}

/** ¿Toda la playlist está guardada offline? Para el botón de PlaylistsPage. */
export async function playlistGuardadaOffline(playlistId: string, trackIds: string[]): Promise<boolean> {
  if (trackIds.length === 0) return false;
  const db = await abrirDB();
  const origen = `playlist:${playlistId}`;
  for (const id of trackIds) {
    const reg = await leerRegistro(db, id);
    if (!reg?.origenes.includes(origen)) return false;
  }
  return true;
}

/**
 * Guarda un track para escucharlo sin conexión (cifrado). Si ya estaba
 * guardado por otro motivo, no vuelve a bajar nada — solo suma el origen
 * nuevo a la lista existente.
 */
export async function guardarOffline(track: TrackParaOffline, origen: string): Promise<void> {
  const db = await abrirDB();
  const existente = await leerRegistro(db, track.id);

  if (existente) {
    if (existente.origenes.includes(origen)) return; // ya estaba, nada que hacer
    existente.origenes = [...existente.origenes, origen];
    const tx = db.transaction(STORE_AUDIOS, "readwrite");
    tx.objectStore(STORE_AUDIOS).put(existente);
    await completarTx(tx);
    notificar();
    return;
  }

  const [clave, { url, duracion_seg, peaks }] = await Promise.all([
    obtenerClave(db),
    // registrar=false: es la misma llamada que ya usa el player para
    // escuchar — no cuenta como descarga real ni exige licencia DJ.
    obtenerUrlDescarga(track.id, false),
  ]);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo bajar el audio (${res.status}).`);
  const datos = await res.arrayBuffer();

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cifrado = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, clave, datos);
  const audioCifrado = new Blob([cifrado]);

  const registro: RegistroOffline = {
    id: track.id,
    meta: metaDesde({ ...track, duracion_seg: duracion_seg ?? track.duracion_seg }),
    iv: iv.buffer,
    audioCifrado,
    bytes: audioCifrado.size,
    peaks: peaks ?? null,
    fecha_guardado: new Date().toISOString(),
    origenes: [origen],
  };

  const tx = db.transaction(STORE_AUDIOS, "readwrite");
  tx.objectStore(STORE_AUDIOS).put(registro);
  await completarTx(tx);
  notificar();
}

async function quitarOrigenDe(db: IDBDatabase, id: string, origen: string): Promise<void> {
  const reg = await leerRegistro(db, id);
  if (!reg) return;
  const restantes = reg.origenes.filter((o) => o !== origen);
  const tx = db.transaction(STORE_AUDIOS, "readwrite");
  if (restantes.length === 0) {
    tx.objectStore(STORE_AUDIOS).delete(id);
  } else {
    tx.objectStore(STORE_AUDIOS).put({ ...reg, origenes: restantes });
  }
  await completarTx(tx);
}

/** Saca el origen "manual" de un track (lo borra del todo si no le quedan otros origenes). */
export async function quitarOffline(id: string): Promise<void> {
  const db = await abrirDB();
  await quitarOrigenDe(db, id, "manual");
  notificar();
}

/** Guarda offline todos los tracks de una playlist de una sola vez. */
export async function guardarOfflinePlaylist(playlistId: string, tracks: TrackParaOffline[]): Promise<void> {
  const origen = `playlist:${playlistId}`;
  for (const t of tracks) {
    await guardarOffline(t, origen);
  }
}

/** Saca el origen de una playlist de TODOS los tracks que lo tengan — se
 * llama al borrar la playlist (o al desmarcar "Guardar offline" sin
 * borrarla). Los tracks que además estén guardados a mano (u otra
 * playlist) no se tocan, solo pierden este origen puntual. */
export async function quitarOfflinePlaylist(playlistId: string): Promise<void> {
  const db = await abrirDB();
  const origen = `playlist:${playlistId}`;
  const tx = db.transaction(STORE_AUDIOS, "readonly");
  const filas = await prom(tx.objectStore(STORE_AUDIOS).getAll() as IDBRequest<RegistroOffline[]>);
  const afectados = filas.filter((f) => f.origenes.includes(origen));
  for (const f of afectados) {
    await quitarOrigenDe(db, f.id, origen);
  }
  if (afectados.length > 0) notificar();
}

/** Borra un item entero sin importar qué origenes tuviera — para el
 * botón "Quitar" de la pantalla "Sin conexión" (gestión directa). */
export async function borrarOfflineDelTodo(id: string): Promise<void> {
  const db = await abrirDB();
  const tx = db.transaction(STORE_AUDIOS, "readwrite");
  tx.objectStore(STORE_AUDIOS).delete(id);
  await completarTx(tx);
  notificar();
}

// Blob URL del último audio offline reproducido — se libera (revoke) en
// cuanto se pide el siguiente, para no acumular memoria track tras
// track en una sesión larga de reproducción continua.
let ultimoBlobUrl: string | null = null;

/**
 * Punto único de resolución de URL para reproducir: si el track está
 * guardado offline (por cualquier origen), descifra en memoria y
 * devuelve un blob: URL local, SIN pegarle a la red — ahorra datos haya
 * o no haya wifi. Si no está guardado, cae en la resolución normal
 * (misma forma de respuesta que obtenerUrlDescarga).
 */
export async function obtenerUrlReproduccion(
  id: string,
): Promise<{ url: string; duracion_seg: number | null; peaks: number[] | null }> {
  const db = await abrirDB();
  const reg = await leerRegistro(db, id);
  if (reg) {
    const clave = await obtenerClave(db);
    const datosCifrados = await reg.audioCifrado.arrayBuffer();
    const datos = await crypto.subtle.decrypt({ name: "AES-GCM", iv: reg.iv }, clave, datosCifrados);
    const blobUrl = URL.createObjectURL(new Blob([datos], { type: "audio/mpeg" }));
    if (ultimoBlobUrl) URL.revokeObjectURL(ultimoBlobUrl);
    ultimoBlobUrl = blobUrl;
    return { url: blobUrl, duracion_seg: reg.meta.duracion_seg, peaks: reg.peaks };
  }
  const r = await obtenerUrlDescarga(id, false);
  return { url: r.url, duracion_seg: r.duracion_seg, peaks: r.peaks };
}
