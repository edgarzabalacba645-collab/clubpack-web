import { useState } from "react";
import { supabase } from "./supabase";
import { useAuth, tieneAccesoActivo, MENSAJE_SIN_ACCESO_ACTIVO } from "./auth";
import { mensajeErrorAmigable } from "./format";

/**
 * Mismo flujo "sumar a una playlist existente o crear una nueva" que ya
 * tenía CatalogoPage (ver guardarComoPlaylist ahí) pero reutilizable desde
 * cualquier lado — la cola del reproductor (AppShell) y el menú
 * contextual de cualquier fila de track (MenuContextualTrack). No se tocó
 * la versión de CatalogoPage para no arriesgar esa pantalla: esto es una
 * segunda implementación a propósito, pensada para los lugares nuevos.
 */
export function useGuardarPlaylist() {
  const { session, perfil } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const [trackIds, setTrackIds] = useState<string[]>([]);
  const [nombrePlaylist, setNombrePlaylist] = useState("");
  const [playlistDestino, setPlaylistDestino] = useState("");
  const [playlistsPropias, setPlaylistsPropias] = useState<{ id: string; nombre: string }[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  /** `soloNueva`: arranca derecho en el campo de nombre (para "Crear
   * playlist desde este tema"), sin mostrar el selector de playlists
   * existentes — igual se puede tocar "Sumar a..." si cambia de idea,
   * salvo que no haya ninguna propia todavía. */
  async function abrir(ids: string[], nombreSugerido = "") {
    if (!tieneAccesoActivo(perfil)) {
      setAviso(MENSAJE_SIN_ACCESO_ACTIVO);
      return;
    }
    setTrackIds(ids);
    setNombrePlaylist(nombreSugerido);
    setPlaylistDestino("");
    setError(null);
    setAviso(null);
    setAbierto(true);
    try {
      const { data, error: errLista } = await supabase.from("playlists").select("id, nombre").order("nombre");
      if (!errLista && data) setPlaylistsPropias(data as { id: string; nombre: string }[]);
    } catch {
      // el selector de "sumar a..." queda vacío (solo "Nueva playlist") si esto falla
    }
  }

  function cerrar() {
    setAbierto(false);
  }

  async function guardar() {
    if (!playlistDestino && !nombrePlaylist.trim()) return;
    if (!tieneAccesoActivo(perfil)) {
      setAviso(MENSAJE_SIN_ACCESO_ACTIVO);
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      if (playlistDestino) {
        const nombreDestino = playlistsPropias.find((p) => p.id === playlistDestino)?.nombre ?? "la playlist";
        // El primary key es (playlist_id, track_id) — si alguno ya estaba
        // en esta playlist, insertarlo de nuevo rompería el insert entero.
        const { data: existentes } = await supabase
          .from("playlist_tracks")
          .select("track_id, orden")
          .eq("playlist_id", playlistDestino);
        const yaEstaban = new Set((existentes ?? []).map((f) => f.track_id as string));
        const ordenBase =
          (existentes ?? []).reduce((max, f) => Math.max(max, f.orden as number), -1) + 1;
        const nuevos = trackIds.filter((id) => !yaEstaban.has(id));
        if (nuevos.length === 0) {
          setAviso(`Ya estaba${trackIds.length > 1 ? "n" : ""} en "${nombreDestino}".`);
        } else {
          const filas = nuevos.map((trackId, i) => ({
            playlist_id: playlistDestino,
            track_id: trackId,
            orden: ordenBase + i,
          }));
          const { error: errTracks } = await supabase.from("playlist_tracks").insert(filas);
          if (errTracks) throw errTracks;
          setAviso(`Sumado${nuevos.length > 1 ? "s" : ""} a "${nombreDestino}".`);
        }
      } else {
        const { data: playlist, error: errPlaylist } = await supabase
          .from("playlists")
          .insert({ nombre: nombrePlaylist.trim(), creado_por: session?.user.id })
          .select()
          .single();
        if (errPlaylist || !playlist) throw errPlaylist ?? new Error("No se pudo crear la playlist.");

        const filas = trackIds.map((trackId, i) => ({
          playlist_id: playlist.id as string,
          track_id: trackId,
          orden: i,
        }));
        const { error: errTracks } = await supabase.from("playlist_tracks").insert(filas);
        if (errTracks) throw errTracks;
        setAviso(`Playlist "${playlist.nombre}" creada.`);
      }
      setAbierto(false);
    } catch (e) {
      setError(mensajeErrorAmigable(e));
    } finally {
      setGuardando(false);
    }
  }

  return {
    abierto,
    abrir,
    cerrar,
    trackIds,
    nombrePlaylist,
    setNombrePlaylist,
    playlistDestino,
    setPlaylistDestino,
    playlistsPropias,
    guardando,
    error,
    aviso,
    setAviso,
    guardar,
  };
}

export type EstadoGuardarPlaylist = ReturnType<typeof useGuardarPlaylist>;

/** Modal en sí — separado del hook para poder montarlo solo donde hace
 * falta (cada MenuContextualTrack y la barra del reproductor tienen el
 * suyo, cada uno con su propio estado: no hace falta un solo modal
 * global). Mismo look que el de CatalogoPage. */
export function ModalGuardarPlaylist({ estado }: { estado: EstadoGuardarPlaylist }) {
  if (!estado.abierto) return null;
  const {
    trackIds,
    nombrePlaylist,
    setNombrePlaylist,
    playlistDestino,
    setPlaylistDestino,
    playlistsPropias,
    guardando,
    error,
    cerrar,
    guardar,
  } = estado;

  return (
    <div className="fixed inset-0 bg-overlay flex items-center justify-center z-50 px-4" onClick={cerrar}>
      <div
        className="bg-card rounded-2xl p-6 max-w-sm w-full flex flex-col gap-4 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display font-bold text-lg m-0">
          {playlistDestino ? "Sumar a playlist" : "Nueva playlist"}
        </h2>
        <p className="text-xs text-muted -mt-2 m-0">
          {trackIds.length === 1 ? "1 track" : `${trackIds.length} tracks`}
        </p>

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

        {error && <p className="text-sm text-accent font-medium m-0">{error}</p>}

        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={cerrar}
            className="text-sm font-semibold px-4 py-2 rounded-lg appearance-none bg-transparent border-none cursor-pointer text-muted"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void guardar()}
            disabled={guardando || (!playlistDestino && !nombrePlaylist.trim())}
            className="text-sm font-semibold px-4 py-2 rounded-lg bg-accent text-white appearance-none border-none cursor-pointer disabled:opacity-60"
          >
            {guardando ? "Guardando…" : playlistDestino ? "Agregar" : "Crear"}
          </button>
        </div>
      </div>
    </div>
  );
}
