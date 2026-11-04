import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  abrirDescargaDirecta,
  ApiError,
  descargarBlob,
  descargarZip,
  obtenerUrlDescarga,
} from "../lib/api";
import { CAMELOT_KEYS, formatearBpm, formatearDuracion, mensajeErrorAmigable } from "../lib/format";
import type { Genero, PlaylistInsert, PlaylistTrackInsert } from "../lib/types";
import { useAuth } from "../lib/auth";
import WaveformPlayer, { type WaveformPlayerHandle } from "../components/WaveformPlayer";

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
}

type EstadoPreview = "idle" | "cargando" | "sonando" | "pausado";

export default function CatalogoPage() {
  const { session, perfil } = useAuth();
  const [tracks, setTracks] = useState<TrackFila[]>([]);
  const [generos, setGeneros] = useState<Genero[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [busqueda, setBusqueda] = useState("");
  const [generoId, setGeneroId] = useState("");
  const [bpmMin, setBpmMin] = useState("");
  const [bpmMax, setBpmMax] = useState("");
  const [key, setKey] = useState("");

  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [trackSonando, setTrackSonando] = useState<string | null>(null);
  const [urlSonando, setUrlSonando] = useState<string | null>(null);
  const [estadoPreview, setEstadoPreview] = useState<EstadoPreview>("idle");
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

  const waveformRef = useRef<WaveformPlayerHandle | null>(null);

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
          "id, titulo, artista_original, remixer, bpm, key_armonica, duracion_seg, genero_id, generos(nombre), subido_por, tags",
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
    if (trackSonando === track.id) {
      // ya está activo este track (sonando o en pausa) — solo togglear
      waveformRef.current?.togglePlay();
      return;
    }

    setAvisoAccion(null);
    setEstadoPreview("cargando");
    setTrackSonando(track.id);
    setUrlSonando(null); // desmonta el waveform anterior mientras carga la URL del nuevo
    try {
      const { url } = await obtenerUrlDescarga(track.id, false);
      setUrlSonando(url);
    } catch (e) {
      setAvisoAccion(e instanceof ApiError ? e.message : "No se pudo reproducir el preview.");
      setEstadoPreview("idle");
      setTrackSonando(null);
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

  const hayFiltrosActivos = useMemo(
    () => !!(busqueda || generoId || bpmMin || bpmMax || key),
    [busqueda, generoId, bpmMin, bpmMax, key],
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display font-extrabold text-3xl tracking-[-0.5px] m-0">Catálogo</h1>
        <p className="text-muted text-sm mt-1">
          {cargando ? "Cargando…" : `${tracks.length} track${tracks.length === 1 ? "" : "s"}`}
        </p>
      </div>

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

      {/* Lista */}
      <div className="bg-card rounded-2xl border border-border-soft overflow-hidden">
        {!cargando && tracks.length === 0 && (
          <div className="p-8 text-center text-muted text-sm">
            No hay tracks que coincidan con estos filtros.
          </div>
        )}

        {tracks.map((t) => {
          const seleccionado = seleccion.has(t.id);
          const esElSonando = trackSonando === t.id;
          const puedeEditar = t.subido_por === session?.user.id || perfil?.rol === "admin";
          return (
            <div
              key={t.id}
              className={`flex flex-col border-b border-border-soft last:border-b-0 ${seleccionado ? "bg-cream" : ""}`}
            >
              <div className="flex items-center gap-4 px-5 py-3.5">
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
                  aria-label={esElSonando && estadoPreview === "sonando" ? "Pausar" : "Reproducir preview"}
                  className="shrink-0 w-9 h-9 rounded-full bg-ink text-cream flex items-center justify-center appearance-none border-none cursor-pointer"
                >
                  {esElSonando && estadoPreview === "cargando" ? (
                    <span className="text-xs">…</span>
                  ) : esElSonando && estadoPreview === "sonando" ? (
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

                <div className="min-w-0 flex-1">
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
              </div>

              {esElSonando && (
                <div className="px-5 pb-3.5 -mt-1 pl-[4.75rem] pr-5">
                  {urlSonando ? (
                    <WaveformPlayer
                      ref={waveformRef}
                      url={urlSonando}
                      onEstado={setEstadoPreview}
                      onFinish={() => {
                        setEstadoPreview("idle");
                        setTrackSonando(null);
                        setUrlSonando(null);
                      }}
                      onError={(mensaje) => {
                        setAvisoAccion(mensaje);
                        setEstadoPreview("idle");
                        setTrackSonando(null);
                        setUrlSonando(null);
                      }}
                    />
                  ) : (
                    <p className="text-xs text-muted m-0">Cargando preview…</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
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
        <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50 px-4">
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
        <div className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50 px-4">
          <div className="bg-card rounded-2xl p-6 max-w-lg w-full flex flex-col gap-4">
            <h2 className="font-display font-bold text-lg m-0">Editar track</h2>

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
