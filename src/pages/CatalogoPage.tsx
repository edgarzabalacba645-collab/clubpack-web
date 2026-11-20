import { useEffect, useMemo, useState } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import type { AppShellContext } from "../components/AppShell";
import CarruselHorizontal from "../components/CarruselHorizontal";
import { supabase } from "../lib/supabase";
import {
  abrirDescargaDirecta,
  ApiError,
  borrarTrackAdmin,
  descargarVariosDirecto,
  descargarZip,
  obtenerUrlDescarga,
  quitarPortada,
  subirPortada,
} from "../lib/api";
import {
  CAMELOT_KEYS,
  formatearBpm,
  formatearDuracion,
  mensajeErrorAmigable,
} from "../lib/format";
import type { Genero, PlaylistInsert, PlaylistTrackInsert } from "../lib/types";
import { useAuth, tieneAccesoActivo, esLicenciaDj, MENSAJE_SIN_ACCESO_ACTIVO } from "../lib/auth";
import { useConfiguracionCatalogo } from "../lib/configCatalogo";
import { usePlayer } from "../lib/player";
import { useFavoritos } from "../lib/favoritos";
import Portada from "../components/Portada";
import BotonCorazon from "../components/BotonCorazon";
import AvisoSuscripcionModal from "../components/AvisoSuscripcionModal";

interface TrackFila {
  id: string;
  titulo: string;
  artista_original: string | null;
  remixer: string | null;
  bpm: number | null;
  key_armonica: string | null;
  duracion_seg: number | null;
  genero_id: string | null;
  generos: { nombre: string } | null;
  subido_por: string | null;
  tags: string[] | null;
  portada_url: string | null;
  fecha_subida: string | null;
  perfiles: { nombre_dj: string | null; email: string } | null;
}

/* Colores de acento que van rotando en los badges de género — puramente
   visual, no hay una columna de color en `generos`. Clases completas y
   literales (Tailwind v4 no genera clases armadas con template strings
   en runtime, necesita verlas tal cual en el código fuente). */
const BADGES_GENERO = [
  "bg-accent/15 text-accent",
  "bg-accent-teal/15 text-accent-teal",
  "bg-accent-violet/15 text-accent-violet",
  "bg-accent-lime/15 text-accent-lime",
  "bg-accent-pink/15 text-accent-pink",
];
function badgeGenero(i: number) {
  return BADGES_GENERO[i % BADGES_GENERO.length];
}

/* Opciones de los filtros nuevos. Los rangos de duración son en segundos;
   la antigüedad, en días hacia atrás desde hoy. */
type DuracionFiltro = "" | "corta" | "media" | "larga" | "extendida";
const DURACIONES: { id: DuracionFiltro; texto: string; min?: number; max?: number }[] = [
  { id: "", texto: "Todas" },
  { id: "corta", texto: "Hasta 3 min", max: 180 },
  { id: "media", texto: "3 a 5 min", min: 180, max: 300 },
  { id: "larga", texto: "5 a 8 min", min: 300, max: 480 },
  { id: "extendida", texto: "Más de 8 min", min: 480 },
];
type AntiguedadFiltro = "" | "7" | "30" | "90" | "365";
const ANTIGUEDADES: { id: AntiguedadFiltro; texto: string }[] = [
  { id: "", texto: "Siempre" },
  { id: "7", texto: "Últimos 7 días" },
  { id: "30", texto: "Últimos 30 días" },
  { id: "90", texto: "Últimos 3 meses" },
  { id: "365", texto: "Último año" },
];
type OrdenCatalogo = "nuevos" | "viejos" | "titulo" | "bpm_asc" | "bpm_desc" | "descargas" | "escuchas" | "favoritos";
const ORDENES: { id: OrdenCatalogo; texto: string }[] = [
  { id: "nuevos", texto: "Más nuevos" },
  { id: "viejos", texto: "Más antiguos" },
  { id: "titulo", texto: "Título A → Z" },
  { id: "bpm_asc", texto: "BPM ascendente" },
  { id: "bpm_desc", texto: "BPM descendente" },
  { id: "descargas", texto: "Más descargados" },
  { id: "escuchas", texto: "Más escuchados" },
  { id: "favoritos", texto: "Más favoritos" },
];

/* Íconos de la columna "Acciones" — antes eran botones de texto
   (Editar/Bajar/Borrar), ahora solo el ícono + aria-label/title para
   que siga siendo accesible y quede claro al pasar el mouse. */
