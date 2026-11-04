import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { descargarBlob, descargarPlaylistZip, ApiError } from "../lib/api";
import { formatearBpm, formatearFecha, mensajeErrorAmigable } from "../lib/format";
import type { Genero } from "../lib/types";
import { useAuth } from "../lib/auth";

/** Fisher-Yates — alcanza y sobra para elegir N temas al azar de la lista que matchea los filtros. */
function mezclar<T>(arr: T[]): T[] {
  const copia = [...arr];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

interface PlaylistFila {
  id: string;
  nombre: string;
  descripcion: string | null;
  creado_por: string | null;
  fecha_creacion: string;
  perfiles: { nombre_dj: string | null } | null;
}

interface TrackDePlaylist {
  id: string;
  titulo: string;
  remixer: string | null;
  bpm: number | null;
}

export default function PlaylistsPage() {
  const { session, perfil } = useAuth();

  const [playlists, setPlaylists] = useState<PlaylistFila[]>([]);
  const [tracksPorPlaylist, setTracksPorPlaylist] = useState<Record<string, TrackDePlaylist[]>>({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [descargandoId, setDescargandoId] = useState<string | null>(null);
  const [confirmandoBorrarId, setConfirmandoBorrarId] = useState<string | null>(null);
  const [borrandoId, setBorrandoId] = useState<string | null>(null);

  const [generos, setGeneros] = useState<Genero[]>([]);
  const [generoGenId, setGeneroGenId] = useState("");
  const [cantidadGen, setCantidadGen] = useState("20");
  const [bpmMinGen, setBpmMinGen] = useState("");
  const [bpmMaxGen, setBpmMaxGen] = useState("");
  const [generando, setGenerando] = useState(false);

  useEffect(() => {
    cargarPlaylists();
    (async () => {
      try {
        const { data, error } = await supabase
          .from("generos")
          .select("*")
          .eq("activo", true)
          .order("orden");
        if (!error && data) setGeneros(data);
      } catch {
        // el selector de género simplemente queda vacío si esto falla
      }
    })();
  }, []);

  async function generarPlaylist() {
    const cantidad = Number(cantidadGen);
    if (!cantidad || cantidad < 1) {
      setAviso("Poné una cantidad de temas válida.");
      return;
    }

    setGenerando(true);
    setAviso(null);
    setError(null);
    try {
      let query = supabase
        .from("tracks")
        .select("id")
        .eq("estado", "activo")
        .limit(1000);
      if (generoGenId) query = query.eq("genero_id", generoGenId);
      if (bpmMinGen) query = query.gte("bpm", Number(bpmMinGen));
      if (bpmMaxGen) query = query.lte("bpm", Number(bpmMaxGen));

      const { data: candidatos, error: errBusqueda } = await query;
      if (errBusqueda) throw errBusqueda;
      if (!candidatos || candidatos.length === 0) {
        setAviso("No hay tracks que coincidan con esos filtros.");
        return;
      }

      const elegidos = mezclar(candidatos).slice(0, cantidad);

      const nombreGenero = generos.find((g) => g.id === generoGenId)?.nombre ?? "Mix";
      let nombre = nombreGenero;
      if (bpmMinGen || bpmMaxGen) {
        nombre += ` ${bpmMinGen || "?"}-${bpmMaxGen || "?"} BPM`;
      }
      nombre += ` (${elegidos.length} temas)`;

      const { data: playlist, error: errPlaylist } = await supabase
        .from("playlists")
        .insert({
          nombre,
          descripcion: "Generada automáticamente por género/BPM.",
          creado_por: session?.user.id,
        })
        .select()
        .single();
      if (errPlaylist || !playlist) throw errPlaylist ?? new Error("No se pudo crear la playlist.");

      const filas = elegidos.map((t, i) => ({
        playlist_id: playlist.id as string,
        track_id: t.id as string,
        orden: i,
      }));
      const { error: errTracks } = await supabase.from("playlist_tracks").insert(filas);
      if (errTracks) throw errTracks;

      setAviso(
        elegidos.length < cantidad
          ? `Solo había ${elegidos.length} track(s) que coincidían — se creó "${nombre}" con esos.`
          : `Playlist "${nombre}" creada.`,
      );
      await cargarPlaylists();
    } catch (e) {
      setError(mensajeErrorAmigable(e));
    } finally {
      setGenerando(false);
    }
  }

  async function cargarPlaylists() {
    setCargando(true);
    setError(null);
    try {
      const { data: playlistsData, error: errPlaylists } = await supabase
        .from("playlists")
        .select("id, nombre, descripcion, creado_por, fecha_creacion, perfiles(nombre_dj)")
        .order("fecha_creacion", { ascending: false });
      if (errPlaylists) throw errPlaylists;

      const lista = (playlistsData ?? []) as unknown as PlaylistFila[];
      setPlaylists(lista);

      if (lista.length > 0) {
        const { data: itemsData, error: errItems } = await supabase
          .from("playlist_tracks")
          .select("playlist_id, orden, tracks(id, titulo, remixer, bpm)")
          .in(
            "playlist_id",
            lista.map((p) => p.id),
          )
          .order("orden");
        if (errItems) throw errItems;

        const agrupado: Record<string, TrackDePlaylist[]> = {};
        for (const fila of (itemsData ?? []) as unknown as {
          playlist_id: string;
          tracks: TrackDePlaylist | null;
        }[]) {
          if (!fila.tracks) continue;
          (agrupado[fila.playlist_id] ??= []).push(fila.tracks);
        }
        setTracksPorPlaylist(agrupado);
      } else {
        setTracksPorPlaylist({});
      }
    } catch (e) {
      setError(mensajeErrorAmigable(e));
    } finally {
      setCargando(false);
    }
  }

  async function handleDescargarZip(playlist: PlaylistFila) {
    setDescargandoId(playlist.id);
    setAviso(null);
    try {
      const blob = await descargarPlaylistZip(playlist.id);
      descargarBlob(blob, `${playlist.nombre}.zip`);
    } catch (e) {
      setAviso(e instanceof ApiError ? e.message : mensajeErrorAmigable(e));
    } finally {
      setDescargandoId(null);
    }
  }

  async function handleBorrar(playlist: PlaylistFila) {
    setBorrandoId(playlist.id);
    setAviso(null);
    try {
      const { error } = await supabase.from("playlists").delete().eq("id", playlist.id);
      if (error) throw error;
      setPlaylists((prev) => prev.filter((p) => p.id !== playlist.id));
    } catch (e) {
      setAviso(mensajeErrorAmigable(e));
    } finally {
      setBorrandoId(null);
      setConfirmandoBorrarId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display font-extrabold text-3xl tracking-[-0.5px] m-0">Playlists</h1>
        <p className="text-muted text-sm mt-1">
          Generalas acá por género/BPM, o armalas a mano desde el Catálogo seleccionando tracks.
          Visibles para todo el club.
        </p>
      </div>

      <div className="bg-card rounded-2xl border border-border-soft p-5 flex flex-col gap-3">
        <div>
          <h2 className="font-display font-bold text-lg m-0">Generar playlist</h2>
          <p className="text-xs text-muted mt-1 m-0">
            Elegí género y rango de BPM, y cuántos temas querés — arma una playlist al azar con lo que
            matchee (podés dejar los campos que no te importen vacíos) y queda lista para descargar.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1.5 min-w-[160px]">
            <label htmlFor="generoGen" className="text-xs font-semibold text-body">
              Género
            </label>
            <select
              id="generoGen"
              value={generoGenId}
              onChange={(e) => setGeneroGenId(e.target.value)}
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
          <div className="flex flex-col gap-1.5 w-28">
            <label htmlFor="bpmMinGen" className="text-xs font-semibold text-body">
              BPM min
            </label>
            <input
              id="bpmMinGen"
              type="number"
              value={bpmMinGen}
              onChange={(e) => setBpmMinGen(e.target.value)}
              className="px-3 py-2 rounded-lg border border-border text-sm bg-cream-soft"
            />
          </div>
          <div className="flex flex-col gap-1.5 w-28">
            <label htmlFor="bpmMaxGen" className="text-xs font-semibold text-body">
              BPM max
            </label>
            <input
              id="bpmMaxGen"
              type="number"
              value={bpmMaxGen}
              onChange={(e) => setBpmMaxGen(e.target.value)}
              className="px-3 py-2 rounded-lg border border-border text-sm bg-cream-soft"
            />
          </div>
          <div className="flex flex-col gap-1.5 w-28">
            <label htmlFor="cantidadGen" className="text-xs font-semibold text-body">
              Cantidad
            </label>
            <input
              id="cantidadGen"
              type="number"
              min={1}
              value={cantidadGen}
              onChange={(e) => setCantidadGen(e.target.value)}
              className="px-3 py-2 rounded-lg border border-border text-sm bg-cream-soft"
            />
          </div>
          <button
            type="button"
            onClick={generarPlaylist}
            disabled={generando}
            className="text-sm font-semibold bg-ink text-cream px-5 py-2.5 rounded-full appearance-none border-none cursor-pointer disabled:opacity-60"
          >
            {generando ? "Generando…" : "Generar playlist"}
          </button>
        </div>
      </div>

      {aviso && (
        <p className="text-sm bg-card border border-border-soft rounded-xl px-4 py-3 m-0">{aviso}</p>
      )}
      {error && <p className="text-sm text-accent font-medium m-0">{error}</p>}

      {cargando && <p className="text-sm text-muted m-0">Cargando…</p>}

      <div className="max-w-xl flex flex-col gap-4 w-full">
      {!cargando && !error && playlists.length === 0 && (
        <div className="bg-card rounded-2xl border border-border-soft p-8 text-center text-muted text-sm">
          Todavía no hay playlists guardadas. Armá una desde el Catálogo seleccionando tracks.
        </div>
      )}

      <div className="flex flex-col gap-4">
        {playlists.map((p) => {
          const tracks = tracksPorPlaylist[p.id] ?? [];
          const esDueno = p.creado_por === session?.user.id || perfil?.rol === "admin";
          return (
            <div key={p.id} className="bg-card rounded-2xl border border-border-soft p-5 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-display font-bold text-lg m-0">{p.nombre}</h2>
                  <p className="text-xs text-muted mt-1 m-0">
                    creada por {p.perfiles?.nombre_dj ?? "—"} · {formatearFecha(p.fecha_creacion)} ·{" "}
                    {tracks.length} track{tracks.length === 1 ? "" : "s"}
                  </p>
                </div>
              </div>

              {tracks.length > 0 && (
                <ul className="flex flex-col gap-1 m-0 pl-0 list-none text-sm">
                  {tracks.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-3 text-body">
                      <span className="truncate">
                        {t.titulo}
                        {t.remixer ? ` · ${t.remixer}` : ""}
                      </span>
                      <span className="text-xs text-muted shrink-0">{formatearBpm(t.bpm)} bpm</span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => handleDescargarZip(p)}
                  disabled={descargandoId === p.id || tracks.length === 0}
                  className="text-sm font-semibold bg-ink text-cream px-4 py-2 rounded-full appearance-none border-none cursor-pointer disabled:opacity-50"
                >
                  {descargandoId === p.id ? "Armando ZIP…" : "Descargar ZIP completo"}
                </button>

                {esDueno && confirmandoBorrarId !== p.id && (
                  <button
                    type="button"
                    onClick={() => setConfirmandoBorrarId(p.id)}
                    className="text-sm font-semibold text-muted hover:text-accent appearance-none bg-transparent border-none cursor-pointer"
                  >
                    Borrar
                  </button>
                )}

                {esDueno && confirmandoBorrarId === p.id && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted">¿Borrar esta playlist?</span>
                    <button
                      type="button"
                      onClick={() => handleBorrar(p)}
                      disabled={borrandoId === p.id}
                      className="text-sm font-semibold text-accent appearance-none bg-transparent border-none cursor-pointer disabled:opacity-50"
                    >
                      {borrandoId === p.id ? "Borrando…" : "Confirmar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmandoBorrarId(null)}
                      disabled={borrandoId === p.id}
                      className="text-sm text-muted hover:text-ink appearance-none bg-transparent border-none cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
}
