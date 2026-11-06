import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  abrirDescargaDirecta,
  ApiError,
  borrarTrackAdmin,
  descargarBlob,
  descargarZip,
  obtenerUrlDescarga,
  subirPortada,
} from "../lib/api";
import {
  CAMELOT_KEYS,
  formatearBpm,
  formatearDuracion,
  formatearFecha,
  mensajeErrorAmigable,
} from "../lib/format";
import type { Genero, PlaylistInsert, PlaylistTrackInsert } from "../lib/types";
import { useAuth } from "../lib/auth";
import { usePlayer } from "../lib/player";
import Portada from "../components/Portada";

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

export default function CatalogoPage() {
  const { session, perfil } = useAuth();
  const player = usePlayer();
  const [searchParams] = useSearchParams();
  const [tracks, setTracks] = useState<TrackFila[]>([]);
  const [generos, setGeneros] = useState<Genero[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [busqueda, setBusqueda] = useState(() => searchParams.get("q") ?? "");
  const [generoId, setGeneroId] = useState("");
  const [bpmMin, setBpmMin] = useState("");
  const [bpmMax, setBpmMax] = useState("");
  const [key, setKey] = useState("");

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
  }, []);

  useEffect(() => {
    // Si el buscador del header manda a /catalogo?q=... estando ya en esta
    // página, el componente no se remonta — sin esto el campo de búsqueda
    // se quedaría con el valor viejo.
    const q = searchParams.get("q") ?? "";
    setBusqueda((prev) => (prev === q ? prev : q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    const handle = setTimeout(() => {
      cargarTracks();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda, generoId, bpmMin, bpmMax, key]);

  async function cargarTracks() {
    setCargando(true);
    setError(null);

    try {
      let query = supabase
        .from("tracks")
        .select(
          "id, titulo, artista_original, remixer, bpm, key_armonica, duracion_seg, genero_id, generos(nombre), subido_por, tags, portada_url, fecha_subida, perfiles(nombre_dj, email)",
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

      const { data, error } = await query.limit(300);

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

  function limpiarFiltros() {
    setBusqueda("");
    setGeneroId("");
    setBpmMin("");
    setBpmMax("");
    setKey("");
  }

  function toggleSeleccion(id: string) {
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function reproducir(track: TrackFila) {
    if (player.trackActual?.id === track.id) {
      // ya está activo este track (sonando o en pausa) — solo togglear
      player.togglePlay();
      return;
    }

    setAvisoAccion(null);
    setCargandoPreviewId(track.id);
    try {
      const { url } = await obtenerUrlDescarga(track.id, false);
      player.reproducir({ id: track.id, titulo: track.titulo, remixer: track.remixer, url });
    } catch (e) {
      setAvisoAccion(e instanceof ApiError ? e.message : "No se pudo reproducir el preview.");
    } finally {
      setCargandoPreviewId(null);
    }
  }

  async function descargarIndividual(track: TrackFila) {
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
    setProcesandoZip(true);
    setAvisoAccion(null);
    try {
      const blob = await descargarZip([...seleccion], "clubpack-seleccion");
      descargarBlob(blob, `clubpack-${seleccion.size}-tracks.zip`);
    } catch (e) {
      setAvisoAccion(e instanceof ApiError ? e.message : "No se pudo armar el ZIP.");
    } finally {
      setProcesandoZip(false);
    }
  }

  async function guardarComoPlaylist() {
    if (!session || seleccion.size === 0 || !nombrePlaylist.trim()) return;
    setGuardandoPlaylist(true);
    setAvisoAccion(null);
    try {
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
      setMostrarFormPlaylist(false);
      setNombrePlaylist("");
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

  const hayFiltrosActivos = useMemo(
    () => !!(busqueda || generoId || bpmMin || bpmMax || key),
    [busqueda, generoId, bpmMin, bpmMax, key],
  );

  const mostrarDescubrimiento = !hayFiltrosActivos && !cargando && tracks.length > 0;
  const destacados = tracks.slice(0, 5);
  const recientes = tracks.slice(0, 8);

  return (
    <div className="flex flex-col gap-8">
      {/* Banner de bienvenida */}
      <div className="relative overflow-hidden rounded-2xl px-6 sm:px-9 py-9 sm:py-11 bg-ink">
        <img
          src="/hero-light.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover opacity-50 dark:hidden"
        />
        <img
          src="/hero-dark.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover opacity-60 hidden dark:block"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(100deg, rgba(10,10,20,0.88) 0%, rgba(10,10,20,0.6) 55%, rgba(10,10,20,0.25) 100%)",
          }}
        />
        <div className="relative max-w-xl">
          <h1 className="font-display font-extrabold text-[clamp(1.6rem,3.5vw,2.4rem)] leading-[1.08] tracking-[-0.5px] m-0 text-white">
            El catálogo colaborativo de música para DJs
          </h1>
          <p className="mt-3 text-white/75 text-sm sm:text-base m-0">
            {cargando
              ? "Cargando…"
              : `Descubrí, escuchá y descargá los ${tracks.length} track${tracks.length === 1 ? "" : "s"} que compartió el grupo.`}
          </p>
        </div>

        {/* Tagline manuscrito — solo modo oscuro, como en la referencia de diseño.
            Oculto en mobile: a ese ancho se superpone con el título. */}
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
      </div>

      {/* Pills de género */}
      {generos.length > 0 && (
        <div className="flex flex-wrap gap-2 -mt-2">
          <button
            type="button"
            onClick={() => setGeneroId("")}
            className={`text-sm font-semibold px-4 py-2 rounded-full appearance-none border-none cursor-pointer transition-colors ${
              generoId === "" ? "bg-ink text-cream" : "bg-card border border-border text-body hover:border-ink"
            }`}
          >
            Todos
          </button>
          {generos.map((g, i) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setGeneroId(g.id === generoId ? "" : g.id)}
              className={`text-sm font-semibold px-4 py-2 rounded-full appearance-none cursor-pointer transition-colors ${
                generoId === g.id
                  ? "border-none bg-accent text-white"
                  : `border-none ${badgeGenero(i)}`
              }`}
            >
              {g.nombre}
            </button>
          ))}
        </div>
      )}

      {/* Filtros */}
      <div className="bg-card rounded-2xl p-5 border border-border-soft flex flex-wrap gap-4 items-end">
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
            onChange={(e) => setGeneroId(e.target.value)}
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

      {/* Temas destacados — los últimos subidos, como tarjetas */}
      {mostrarDescubrimiento && (
        <div className="flex flex-col gap-3.5">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-bold text-lg m-0">Temas destacados</h2>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-1 -mx-1 px-1">
            {destacados.map((t) => {
              const esElSonando = player.trackActual?.id === t.id;
              const mostrandoSpinner =
                cargandoPreviewId === t.id || (esElSonando && player.estado === "cargando");
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => reproducir(t)}
                  className="group relative shrink-0 w-44 text-left appearance-none bg-transparent border-none cursor-pointer p-0"
                >
                  <div className="relative w-44 h-44 rounded-2xl overflow-hidden border border-border-soft">
                    <Portada path={t.portada_url} alt="" className="w-full h-full object-cover" />
                    <span className="absolute inset-0 bg-ink/0 group-hover:bg-ink/30 transition-colors" />
                    <span className="absolute bottom-2.5 right-2.5 w-9 h-9 rounded-full bg-white text-ink-fixed flex items-center justify-center shadow">
                      {mostrandoSpinner ? (
                        <span className="text-xs">…</span>
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
          </div>
        </div>
      )}

      {/* Últimos aportes de la comunidad */}
      {mostrarDescubrimiento && (
        <div className="flex flex-col gap-3.5">
          <h2 className="font-display font-bold text-lg m-0">Últimos aportes de la comunidad</h2>
          <div className="bg-card rounded-2xl border border-border-soft overflow-hidden overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-[560px]">
              <thead>
                <tr className="text-left text-xs text-muted border-b border-border-soft">
                  <th className="font-semibold px-5 py-3">Tema</th>
                  <th className="font-semibold px-3 py-3 hidden sm:table-cell">Género</th>
                  <th className="font-semibold px-3 py-3 text-right">BPM</th>
                  <th className="font-semibold px-3 py-3 hidden md:table-cell">Subido por</th>
                  <th className="font-semibold px-5 py-3 text-right hidden sm:table-cell">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {recientes.map((t) => {
                  const iGenero = generos.findIndex((g) => g.id === t.genero_id);
                  return (
                    <tr key={t.id} className="border-b border-border-soft last:border-b-0">
                      <td className="px-5 py-3 min-w-0">
                        <div className="font-semibold truncate max-w-[220px]">{t.titulo}</div>
                        <div className="text-xs text-muted truncate max-w-[220px]">
                          {t.remixer ?? t.artista_original ?? ""}
                        </div>
                      </td>
                      <td className="px-3 py-3 hidden sm:table-cell">
                        {t.generos?.nombre ? (
                          <span
                            className={`text-xs font-semibold px-2.5 py-1 rounded-full ${badgeGenero(
                              iGenero < 0 ? 0 : iGenero,
                            )}`}
                          >
                            {t.generos.nombre}
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right text-muted">{formatearBpm(t.bpm)}</td>
                      <td className="px-3 py-3 hidden md:table-cell text-muted truncate max-w-[140px]">
                        {t.perfiles?.nombre_dj || t.perfiles?.email || "—"}
                      </td>
                      <td className="px-5 py-3 text-right text-muted hidden sm:table-cell">
                        {formatearFecha(t.fecha_subida)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Lista completa */}
      <div className="flex flex-col gap-3.5">
        {mostrarDescubrimiento && <h2 className="font-display font-bold text-lg m-0">Catálogo completo</h2>}
        <div className="bg-card rounded-2xl border border-border-soft overflow-hidden">
        {!cargando && tracks.length === 0 && (
          <div className="p-8 text-center text-muted text-sm">
            No hay tracks que coincidan con estos filtros.
          </div>
        )}

        {tracks.map((t) => {
          const seleccionado = seleccion.has(t.id);
          const esElSonando = player.trackActual?.id === t.id;
          const mostrandoSpinner =
            cargandoPreviewId === t.id || (esElSonando && player.estado === "cargando");
          const puedeEditar = t.subido_por === session?.user.id || perfil?.rol === "admin";
          const esAdmin = perfil?.rol === "admin";
          return (
            <div
              key={t.id}
              className={`flex flex-col border-b border-border-soft last:border-b-0 ${seleccionado ? "bg-cream" : ""}`}
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
                  onClick={() => reproducir(t)}
                  aria-label={esElSonando && player.estado === "sonando" ? "Pausar" : "Reproducir preview"}
                  className="shrink-0 w-9 h-9 rounded-full bg-ink text-cream flex items-center justify-center appearance-none border-none cursor-pointer"
                >
                  {mostrandoSpinner ? (
                    <span className="text-xs">…</span>
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

                <div className="hidden sm:block text-xs text-muted w-24 shrink-0">
                  {t.generos?.nombre ?? "—"}
                </div>
                <div className="hidden sm:block text-xs text-muted w-16 shrink-0 text-right">
                  {formatearBpm(t.bpm)} bpm
                </div>
                <div className="hidden sm:block text-xs text-muted w-12 shrink-0 text-center">
                  {t.key_armonica ?? "—"}
                </div>
                <div className="hidden sm:block text-xs text-muted w-12 shrink-0 text-right">
                  {formatearDuracion(t.duracion_seg)}
                </div>

                {puedeEditar && (
                  <button
                    type="button"
                    onClick={() => abrirEdicion(t)}
                    aria-label={`Editar ${t.titulo}`}
                    className="shrink-0 text-xs font-semibold px-3 py-2 rounded-lg border border-border hover:border-ink transition-colors appearance-none bg-transparent cursor-pointer"
                  >
                    Editar
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => descargarIndividual(t)}
                  disabled={descargando === t.id}
                  className="shrink-0 text-xs font-semibold px-3 py-2 rounded-lg border border-border hover:border-ink transition-colors appearance-none bg-transparent cursor-pointer disabled:opacity-50"
                >
                  {descargando === t.id ? "…" : "Bajar"}
                </button>

                {esAdmin && confirmandoBorrarId !== t.id && (
                  <button
                    type="button"
                    onClick={() => setConfirmandoBorrarId(t.id)}
                    aria-label={`Borrar ${t.titulo}`}
                    className="shrink-0 text-xs font-semibold px-3 py-2 rounded-lg border border-border hover:border-accent hover:text-accent transition-colors appearance-none bg-transparent cursor-pointer"
                  >
                    Borrar
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
          );
        })}
        </div>
      </div>

      {/* Barra de selección */}
      {seleccion.size > 0 && (
        <div className="sticky bottom-4 self-center bg-ink text-cream rounded-full px-5 py-3 flex items-center gap-4 shadow-lg">
          <span className="text-sm font-semibold">{seleccion.size} seleccionados</span>
          <button
            type="button"
            onClick={descargarSeleccionZip}
            disabled={procesandoZip}
            className="text-sm font-semibold bg-accent text-white px-4 py-2 rounded-full appearance-none border-none cursor-pointer disabled:opacity-60"
          >
            {procesandoZip ? "Armando ZIP…" : "Descargar ZIP"}
          </button>
          <button
            type="button"
            onClick={() => setMostrarFormPlaylist(true)}
            className="text-sm font-semibold bg-transparent text-cream px-2 py-2 appearance-none border-none cursor-pointer underline"
          >
            Guardar como playlist
          </button>
          <button
            type="button"
            onClick={() => setSeleccion(new Set())}
            className="text-sm text-cream/70 hover:text-cream appearance-none bg-transparent border-none cursor-pointer"
          >
            Cancelar
          </button>
        </div>
      )}

      {mostrarFormPlaylist && (
        <div className="fixed inset-0 bg-overlay flex items-center justify-center z-50 px-4">
          <div className="bg-card rounded-2xl p-6 max-w-sm w-full flex flex-col gap-4">
            <h2 className="font-display font-bold text-lg m-0">Nueva playlist</h2>
            <input
              type="text"
              autoFocus
              value={nombrePlaylist}
              onChange={(e) => setNombrePlaylist(e.target.value)}
              placeholder="Nombre de la playlist"
              className="px-3 py-2.5 rounded-lg border border-border text-sm bg-cream-soft"
            />
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
                disabled={guardandoPlaylist || !nombrePlaylist.trim()}
                className="text-sm font-semibold px-4 py-2 rounded-lg bg-accent text-white appearance-none border-none cursor-pointer disabled:opacity-60"
              >
                {guardandoPlaylist ? "Guardando…" : "Crear"}
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
    </div>
  );
}
