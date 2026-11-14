import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { mensajeErrorAmigable } from "../lib/format";
import { SELECT_TRACK_RESUMEN, type TrackResumen } from "../lib/tracks";
import { useAccionesLista } from "../lib/escucha";
import ListaTracks from "../components/ListaTracks";
import AvisoSuscripcionModal from "../components/AvisoSuscripcionModal";

/*
 * Ranking de corazones: solo los temas con 1+ favorito, de mayor a menor.
 * Los conteos salen de obtener_metricas_tracks() (agregado, sin quién ni
 * cuándo — ver sql/015_favoritos_y_metricas.sql); los datos de cada tema
 * se piden después por id, por RLS normal.
 */
export default function FavoritosPage() {
  const [tracks, setTracks] = useState<TrackResumen[]>([]);
  const [cargandoTracks, setCargandoTracks] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { acciones, escucha, favoritos } = useAccionesLista(tracks);
  const cargando = !favoritos.cargado || cargandoTracks;

  // Ids con 1+ corazón según las métricas ya cargadas, ordenados de mayor
  // a menor. Es la fuente de verdad del orden: si alguien marca/desmarca
  // acá mismo, la lista se reacomoda sola.
  const idsOrdenados = useMemo(
    () =>
      Object.entries(favoritos.metricas)
        .filter(([, m]) => m.favoritos > 0)
        .sort((a, b) => b[1].favoritos - a[1].favoritos)
        .map(([id]) => id),
    [favoritos.metricas],
  );

  useEffect(() => {
    const faltan = idsOrdenados.filter((id) => !tracks.some((t) => t.id === id));
    if (faltan.length === 0) return;
    (async () => {
      setCargandoTracks(true);
      setError(null);
      try {
        // En tandas: una URL con cientos de ids se pasa de largo.
        const nuevos: TrackResumen[] = [];
        for (let i = 0; i < faltan.length; i += 100) {
          const { data, error } = await supabase
            .from("tracks")
            .select(SELECT_TRACK_RESUMEN)
            .eq("estado", "activo")
            .in("id", faltan.slice(i, i + 100));
          if (error) throw error;
          nuevos.push(...((data ?? []) as unknown as TrackResumen[]));
        }
        setTracks((prev) => [...prev, ...nuevos]);
      } catch (e) {
        setError(mensajeErrorAmigable(e));
      } finally {
        setCargandoTracks(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsOrdenados]);

  const lista = useMemo(() => {
    const porId = new Map(tracks.map((t) => [t.id, t]));
    return idsOrdenados.map((id) => porId.get(id)).filter((t): t is TrackResumen => !!t);
  }, [idsOrdenados, tracks]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display font-extrabold text-3xl tracking-[-0.5px] m-0">Favoritos</h1>
        <p className="text-muted text-sm mt-1 m-0">
          Los temas con más corazones de todo el grupo. Marcá los tuyos con el ♥ en cualquier lista.
        </p>
      </div>

      {escucha.avisoAccion && (
        <p className="text-sm bg-card border border-border-soft rounded-xl px-4 py-3 m-0">{escucha.avisoAccion}</p>
      )}
      {error && <p className="text-sm text-accent font-medium m-0">{error}</p>}
      {cargando && <p className="text-sm text-muted m-0">Cargando…</p>}

      {!cargando && (
        <ListaTracks
          tracks={lista}
          acciones={acciones}
          extra={(_t, i) => <span className="font-bold text-muted w-6 inline-block text-right">#{i + 1}</span>}
          vacio="Todavía nadie marcó un favorito. ¡Sé el primero: tocá el ♥ de un tema!"
        />
      )}

      <AvisoSuscripcionModal mensaje={escucha.avisoSuscripcion} onCerrar={() => escucha.setAvisoSuscripcion(null)} />
    </div>
  );
}