function IconoEditar() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 20h4L19.5 8.5a2.121 2.121 0 0 0-3-3L5 17v3Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M14.2 6.8 17.2 9.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function IconoBajar() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 4v11.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path
        d="M7.5 11.5 12 16l4.5-4.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M5 19.5h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function IconoBorrar() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4.5 7h15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path
        d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7 7l0.9 12.1a1 1 0 0 0 1 .9h6.2a1 1 0 0 0 1-.9L17 7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10 10.5v6M14 10.5v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function CatalogoPage() {
  const { session, perfil } = useAuth();
  const { permiteSubidaColaboradores } = useConfiguracionCatalogo();
  const player = usePlayer();
  const { sidebarEscritorioAbierto } = useOutletContext<AppShellContext>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tracks, setTracks] = useState<TrackFila[]>([]);
  const [generos, setGeneros] = useState<Genero[]>([]);
  // Cantidad de tracks activos por género, para mostrar al lado de cada
  // pill (ver más abajo) — independiente de `tracks` a propósito: ese
  // estado es la lista YA FILTRADA (por búsqueda/género/bpm/key) que se
  // ve en la tabla, así que contar desde ahí daría 0 en todos los géneros
  // menos el seleccionado. Esto en cambio es siempre el total real del
  // catálogo completo.
  const [conteoGeneros, setConteoGeneros] = useState<Record<string, number>>({});
  // Total real del catálogo (todos los géneros, incluso sin género
  // asignado) — separado de conteoGeneros porque sumar ese objeto se
  // comería los tracks sin genero_id. Se muestra en el encabezado en vez
  // de tracks.length porque ese último SÍ cambia con los filtros (al
  // elegir un género el encabezado mostraba solo esa cantidad, no el
  // total de la plataforma).
  const [totalCatalogo, setTotalCatalogo] = useState<number | null>(null);
  // Ids de los hasta 10 tracks de Cachengue subidos más recientemente —
  // la única escucha gratuita sin suscripción (ver
  // sql/012_freemium_v2_vidriera.sql). El resto del catálogo ahora se VE
  // igual (es la "vidriera"), pero solo se puede escuchar esto.
  const [muestraGratisIds, setMuestraGratisIds] = useState<Set<string>>(new Set());
  // Mensaje del modal "necesitás suscripción" (null = cerrado). Un solo
  // modal reutilizado para reproducir/bajar/playlist, con el texto que
  // corresponda a cada caso.
  const [avisoSuscripcion, setAvisoSuscripcion] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [busqueda, setBusqueda] = useState(() => searchParams.get("q") ?? "");
  const [generoId, setGeneroId] = useState("");
  const [bpmMin, setBpmMin] = useState("");
  const [bpmMax, setBpmMax] = useState("");
  const [key, setKey] = useState("");
  // Filtros nuevos: duración (rangos fijos), antigüedad de la subida, y
  // orden. Los dos primeros van a la consulta; el orden por métricas
  // (descargas/escuchas/favoritos) se resuelve en el cliente con lo que
  // trae useFavoritos, porque esos números no están en la tabla tracks.
  const [duracion, setDuracion] = useState<DuracionFiltro>("");
  const [antiguedad, setAntiguedad] = useState<AntiguedadFiltro>("");
  const [orden, setOrden] = useState<OrdenCatalogo>("nuevos");

  const { metricasDe, esFavorito, toggleFavorito } = useFavoritos();

  // "Catálogo completo" se pagina: cada Portada montada pide una URL
  // firmada al backend (ver src/components/Portada.tsx -> urlImagen), que
  // además chequea la suscripción contra Supabase — con todo el catálogo
  // renderizado de una, esos pedidos crecen junto con la cantidad de
  // temas y se notan cada vez más. Paginar acota cuántas Portadas están
  // montadas a la vez, sin importar qué tan grande sea el catálogo.
  const PAGINA_TAMANO = 40;
  const [pagina, setPagina] = useState(1);

  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  // Solo cubre el momentito de pedir la URL firmada antes de poder
  // arrancar la reproducción en sí — una vez que arranca, el estado
  // "de verdad" (sonando/pausado/cargando el audio) vive en el
  // reproductor global (usePlayer), que sobrevive si uno se va a otra
  // pantalla (ver src/lib/player.tsx).
  const [cargandoPreviewId, setCargandoPreviewId] = useState<string | null>(null);
  const [descargando, setDescargando] = useState<string | null>(null);
  const [procesandoZip, setProcesandoZip] = useState(false);
  const [guardandoPlaylist, setGuardandoPlaylist] = useState(false);
  const [nombrePlaylist, setNombrePlaylist] = useState("");
  const [mostrarFormPlaylist, setMostrarFormPlaylist] = useState(false);
  // Playlists a las que este usuario les puede sumar temas (las propias,
  // o todas si es admin — mismo criterio que para editar/borrar una
  // playlist, ver RLS de playlist_tracks). "" en playlistDestino significa
  // "crear una nueva", cualquier otro valor es el id de una ya existente.
  const [playlistsPropias, setPlaylistsPropias] = useState<{ id: string; nombre: string }[]>([]);
  const [playlistDestino, setPlaylistDestino] = useState("");
  const [avisoAccion, setAvisoAccion] = useState<string | null>(null);

  const [editando, setEditando] = useState<TrackFila | null>(null);
  const [edTitulo, setEdTitulo] = useState("");
  const [edArtista, setEdArtista] = useState("");
  const [edRemixer, setEdRemixer] = useState("");
  const [edGeneroId, setEdGeneroId] = useState("");
  const [edKey, setEdKey] = useState("");
  const [edBpm, setEdBpm] = useState("");
  const [edTags, setEdTags] = useState("");
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [subiendoPortada, setSubiendoPortada] = useState(false);
  const [quitandoPortada, setQuitandoPortada] = useState(false);

  const [confirmandoBorrarId, setConfirmandoBorrarId] = useState<string | null>(null);
  const [borrandoId, setBorrandoId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from("generos")
          .select("*")
          .eq("activo", true)
          .order("orden");
        if (!error && data) setGeneros(data);
      } catch {
        // el filtro de género simplemente queda vacío si esto falla
      }
    })();
    cargarConteoGeneros();
    cargarMuestraGratis();
  }, []);

  // Trae los ids de la muestra gratuita (ver sql/012_freemium_v2_vidriera.sql
  // -> obtener_muestra_gratis_cachengue). Si falla o viene vacía, simplemente
  // nadie sin suscripción puede escuchar nada — no rompe el resto de la
  // página.
  async function cargarMuestraGratis() {
    try {
      const { data, error } = await supabase.rpc("obtener_muestra_gratis_cachengue");
      if (!error && data) {
        setMuestraGratisIds(new Set((data as { track_id: string }[]).map((f) => f.track_id)));
      }
    } catch {
      // ver comentario de arriba
    }
  }

  // true si ESTE usuario puede escuchar ESTE track puntual — acceso
  // activo (o admin), o está en la muestra gratuita de arriba. Espejo en
  // el cliente de la función SQL puede_escuchar_track, que es la que de
  // verdad manda (ver app/routers/tracks.py:obtener_url_descarga): esto
  // es solo para decidir la UI (qué botón mostrar activo) sin tener que
  // esperar una ida y vuelta al backend para saberlo.
  function puedeEscucharTrack(track: TrackFila): boolean {
    return tieneAccesoActivo(perfil) || muestraGratisIds.has(track.id);
  }

  // Trae solo la columna genero_id de todos los tracks activos (liviano,
  // sin joins) y cuenta a mano cuántos hay por género — Supabase no deja
  // pedir un GROUP BY directo desde el cliente. Se llama al entrar a la
  // página y después de cualquier acción que pueda correr un track de
  // género (editarlo) o sacarlo del catálogo (borrarlo).
  async function cargarConteoGeneros() {
    try {
      const { data, error } = await supabase.from("tracks").select("genero_id").eq("estado", "activo");
      if (error || !data) return;
      const conteo: Record<string, number> = {};
      for (const fila of data as { genero_id: string | null }[]) {
        if (fila.genero_id) conteo[fila.genero_id] = (conteo[fila.genero_id] ?? 0) + 1;
      }
      setConteoGeneros(conteo);
      setTotalCatalogo(data.length);
    } catch {
      // los badges de cantidad simplemente no se muestran si esto falla
    }
  }

  useEffect(() => {
    // Si el buscador del header manda a /catalogo?q=... estando ya en esta
    // página, el componente no se remonta — sin esto el campo de búsqueda
    // se quedaría con el valor viejo.
    const q = searchParams.get("q") ?? "";
    setBusqueda((prev) => (prev === q ? prev : q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    setPagina(1);
    const handle = setTimeout(() => {
      cargarTracks();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda, generoId, bpmMin, bpmMax, key, duracion, antiguedad]);

  async function cargarTracks() {
    setCargando(true);
    setError(null);

    try {
      let query = supabase
        .from("tracks")
        .select(
          "id, titulo, artista_original, remixer, bpm, key_armonica, duracion_seg, genero_id, generos(nombre), subido_por, tags, portada_url, fecha_subida, perfiles!tracks_subido_por_fkey(nombre_dj, email)",
        )
        .eq("estado", "activo")
        .order("fecha_subida", { ascending: false });

      if (busqueda.trim()) {
        const q = busqueda.trim();
        query = query.or(
          `titulo.ilike.%${q}%,remixer.ilike.%${q}%,artista_original.ilike.%${q}%`,
        );
      }
      if (generoId) query = query.eq("genero_id", generoId);
      if (key) query = query.eq("key_armonica", key);
      if (bpmMin) query = query.gte("bpm", Number(bpmMin));
      if (bpmMax) query = query.lte("bpm", Number(bpmMax));
      const rangoDuracion = DURACIONES.find((d) => d.id === duracion);
      if (rangoDuracion?.min != null) query = query.gte("duracion_seg", rangoDuracion.min);
      if (rangoDuracion?.max != null) query = query.lt("duracion_seg", rangoDuracion.max);
      if (antiguedad) {
        const desde = new Date(Date.now() - Number(antiguedad) * 86400e3).toISOString();
        query = query.gte("fecha_subida", desde);
      }

      // Antes estaba en 300 — el catálogo ya superó esa cantidad de
      // tracks activos, así que los temas más viejos (se ordena por
      // fecha_subida desc) habían dejado de aparecer en el Catálogo:
      // no se podían ni buscar ni descargar desde acá, aunque siguieran
      // existiendo. 5000 da margen de sobra para el crecimiento del
      // grupo sin volver a toparse con esto.
      const { data, error } = await query.limit(5000);

      if (error) {
        setError(mensajeErrorAmigable(error));
        setTracks([]);
      } else {
        setTracks((data ?? []) as unknown as TrackFila[]);
      }
    } catch (e) {
      setError(mensajeErrorAmigable(e));
      setTracks([]);
    } finally {
      setCargando(false);
    }
  }

  // Cambiar de género (pills o el select) manda sobre el buscador de
  // texto: si quedó algo escrito de antes, se limpia solo — si no, al
  // tocar otro género salían "0 temas" sin que se notara por qué. BPM y
  // tonalidad quedan como estaban: esos sí se combinan con el género.
  function elegirGenero(id: string) {
    setGeneroId(id);
    if (busqueda) setBusqueda("");
    if (searchParams.has("q")) setSearchParams({}, { replace: true });
  }

  function limpiarFiltros() {
    setBusqueda("");
    setGeneroId("");
    setBpmMin("");
    setBpmMax("");
    setKey("");
    setDuracion("");
    setAntiguedad("");
    setOrden("nuevos");
    if (searchParams.has("q")) setSearchParams({}, { replace: true });
  }

  function toggleSeleccion(id: string) {
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // `filaEl`: el elemento de la fila/tarjeta que disparó esto — lo
  // llevamos a la vista si la barra fija del reproductor (que recién
  // aparece ahora) lo tapa parcialmente. `scroll-mb-*` en cada fila (ver
  // más abajo) le dice al navegador cuánto margen dejar abajo.
  async function reproducir(track: TrackFila, filaEl?: HTMLElement | null) {
    filaEl?.scrollIntoView({ behavior: "smooth", block: "nearest" });

    if (player.trackActual?.id === track.id) {
      // ya está activo este track (sonando o en pausa) — solo togglear
      player.togglePlay();
      return;
    }

    // Sin esto, el click igual terminaba fallando al llamar al backend
    // (puede_escuchar_track — ver sql/012_freemium_v2_vidriera.sql), pero
    // con un error genérico en vez de invitar a suscribirse. Chequear acá
    // antes evita encima el viaje de ida y vuelta.
    if (!puedeEscucharTrack(track)) {
      setAvisoSuscripcion(
        "Para escuchar este tema necesitás una suscripción activa. Mientras tanto, podés escuchar gratis los últimos 10 temas de Cachengue.",
      );
      return;
    }

    setAvisoAccion(null);
    setCargandoPreviewId(track.id);
    try {
      const { url, duracion_seg, peaks } = await obtenerUrlDescarga(track.id, false);
      player.reproducir(
        {
          id: track.id,
          titulo: track.titulo,
          artista_original: track.artista_original,
          remixer: track.remixer,
          duracion_seg: duracion_seg ?? track.duracion_seg,
          url,
          peaks,
        },
        {
          // La cola es el catálogo tal cual está filtrado en este momento
          // (no solo la página actual) — en reproducción continua sigue
          // uno detrás del otro por todo lo filtrado, no solo lo
          // paginado en pantalla. Sin acceso activo, el catálogo
          // filtrado puede tener cualquier track (ahora es la vidriera
          // completa — ver sql/012_freemium_v2_vidriera.sql), así que la
          // cola se acota a la muestra gratuita para no intentar pasar a
          // un tema que después el backend va a rechazar igual.
          cola: (tieneAccesoActivo(perfil)
            ? tracksOrdenados
            : tracksOrdenados.filter((t) => muestraGratisIds.has(t.id))
          ).map((t) => ({
            id: t.id,
            titulo: t.titulo,
            artista_original: t.artista_original,
            remixer: t.remixer,
            duracion_seg: t.duracion_seg,
          })),
          resolverUrl: async (id) => {
            const r = await obtenerUrlDescarga(id, false);
            return { url: r.url, duracion_seg: r.duracion_seg, peaks: r.peaks };
          },
        },
      );
    } catch (e) {
      setAvisoAccion(e instanceof ApiError ? e.message : "No se pudo reproducir el preview.");
    } finally {
      setCargandoPreviewId(null);
    }
  }

  async function descargarIndividual(track: TrackFila) {
    // La descarga real nunca entra en la muestra gratuita (ver
    // sql/012_freemium_v2_vidriera.sql) — a diferencia de reproducir, acá
    // no importa qué track sea, solo si hay suscripción activa.
    if (!tieneAccesoActivo(perfil)) {
      setAvisoSuscripcion("Para descargar necesitás una suscripción activa.");
      return;
    }
    setDescargando(track.id);
    setAvisoAccion(null);
    try {
      const { url } = await obtenerUrlDescarga(track.id, true);
      abrirDescargaDirecta(url);
    } catch (e) {
      setAvisoAccion(e instanceof ApiError ? e.message : "No se pudo descargar el track.");
    } finally {
      setDescargando(null);
    }
  }

  async function descargarSeleccionZip() {
    if (seleccion.size === 0) return;
    if (!tieneAccesoActivo(perfil)) {
      setAvisoSuscripcion("Para descargar necesitás una suscripción activa.");
      return;
    }
    setProcesandoZip(true);
    setAvisoAccion(null);
    try {
      const { archivos } = await descargarZip([...seleccion]);
      await descargarVariosDirecto(archivos);
    } catch (e) {
      setAvisoAccion(e instanceof ApiError ? e.message : "No se pudo descargar la selección.");
    } finally {
      setProcesandoZip(false);
    }
  }

  // Abre el modal y, de paso, trae la lista de playlists a las que este
  // usuario puede sumar temas — antes la única opción era crear una
  // nueva cada vez, aunque ya existiera una playlist armada a mano a la
  // que simplemente se le quería agregar más temas.
  async function abrirFormPlaylist() {
    if (!tieneAccesoActivo(perfil)) {
      setAvisoSuscripcion("Para armar playlists necesitás una suscripción activa.");
      return;
    }
    setMostrarFormPlaylist(true);
    setPlaylistDestino("");
    setAvisoAccion(null);
    try {
      let query = supabase.from("playlists").select("id, nombre").order("nombre");
      if (perfil?.rol !== "admin") query = query.eq("creado_por", session?.user.id ?? "");
      const { data, error } = await query;
      if (!error && data) setPlaylistsPropias(data as { id: string; nombre: string }[]);
    } catch {
      // Si esto falla, el selector queda vacío (solo "Nueva playlist") —
      // no bloquea poder crear una nueva igual.
    }
  }

  async function guardarComoPlaylist() {
    if (!session || seleccion.size === 0) return;
    if (!playlistDestino && !nombrePlaylist.trim()) return;
    // Chequeo propio ANTES de intentar el insert: si la cuenta no tiene
    // acceso activo, el insert de todas formas lo va a rechazar la policy
    // RLS "crear_playlist_con_acceso" — pero con un mensaje de Postgres
    // en inglés que no dice nada. Avisando esto acá, antes, el motivo
    // real queda claro al toque.
    if (!tieneAccesoActivo(perfil)) {
      setAvisoAccion(MENSAJE_SIN_ACCESO_ACTIVO);
      return;
    }
    setGuardandoPlaylist(true);
    setAvisoAccion(null);
    try {
      if (playlistDestino) {
        // Sumar a una playlist que ya existe, en vez de crear una nueva.
        const nombreDestino = playlistsPropias.find((p) => p.id === playlistDestino)?.nombre ?? "la playlist";

        // El primary key es (playlist_id, track_id) — si alguno de los
        // seleccionados ya estaba en esta playlist, insertarlo de nuevo
        // rompería el insert ENTERO. Se consultan los que ya tiene y se
        // sacan de la tanda, en vez de dejar que falle.
        const { data: existentes } = await supabase
          .from("playlist_tracks")
          .select("track_id, orden")
          .eq("playlist_id", playlistDestino);
        const idsExistentes = new Set((existentes ?? []).map((f) => f.track_id as string));
        const ordenBase =
          (existentes ?? []).reduce((max, f) => Math.max(max, f.orden as number), -1) + 1;
        const nuevos = [...seleccion].filter((id) => !idsExistentes.has(id));

        if (nuevos.length === 0) {
          setAvisoAccion(`Todos los temas seleccionados ya estaban en "${nombreDestino}".`);
        } else {
          const filas: PlaylistTrackInsert[] = nuevos.map((trackId, i) => ({
            playlist_id: playlistDestino,
            track_id: trackId,
            orden: ordenBase + i,
          }));
          const { error: errTracks } = await supabase.from("playlist_tracks").insert(filas);
          if (errTracks) throw new Error(errTracks.message);

          const salteados = seleccion.size - nuevos.length;
          setAvisoAccion(
            salteados > 0
              ? `Se agregaron ${nuevos.length} tema(s) a "${nombreDestino}" (${salteados} ya estaban).`
              : `Se agregaron ${nuevos.length} tema(s) a "${nombreDestino}".`,
          );
        }
      } else {
        const nuevaPlaylist: PlaylistInsert = {
          nombre: nombrePlaylist.trim(),
          creado_por: session.user.id,
        };
        const { data: playlist, error: errPlaylist } = await supabase
          .from("playlists")
          .insert(nuevaPlaylist)
          .select()
          .single();
        if (errPlaylist || !playlist) throw new Error(errPlaylist?.message ?? "No se pudo crear la playlist.");

        const filas: PlaylistTrackInsert[] = [...seleccion].map((trackId, i) => ({
          playlist_id: playlist.id as string,
          track_id: trackId,
          orden: i,
        }));
        const { error: errTracks } = await supabase.from("playlist_tracks").insert(filas);
        if (errTracks) throw new Error(errTracks.message);

        setAvisoAccion(`Playlist "${playlist.nombre}" creada con ${filas.length} tracks.`);
      }

      setMostrarFormPlaylist(false);
      setNombrePlaylist("");
      setPlaylistDestino("");
      setSeleccion(new Set());
    } catch (e) {
      setAvisoAccion(mensajeErrorAmigable(e));
    } finally {
      setGuardandoPlaylist(false);
    }
  }

  function abrirEdicion(track: TrackFila) {
    setEditando(track);
    setEdTitulo(track.titulo);
    setEdArtista(track.artista_original ?? "");
    setEdRemixer(track.remixer ?? "");
    setEdGeneroId(track.genero_id ?? "");
    setEdKey(track.key_armonica ?? "");
    setEdBpm(track.bpm != null ? String(track.bpm) : "");
    setEdTags((track.tags ?? []).join(", "));
  }

  async function guardarEdicion() {
    if (!editando) return;
    if (!edTitulo.trim()) {
      setAvisoAccion("El título no puede quedar vacío.");
      return;
    }
    setGuardandoEdicion(true);
    setAvisoAccion(null);
    try {
      const tagsArr = edTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const { error } = await supabase
        .from("tracks")
        .update({
          titulo: edTitulo.trim(),
          artista_original: edArtista.trim() || null,
          remixer: edRemixer.trim() || null,
          genero_id: edGeneroId || null,
          key_armonica: edKey || null,
          bpm: edBpm ? Number(edBpm) : null,
          tags: tagsArr,
        })
        .eq("id", editando.id);
      if (error) throw error;

      setAvisoAccion(`"${edTitulo.trim()}" actualizado.`);
      setEditando(null);
      await cargarTracks();
      cargarConteoGeneros();
    } catch (e) {
      setAvisoAccion(mensajeErrorAmigable(e));
    } finally {
      setGuardandoEdicion(false);
    }
  }

  async function borrarTrack(track: TrackFila) {
    setBorrandoId(track.id);
    setAvisoAccion(null);
    try {
      await borrarTrackAdmin(track.id);
      setConfirmandoBorrarId(null);
      setTracks((prev) => prev.filter((t) => t.id !== track.id));
      setAvisoAccion(`"${track.titulo}" se borró del catálogo.`);
      cargarConteoGeneros();
    } catch (e) {
      setAvisoAccion(e instanceof ApiError ? e.message : "No se pudo borrar el track.");
    } finally {
      setBorrandoId(null);
    }
  }

  async function cambiarPortada(file: File) {
    if (!editando) return;
    setSubiendoPortada(true);
    setAvisoAccion(null);
    try {
      const { path } = await subirPortada(editando.id, file);
      setTracks((prev) =>
        prev.map((t) => (t.id === editando.id ? { ...t, portada_url: path } : t)),
      );
      setEditando((prev) => (prev ? { ...prev, portada_url: path } : prev));
    } catch (e) {
      setAvisoAccion(e instanceof ApiError ? e.message : "No se pudo subir la portada.");
    } finally {
      setSubiendoPortada(false);
    }
  }

  // Saca la portada propia (p.ej. si quedó pegada la de otro tema por
  // error) y deja al track con la genérica de ClubPack, sin tener que
  // pasar por el explorador de archivos a elegir una imagen nueva.
  async function usarPortadaGenerica() {
    if (!editando) return;
    setQuitandoPortada(true);
    setAvisoAccion(null);
    try {
      await quitarPortada(editando.id);
      setTracks((prev) =>
        prev.map((t) => (t.id === editando.id ? { ...t, portada_url: null } : t)),
      );
      setEditando((prev) => (prev ? { ...prev, portada_url: null } : prev));
    } catch (e) {
      setAvisoAccion(e instanceof ApiError ? e.message : "No se pudo quitar la portada.");
    } finally {
      setQuitandoPortada(false);
    }
  }

  const hayFiltrosActivos = useMemo(
    () => !!(busqueda || generoId || bpmMin || bpmMax || key || duracion || antiguedad || orden !== "nuevos"),
    [busqueda, generoId, bpmMin, bpmMax, key, duracion, antiguedad, orden],
  );

  // El orden se aplica acá, sobre lo que trajo la consulta (que viene
  // siempre por fecha desc): los órdenes por métricas usan los contadores
  // agregados de useFavoritos, que no viven en la tabla tracks.
  const tracksOrdenados = useMemo(() => {
    if (orden === "nuevos") return tracks;
    const lista = [...tracks];
    const porFecha = (a: TrackFila, b: TrackFila) =>
      (b.fecha_subida ?? "").localeCompare(a.fecha_subida ?? "");
    switch (orden) {
      case "viejos":
        return lista.reverse();
      case "titulo":
        return lista.sort((a, b) => a.titulo.localeCompare(b.titulo, "es", { sensitivity: "base" }));
      case "bpm_asc":
        return lista.sort((a, b) => (a.bpm ?? Infinity) - (b.bpm ?? Infinity) || porFecha(a, b));
      case "bpm_desc":
        return lista.sort((a, b) => (b.bpm ?? -Infinity) - (a.bpm ?? -Infinity) || porFecha(a, b));
      case "descargas":
        return lista.sort((a, b) => metricasDe(b.id).descargas - metricasDe(a.id).descargas || porFecha(a, b));
      case "escuchas":
        return lista.sort(
          (a, b) => metricasDe(b.id).reproducciones - metricasDe(a.id).reproducciones || porFecha(a, b),
        );
      case "favoritos":
        return lista.sort((a, b) => metricasDe(b.id).favoritos - metricasDe(a.id).favoritos || porFecha(a, b));
      default:
        return lista;
    }
  }, [tracks, orden, metricasDe]);

  const mostrarDescubrimiento = !hayFiltrosActivos && !cargando && tracks.length > 0;
  // "Recién subidos" es ahora un carrusel (ver CarruselHorizontal) en vez
  // de una fila fija, así que puede mostrar bastantes más portadas sin
  // amontonarlas — con el sidebar de PC escondido hay más ancho real
  // disponible de entrada (ver AppShellContext), se suman unas pocas más.
  // Siempre los más nuevos de verdad (tracks viene por fecha desc), sin
  // importar el "Ordenar por" de la lista.
  const destacados = tracks.slice(0, sidebarEscritorioAbierto ? 14 : 18);

  // Top géneros: los 5 con más temas, con su porcentaje sobre el total
  // real del catálogo — se dibuja como mini barras debajo del carrusel.
  const topGeneros = useMemo(() => {
    if (!totalCatalogo) return [];
    return generos
      .map((g, i) => ({ id: g.id, nombre: g.nombre, cantidad: conteoGeneros[g.id] ?? 0, indice: i }))
      .filter((g) => g.cantidad > 0)
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 5)
      .map((g) => ({ ...g, porcentaje: Math.round((g.cantidad / totalCatalogo) * 100) }));
  }, [generos, conteoGeneros, totalCatalogo]);

  // Pills: en orden alfabético (predecible aunque la lista siga
  // creciendo) y solo los géneros que tienen al menos un tema — los
  // recién creados y todavía vacíos siguen apareciendo en el <select>
  // de Género, pero no ocupan lugar arriba.
  const generosPills = useMemo(
    () =>
      generos
        .map((g, i) => ({ g, i }))
        .filter(({ g }) => (conteoGeneros[g.id] ?? 0) > 0)
        .sort((a, b) => a.g.nombre.localeCompare(b.g.nombre, "es", { sensitivity: "base" })),
    [generos, conteoGeneros],
  );

  const totalPaginas = Math.max(1, Math.ceil(tracksOrdenados.length / PAGINA_TAMANO));
  // Por si la lista se achica (un filtro, un borrado) y la página en la
  // que uno estaba ya no existe más.
  const paginaSegura = Math.min(pagina, totalPaginas);
  const tracksPagina = tracksOrdenados.slice(
    (paginaSegura - 1) * PAGINA_TAMANO,
    paginaSegura * PAGINA_TAMANO,
  );

  // Mismos controles arriba y abajo de la lista — en un catálogo largo
  // (5+ páginas) volver a bajar hasta el pie solo para pasar de página
  // es incómodo.
  const controlesPaginacion = totalPaginas > 1 && (
    <div className="flex items-center justify-center gap-3">
      <button
        type="button"
        onClick={() => setPagina((p) => Math.max(1, p - 1))}
        disabled={paginaSegura <= 1}
        className="text-sm font-semibold px-4 py-2 rounded-lg border border-border hover:border-ink transition-colors appearance-none bg-transparent cursor-pointer disabled:opacity-40 disabled:cursor-default"
      >
        Anterior
      </button>
      <span className="text-sm text-muted">
        Página {paginaSegura} de {totalPaginas}
      </span>
      <button
        type="button"
        onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
        disabled={paginaSegura >= totalPaginas}
        className="text-sm font-semibold px-4 py-2 rounded-lg border border-border hover:border-ink transition-colors appearance-none bg-transparent cursor-pointer disabled:opacity-40 disabled:cursor-default"
      >
        Siguiente
      </button>
    </div>
  );

  return (
    <div className="flex flex-col gap-8">
      {/* Banner de bienvenida */}
      <div className="relative overflow-hidden rounded-2xl px-6 sm:px-9 py-9 sm:py-11 bg-ink">
        {/* Modo claro: la foto trae de fábrica un texto de relleno "fantasma"
            incrustado (es un mockup, no una foto limpia) — con un scrim
            débil ese texto se transparentaba detrás del título real y
            quedaba doble. El scrim tiene que ser fuerte justo donde va el
            texto (misma lógica que ya usa el modo oscuro, solo que acá en
            blanco) para taparlo del todo, y mucho más suave hacia la
            derecha, donde no hay texto y sí conviene que se note el color
            original de la foto. */}
        <img
          src="/hero-light.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover dark:hidden"
        />
        <img
          src="/hero-dark.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover opacity-60 hidden dark:block"
        />
        <div
          className="absolute inset-0 dark:hidden"
          style={{
            background:
              "linear-gradient(100deg, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.78) 40%, rgba(255,255,255,0.4) 70%, rgba(255,255,255,0.1) 100%)",
          }}
        />
        {/* Modo oscuro: sin cambios. */}
        <div
          className="absolute inset-0 hidden dark:block"
          style={{
            background:
              "linear-gradient(100deg, rgba(10,10,20,0.88) 0%, rgba(10,10,20,0.6) 55%, rgba(10,10,20,0.25) 100%)",
          }}
        />
        <div className="relative max-w-xl">
          <h1 className="font-display font-extrabold text-[clamp(1.6rem,3.5vw,2.4rem)] leading-[1.08] tracking-[-0.5px] m-0 text-ink dark:text-white">
            {/* "Colaborativo" solo tiene sentido para quien podría subir —
                licencia Simple no sube nada, así que no corresponde
                prometerle colaboración (ver sql/019_tipo_licencia.sql). */}
            {permiteSubidaColaboradores && esLicenciaDj(perfil)
              ? "El catálogo colaborativo de música para DJs"
              : "El catálogo de música para DJs"}
          </h1>
          <p className="mt-3 text-ink/75 dark:text-white/75 text-sm sm:text-base m-0">
            {totalCatalogo === null
              ? "Cargando…"
              : `Descubrí, escuchá y descargá los ${totalCatalogo} track${totalCatalogo === 1 ? "" : "s"} que compartió el grupo.`}
          </p>
          <button
            type="button"
            onClick={() =>
              document.getElementById("catalogo-filtros")?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
            className="mt-5 inline-flex items-center gap-2 bg-accent text-white text-sm font-semibold px-5 py-2.5 rounded-full appearance-none border-none cursor-pointer shadow-md hover:brightness-110 transition"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M6 4 L20 12 L6 20 Z" />
            </svg>
            Explorar ahora
          </button>
        </div>

        {/* Tagline manuscrito — solo modo oscuro, como en la referencia de diseño.
            Oculto en mobile: a ese ancho se superpone con el título. Solo
            tiene sentido mientras la subida es colaborativa de verdad, y
            para quien podría subir (licencia DJ, sql/019_tipo_licencia.sql). */}
        {permiteSubidaColaboradores && esLicenciaDj(perfil) && (
          <p
            className="hidden dark:sm:block absolute right-9 top-9 font-script text-3xl leading-[1.05] text-white/90 rotate-[-4deg] m-0 text-right"
            style={{ textShadow: "0 2px 10px rgba(0,0,0,0.35)" }}
            aria-hidden="true"
          >
            Juntos
            <br />
            hacemos crecer
            <br />
            el catálogo
          </p>
        )}
      </div>

      {/* Aviso de subidas suspendidas — se ve en el Catálogo (no en /subir)
          porque cuando el admin cierra las subidas, AppShell le esconde a
          todos los no-admin el botón "Subir Temas" (ver puedeVerBotonSubir
          ahí); sin este aviso acá, nadie se entera de que puede mandar el
          tema por el chat en vez de simplemente no poder subirlo. Además
          exige licencia DJ: a un Simple no le compete este aviso, nunca
          podría subir aunque las subidas estuvieran abiertas. */}
      {!permiteSubidaColaboradores && perfil?.rol !== "admin" && esLicenciaDj(perfil) && (
        <p className="text-sm bg-accent/10 border border-accent/30 rounded-xl px-4 py-3 m-0">
          👋 Hola DJs: por ahora la subida de temas al catálogo está suspendida. Si tenés un
          tema para sumar, compartilo por el{" "}
          <Link to="/chat" className="underline font-semibold">
            chat de la comunidad
          </Link>{" "}
          (sección Comunidad) y el administrador lo sube por vos.
        </p>
      )}

      {/* Aviso de acceso gratuito limitado — solo para quien todavía no tiene
          suscripción activa. Desde sql/012_freemium_v2_vidriera.sql ya se ve
          el catálogo completo (es la vidriera) sin pagar, pero lo único que
          se puede ESCUCHAR son los últimos 10 temas de Cachengue — el resto
          (escuchar cualquier otro tema, descargar lo que sea, armar
          playlists) sigue atrás de la suscripción. */}
      {perfil && perfil.estado_suscripcion !== "activo" && perfil.rol !== "admin" && (
        <p className="text-sm bg-accent/10 border border-accent/30 rounded-xl px-4 py-3 m-0">
          Ya podés ver todo el catálogo. Por ahora, sin suscripción, podés escuchar gratis los{" "}
          <strong>últimos 10 temas de Cachengue</strong>. Para escuchar el resto, descargar y armar
          playlists, necesitás una suscripción mensual —{" "}
          <Link to="/suscripcion" className="underline font-semibold">
            suscribite acá
          </Link>
          .
        </p>
      )}

      {/* Pills de género — compactas: en celular una sola fila que se
          desliza a lo ancho (sin barra visible), en pantallas más grandes
          se acomodan en varias filas. Alfabéticas y sin los géneros vacíos
          (ver generosPills). */}
      {generosPills.length > 0 && (
        <div className="-mt-2 -mx-4 px-4 sm:mx-0 sm:px-0 flex sm:flex-wrap gap-1.5 overflow-x-auto sm:overflow-visible scrollbar-hide">
          <button
            type="button"
            onClick={() => elegirGenero("")}
            className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full appearance-none cursor-pointer transition-colors ${
              generoId === "" ? "border-none bg-ink text-cream" : "bg-card border border-border text-body hover:border-ink"
            }`}
          >
            Todos{totalCatalogo != null ? ` (${totalCatalogo})` : ""}
          </button>
          {generosPills.map(({ g, i }) => (
            <button
              key={g.id}
              type="button"
              onClick={() => elegirGenero(g.id === generoId ? "" : g.id)}
              className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full appearance-none border-none cursor-pointer transition-colors whitespace-nowrap ${
                generoId === g.id ? "bg-accent text-white" : badgeGenero(i)
              }`}
            >
              {g.nombre} <span className="opacity-70">({conteoGeneros[g.id] ?? 0})</span>
            </button>
          ))}
        </div>
      )}

      {/* Filtros */}
      <div
        id="catalogo-filtros"
        className="bg-card rounded-2xl p-5 border border-border-soft flex flex-wrap gap-4 items-end scroll-mt-24"
      >
        <div className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
          <label htmlFor="busqueda" className="text-xs font-semibold text-body">
            Buscar
          </label>
          <input
            id="busqueda"
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Título, remixer, artista…"
            className="px-3 py-2 rounded-lg border border-border text-sm bg-cream-soft focus:outline-2 focus:outline-accent"
          />
        </div>

        <div className="flex flex-col gap-1.5 min-w-[160px]">
          <label htmlFor="genero" className="text-xs font-semibold text-body">
            Género
          </label>
          <select
            id="genero"
            value={generoId}
            onChange={(e) => elegirGenero(e.target.value)}
            className="px-3 py-2 rounded-lg border border-border text-sm bg-cream-soft"
          >
            <option value="">Todos</option>
            {generos.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nombre}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5 w-24">
          <label htmlFor="bpmMin" className="text-xs font-semibold text-body">
            BPM min
          </label>
          <input
            id="bpmMin"
            type="number"
            value={bpmMin}
            onChange={(e) => setBpmMin(e.target.value)}
            className="px-3 py-2 rounded-lg border border-border text-sm bg-cream-soft"
          />
        </div>

        <div className="flex flex-col gap-1.5 w-24">
          <label htmlFor="bpmMax" className="text-xs font-semibold text-body">
            BPM max
          </label>
          <input
            id="bpmMax"
            type="number"
            value={bpmMax}
            onChange={(e) => setBpmMax(e.target.value)}
            className="px-3 py-2 rounded-lg border border-border text-sm bg-cream-soft"
          />
        </div>

        <div className="flex flex-col gap-1.5 w-28">
          <label htmlFor="key" className="text-xs font-semibold text-body">
            Tonalidad
          </label>
          <select
            id="key"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            className="px-3 py-2 rounded-lg border border-border text-sm bg-cream-soft"
          >
            <option value="">Todas</option>
            {CAMELOT_KEYS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5 min-w-[130px]">
          <label htmlFor="duracion" className="text-xs font-semibold text-body">
            Duración
          </label>
          <select
            id="duracion"
            value={duracion}
            onChange={(e) => setDuracion(e.target.value as DuracionFiltro)}
            className="px-3 py-2 rounded-lg border border-border text-sm bg-cream-soft"
          >
            {DURACIONES.map((d) => (
              <option key={d.id} value={d.id}>
                {d.texto}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5 min-w-[140px]">
          <label htmlFor="antiguedad" className="text-xs font-semibold text-body">
            Fecha de subida
          </label>
          <select
            id="antiguedad"
            value={antiguedad}
            onChange={(e) => setAntiguedad(e.target.value as AntiguedadFiltro)}
            className="px-3 py-2 rounded-lg border border-border text-sm bg-cream-soft"
          >
            {ANTIGUEDADES.map((a) => (
              <option key={a.id} value={a.id}>
                {a.texto}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5 min-w-[150px]">
          <label htmlFor="orden" className="text-xs font-semibold text-body">
            Ordenar por
          </label>
          <select
            id="orden"
            value={orden}
            onChange={(e) => {
              setOrden(e.target.value as OrdenCatalogo);
              setPagina(1);
            }}
            className="px-3 py-2 rounded-lg border border-border text-sm bg-cream-soft"
          >
            {ORDENES.map((o) => (
              <option key={o.id} value={o.id}>
                {o.texto}
              </option>
            ))}
          </select>
        </div>

        {hayFiltrosActivos && (
          <button
            type="button"
            onClick={limpiarFiltros}
            className="text-sm font-semibold text-muted hover:text-ink appearance-none bg-transparent border-none cursor-pointer px-2 py-2"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {avisoAccion && (
        <p className="text-sm bg-card border border-border-soft rounded-xl px-4 py-3 m-0">
          {avisoAccion}
        </p>
      )}
      {error && <p className="text-sm text-accent font-medium">{error}</p>}

      {/* Recién subidos — los últimos subidos, como tarjetas en un carrusel */}
      {mostrarDescubrimiento && (
        <div className="flex flex-col gap-3.5">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-bold text-lg m-0">Recién subidos</h2>
          </div>
          <CarruselHorizontal>
            {destacados.map((t) => {
              const esElSonando = player.trackActual?.id === t.id;
              const mostrandoSpinner =
                cargandoPreviewId === t.id || (esElSonando && player.estado === "cargando");
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={(e) => reproducir(t, e.currentTarget)}
                  className="group relative shrink-0 w-44 text-left appearance-none bg-transparent border-none cursor-pointer p-0 scroll-mb-20"
                >
                  <div className="relative w-44 h-44 rounded-2xl overflow-hidden border border-border-soft">
                    <Portada path={t.portada_url} alt="" className="w-full h-full object-cover" />
                    <span className="absolute inset-0 bg-ink/0 group-hover:bg-ink/30 transition-colors" />
                    <span className="absolute top-2 left-2">
                      <BotonCorazon
                        variante="portada"
                        activo={esFavorito(t.id)}
                        cantidad={metricasDe(t.id).favoritos}
                        onClick={() => void toggleFavorito(t.id)}
                      />
                    </span>
                    <span
                      title={!puedeEscucharTrack(t) ? "Necesitás una suscripción activa para escuchar esto" : undefined}
                      className="absolute bottom-2.5 right-2.5 w-9 h-9 rounded-full bg-white text-ink-fixed flex items-center justify-center shadow"
                    >
                      {mostrandoSpinner ? (
                        <span className="text-xs">…</span>
                      ) : !puedeEscucharTrack(t) ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 2a4 4 0 0 0-4 4v3H7a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-1V6a4 4 0 0 0-4-4Zm-2 7V6a2 2 0 1 1 4 0v3Z" />
                        </svg>
                      ) : esElSonando && player.estado === "sonando" ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                          <rect x="5" y="4" width="5" height="16" />
                          <rect x="14" y="4" width="5" height="16" />
                        </svg>
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M6 4 L20 12 L6 20 Z" />
                        </svg>
                      )}
                    </span>
                  </div>
                  <div className="mt-2 px-0.5">
                    <div className="font-semibold text-sm truncate">{t.titulo}</div>
                    <div className="text-xs text-muted truncate">
                      {t.remixer || t.perfiles?.nombre_dj || t.perfiles?.email || "—"}
                      {t.bpm != null ? ` · ${formatearBpm(t.bpm)} bpm` : ""}
                    </div>
                  </div>
                </button>
              );
            })}
          </CarruselHorizontal>

          {/* Top géneros — qué pesa más en el catálogo; cada barra filtra
              por ese género al tocarla. */}
          {topGeneros.length > 0 && (
            <div className="bg-card rounded-2xl border border-border-soft px-5 py-4 flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-display font-bold text-sm m-0">Top géneros</h3>
                <span className="text-[11px] text-muted-2">% del catálogo</span>
              </div>
              <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-5">
                {topGeneros.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => elegirGenero(g.id)}
                    title={`Ver ${g.nombre}`}
                    className="text-left appearance-none bg-transparent border-none cursor-pointer p-0 flex flex-col gap-1 min-w-0 group/tg"
                  >
                    <span className="flex items-baseline justify-between gap-2 text-xs min-w-0">
                      <span className={`font-semibold px-2 py-0.5 rounded-full truncate ${badgeGenero(g.indice)}`}>
                        {g.nombre}
                      </span>
                      <span className="text-muted tabular-nums shrink-0">
                        {g.porcentaje}% <span className="text-muted-3">· {g.cantidad}</span>
                      </span>
                    </span>
                    <span className="h-1.5 w-full rounded-full bg-black/8 dark:bg-white/10 overflow-hidden">
                      <span
                        className="block h-full rounded-full bg-accent group-hover/tg:brightness-110 transition-[width] duration-500"
                        style={{ width: `${Math.max(4, g.porcentaje)}%` }}
                      />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Lista completa */}
      <div className="flex flex-col gap-3.5">
        {mostrarDescubrimiento && <h2 className="font-display font-bold text-lg m-0">Catálogo completo</h2>}
        {controlesPaginacion}
        <div className="bg-card rounded-2xl border border-border-soft overflow-hidden">
        {!cargando && tracks.length === 0 && (
          <div className="p-8 text-center text-muted text-sm">
            No hay tracks que coincidan con estos filtros.
          </div>
        )}

        {/* Encabezados — solo desde sm: (ahí es donde las columnas de la
            derecha dejan de estar ocultas). Los anchos/gaps de cada <span>
            tienen que calcar exactamente a los de la fila de abajo para
            que quede alineado — "Acciones" incluido, con w-56 fijo en
            ambos lados aunque la fila tenga 1 botón (Bajar solo) o 3
            (+ Editar/Borrar según quién sea): si "Acciones" no fuera de
            ancho fijo, "Tema" (el único flex-1) terminaría midiendo
            distinto en el encabezado que en cada fila y todo se
            correría de nuevo. */}
        {tracksPagina.length > 0 && (
          <div className="hidden sm:flex items-center gap-x-4 px-5 py-2.5 border-b border-border-soft text-xs font-semibold text-muted uppercase">
            <span className="w-4 shrink-0" aria-hidden="true" />
            <span className="w-9 shrink-0" aria-hidden="true" />
            <span className="w-9 shrink-0" aria-hidden="true" />
            <span className="min-w-[150px] flex-1">Tema</span>
            <span className="w-28 shrink-0 text-center">Género</span>
            <span className="w-16 shrink-0 text-center">BPM</span>
            <span className="w-20 shrink-0 text-center">Tonalidad</span>
            <span className="w-20 shrink-0 text-center">Duración</span>
            <span className="w-56 shrink-0 text-center">Acciones</span>
          </div>
        )}

        {tracksPagina.map((t) => {
          const seleccionado = seleccion.has(t.id);
          const esElSonando = player.trackActual?.id === t.id;
          const mostrandoSpinner =
            cargandoPreviewId === t.id || (esElSonando && player.estado === "cargando");
          const puedeEditar = t.subido_por === session?.user.id || perfil?.rol === "admin";
          const esAdmin = perfil?.rol === "admin";
          const iGenero = generos.findIndex((g) => g.id === t.genero_id);
          return (
            <div
              key={t.id}
              data-fila-track
              className={`flex flex-col border-b border-border-soft last:border-b-0 scroll-mb-20 ${seleccionado ? "bg-cream" : ""}`}
            >
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
                <input
                  type="checkbox"
                  checked={seleccionado}
                  onChange={() => toggleSeleccion(t.id)}
                  aria-label={`Seleccionar ${t.titulo}`}
                  className="w-4 h-4 accent-accent shrink-0"
                />

                <button
                  type="button"
                  onClick={(e) => reproducir(t, e.currentTarget.closest<HTMLElement>("[data-fila-track]"))}
                  aria-label={
                    !puedeEscucharTrack(t)
                      ? "Necesitás una suscripción activa para escuchar esto"
                      : esElSonando && player.estado === "sonando"
                        ? "Pausar"
                        : "Reproducir preview"
                  }
                  title={!puedeEscucharTrack(t) ? "Necesitás una suscripción activa para escuchar esto" : undefined}
                  className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center appearance-none border-none cursor-pointer ${
                    puedeEscucharTrack(t) ? "bg-ink text-cream" : "bg-black/10 dark:bg-white/15 text-muted"
                  }`}
                >
                  {mostrandoSpinner ? (
                    <span className="text-xs">…</span>
                  ) : !puedeEscucharTrack(t) ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2a4 4 0 0 0-4 4v3H7a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-1V6a4 4 0 0 0-4-4Zm-2 7V6a2 2 0 1 1 4 0v3Z" />
                    </svg>
                  ) : esElSonando && player.estado === "sonando" ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="5" y="4" width="5" height="16" />
                      <rect x="14" y="4" width="5" height="16" />
                    </svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M6 4 L20 12 L6 20 Z" />
                    </svg>
                  )}
                </button>

                <Portada
                  path={t.portada_url}
                  alt=""
                  className="hidden sm:block shrink-0 w-9 h-9 rounded-lg object-cover border border-border-soft"
                />

                <div className="min-w-[150px] flex-1">
                  <div className="font-semibold text-sm truncate">{t.titulo}</div>
                  <div className="text-xs text-muted truncate">
                    {t.remixer ? `Remix: ${t.remixer}` : ""}
                    {t.remixer && t.artista_original ? " · " : ""}
                    {t.artista_original ? `Original: ${t.artista_original}` : ""}
                  </div>
                </div>

                <div className="hidden sm:flex justify-center w-28 shrink-0">
                  {t.generos?.nombre ? (
                    <span
                      title={t.generos.nombre}
                      className={`inline-block max-w-full truncate text-xs font-semibold px-2.5 py-1 rounded-full ${badgeGenero(
                        iGenero < 0 ? 0 : iGenero,
                      )}`}
                    >
                      {t.generos.nombre}
                    </span>
                  ) : (
                    <span className="text-xs text-muted">—</span>
                  )}
                </div>
                <div className="hidden sm:block text-xs text-muted w-16 shrink-0 text-center">
                  {formatearBpm(t.bpm)} bpm
                </div>
                <div className="hidden sm:block text-xs text-muted w-20 shrink-0 text-center">
                  {t.key_armonica ?? "—"}
                </div>
                <div className="hidden sm:block text-xs text-muted w-20 shrink-0 text-center">
                  {formatearDuracion(t.duracion_seg)}
                </div>

                {/* Ancho fijo (no shrink/grow) para que esta columna mida
                    siempre lo mismo sin importar cuántos botones entren
                    en cada fila (Editar es del dueño o admin, Borrar
                    solo admin) — así "Tema" (el único flex-1 de la fila)
                    termina midiendo siempre igual que en el encabezado,
                    que es lo que los mantiene alineados. Ver el <span>
                    "Acciones" del encabezado, más arriba, con el mismo
                    w-56. */}
                <div className="w-56 shrink-0 flex flex-wrap items-center justify-center gap-2">
                  <BotonCorazon
                    activo={esFavorito(t.id)}
                    cantidad={metricasDe(t.id).favoritos}
                    onClick={() => void toggleFavorito(t.id)}
                  />

                  {puedeEditar && (
                    <button
                      type="button"
                      onClick={() => abrirEdicion(t)}
                      aria-label={`Editar ${t.titulo}`}
                      title="Editar"
                      className="shrink-0 p-2 flex items-center justify-center rounded-lg border border-border hover:border-ink transition-colors appearance-none bg-transparent cursor-pointer"
                    >
                      <IconoEditar />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => descargarIndividual(t)}
                    disabled={descargando === t.id}
                    aria-label={`Bajar ${t.titulo}`}
                    title="Bajar"
                    className="shrink-0 p-2 flex items-center justify-center rounded-lg border border-border hover:border-ink transition-colors appearance-none bg-transparent cursor-pointer disabled:opacity-50"
                  >
                    {descargando === t.id ? <span className="text-xs px-0.5">…</span> : <IconoBajar />}
                  </button>

                  {esAdmin && confirmandoBorrarId !== t.id && (
                    <button
                      type="button"
                      onClick={() => setConfirmandoBorrarId(t.id)}
                      aria-label={`Borrar ${t.titulo}`}
                      title="Borrar"
                      className="shrink-0 p-2 flex items-center justify-center rounded-lg border border-border hover:border-accent hover:text-accent transition-colors appearance-none bg-transparent cursor-pointer"
                    >
                      <IconoBorrar />
                    </button>
                  )}
                  {esAdmin && confirmandoBorrarId === t.id && (
                    <div className="shrink-0 flex items-center gap-1.5">
                      <span className="text-xs text-muted">¿Seguro?</span>
                      <button
                        type="button"
                        onClick={() => borrarTrack(t)}
                        disabled={borrandoId === t.id}
                        className="text-xs font-semibold px-2.5 py-2 rounded-lg bg-accent text-white appearance-none border-none cursor-pointer disabled:opacity-60"
                      >
                        {borrandoId === t.id ? "…" : "Sí, borrar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmandoBorrarId(null)}
                        disabled={borrandoId === t.id}
                        className="text-xs text-muted hover:text-ink appearance-none bg-transparent border-none cursor-pointer disabled:opacity-60"
                      >
                        No
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        </div>

        {controlesPaginacion}
      </div>

      {/* Barra de selección */}
      {/* "bottom" sube cuando hay reproductor activo (barra fija abajo de
          todo, ver AppShell) para no quedar tapada ni tapar sus controles —
          antes quedaban las dos superpuestas, ver captura de Edgar.
          "max-w-full" + "flex-wrap" (en vez de una sola fila sin límite de
          ancho) es lo que evita que en el celular el contenido se corte en
          los bordes de la pantalla o las palabras se partan a la mitad —
          pasaba eso antes: la fila no tenía tope de ancho, así que en
          pantallas angostas se desbordaba y cada texto se achicaba hasta
          partirse por el medio (ver otra captura de Edgar). Con
          "whitespace-nowrap" en cada texto, lo que se mueve de línea es el
          botón entero, nunca una palabra sola. */}
      {seleccion.size > 0 && (
        <div
          className={`sticky self-center max-w-full bg-ink text-cream rounded-3xl px-4 py-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 shadow-lg ${
            player.trackActual ? "bottom-24" : "bottom-4"
          }`}
        >
          <span className="text-sm font-semibold whitespace-nowrap">
            {seleccion.size} seleccionados
          </span>
          <button
            type="button"
            onClick={descargarSeleccionZip}
            disabled={procesandoZip}
            className="text-sm font-semibold bg-accent text-white px-4 py-2 rounded-full appearance-none border-none cursor-pointer disabled:opacity-60 whitespace-nowrap"
          >
            {procesandoZip ? (
              "Descargando…"
            ) : (
              <>
                <span className="sm:hidden">Descargar</span>
                <span className="hidden sm:inline">Descargar selección</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => void abrirFormPlaylist()}
            className="text-sm font-semibold bg-transparent text-cream px-2 py-2 appearance-none border-none cursor-pointer underline whitespace-nowrap"
          >
            <span className="sm:hidden">Playlist</span>
            <span className="hidden sm:inline">Guardar como playlist</span>
          </button>
          <button
            type="button"
            onClick={() => setSeleccion(new Set())}
            className="text-sm text-cream/70 hover:text-cream appearance-none bg-transparent border-none cursor-pointer whitespace-nowrap"
          >
            Cancelar
          </button>
        </div>
      )}

      {mostrarFormPlaylist && (
        <div className="fixed inset-0 bg-overlay flex items-center justify-center z-50 px-4">
          {/* max-h + overflow-y-auto: en el celular, con el teclado abierto
              (lo dispara el autoFocus del input de nombre), el viewport
              visible se achica mucho y el modal podía quedar más alto que
              lo que entraba en pantalla — empujando el botón "Crear" por
              detrás del teclado, invisible e intocable, aunque el resto
              del formulario (elegir tema, escribir el nombre) funcionara
              bien. Con esto el contenido del modal scrollea en vez de
              cortarse, así el botón siempre se puede alcanzar. */}
          <div className="bg-card rounded-2xl p-6 max-w-sm w-full flex flex-col gap-4 max-h-[85vh] overflow-y-auto">
            <h2 className="font-display font-bold text-lg m-0">
              {playlistDestino ? "Sumar a playlist" : "Nueva playlist"}
            </h2>

            {playlistsPropias.length > 0 && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-body">Destino</label>
                <select
                  value={playlistDestino}
                  onChange={(e) => setPlaylistDestino(e.target.value)}
                  className="px-3 py-2.5 rounded-lg border border-border text-sm bg-cream-soft"
                >
                  <option value="">— Nueva playlist —</option>
                  {playlistsPropias.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {!playlistDestino && (
              <input
                type="text"
                autoFocus
                value={nombrePlaylist}
                onChange={(e) => setNombrePlaylist(e.target.value)}
                placeholder="Nombre de la playlist"
                className="px-3 py-2.5 rounded-lg border border-border text-sm bg-cream-soft"
              />
            )}

            {/* Antes, si esto fallaba (ej. error de red o de permisos), el
                aviso se seteaba pero se mostraba arriba de todo en la
                página — tapado por este mismo modal (que cubre toda la
                pantalla), así que no se veía nada: tocabas "Crear" y
                parecía que no pasaba nada. Mostrándolo acá también, el
                error queda visible sin tener que cerrar el modal. */}
            {avisoAccion && (
              <p className="text-sm text-accent font-medium m-0">{avisoAccion}</p>
            )}

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setMostrarFormPlaylist(false)}
                className="text-sm font-semibold px-4 py-2 rounded-lg appearance-none bg-transparent border-none cursor-pointer text-muted"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={guardarComoPlaylist}
                disabled={guardandoPlaylist || (!playlistDestino && !nombrePlaylist.trim())}
                className="text-sm font-semibold px-4 py-2 rounded-lg bg-accent text-white appearance-none border-none cursor-pointer disabled:opacity-60"
              >
                {guardandoPlaylist ? "Guardando…" : playlistDestino ? "Agregar" : "Crear"}
              </button>
            </div>
          </div>
        </div>
      )}

      {editando && (
        <div className="fixed inset-0 bg-overlay flex items-center justify-center z-50 px-4">
          <div className="bg-card rounded-2xl p-6 max-w-lg w-full flex flex-col gap-4">
            <h2 className="font-display font-bold text-lg m-0">Editar track</h2>

            <div className="flex items-center gap-4">
              <Portada
                path={editando.portada_url}
                alt=""
                className="w-16 h-16 rounded-xl object-cover border border-border-soft shrink-0"
              />
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-body">Portada</label>
                <div className="flex items-center gap-3">
                  <label className="text-xs font-semibold underline text-ink cursor-pointer self-start">
                    {subiendoPortada ? "Subiendo…" : "Cambiar imagen"}
                    <input
                      type="file"
                      accept="image/*"
                      disabled={subiendoPortada}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void cambiarPortada(file);
                        e.target.value = "";
                      }}
                      className="hidden"
                    />
                  </label>
                  {editando.portada_url && (
                    <button
                      type="button"
                      onClick={usarPortadaGenerica}
                      disabled={quitandoPortada || subiendoPortada}
                      className="text-xs font-semibold underline text-muted appearance-none bg-transparent border-none cursor-pointer disabled:opacity-60"
                    >
                      {quitandoPortada ? "Quitando…" : "Usar la genérica de ClubPack"}
                    </button>
                  )}
                </div>
                <span className="text-xs text-muted">Si no subís una, queda la genérica de ClubPack.</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1 sm:col-span-2">
                <label className="text-xs font-semibold text-body">Título *</label>
                <input
                  type="text"
                  autoFocus
                  value={edTitulo}
                  onChange={(e) => setEdTitulo(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-border text-sm bg-cream-soft"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-body">Remixer</label>
                <input
                  type="text"
                  value={edRemixer}
                  onChange={(e) => setEdRemixer(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-border text-sm bg-cream-soft"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-body">Artista original</label>
                <input
                  type="text"
                  value={edArtista}
                  onChange={(e) => setEdArtista(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-border text-sm bg-cream-soft"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-body">Género</label>
                <select
                  value={edGeneroId}
                  onChange={(e) => setEdGeneroId(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-border text-sm bg-cream-soft"
                >
                  <option value="">Sin especificar</option>
                  {generos.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-body">Tonalidad</label>
                <select
                  value={edKey}
                  onChange={(e) => setEdKey(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-border text-sm bg-cream-soft"
                >
                  <option value="">Sin especificar</option>
                  {CAMELOT_KEYS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-body">BPM</label>
                <input
                  type="number"
                  step="0.1"
                  value={edBpm}
                  onChange={(e) => setEdBpm(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-border text-sm bg-cream-soft"
                />
              </div>
              <div className="flex flex-col gap-1 sm:col-span-2">
                <label className="text-xs font-semibold text-body">Tags</label>
                <input
                  type="text"
                  value={edTags}
                  onChange={(e) => setEdTags(e.target.value)}
                  placeholder="separados, por, coma"
                  className="px-3 py-2 rounded-lg border border-border text-sm bg-cream-soft"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-1">
              <button
                type="button"
                onClick={() => setEditando(null)}
                disabled={guardandoEdicion}
                className="text-sm font-semibold px-4 py-2 rounded-lg appearance-none bg-transparent border-none cursor-pointer text-muted disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={guardarEdicion}
                disabled={guardandoEdicion || !edTitulo.trim()}
                className="text-sm font-semibold px-4 py-2 rounded-lg bg-accent text-white appearance-none border-none cursor-pointer disabled:opacity-60"
              >
                {guardandoEdicion ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal "necesitás suscripción" — se dispara al tocar Reproducir
          (fuera de la muestra gratuita), Bajar o Guardar/Sumar a playlist
          sin suscripción activa. Pensado para dar ganas de sumarse: ahora
          que se puede ver TODO el catálogo (ver sql/012_freemium_v2_vidriera.sql)
          sin cuenta paga, este es el momento de mostrar el precio en vez
          de dejar el intento picando con un error genérico. */}
      <AvisoSuscripcionModal mensaje={avisoSuscripcion} onCerrar={() => setAvisoSuscripcion(null)} />
    </div>
  );
}
