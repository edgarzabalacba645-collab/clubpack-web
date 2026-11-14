import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { useAuth } from "./auth";

/** Métricas agregadas de un track — ver obtener_metricas_tracks() en
 *  sql/015_favoritos_y_metricas.sql. Un track que no figura es 0 en todo. */
export interface MetricasTrack {
  descargas: number;
  reproducciones: number;
  favoritos: number;
}

const SIN_METRICAS: MetricasTrack = { descargas: 0, reproducciones: 0, favoritos: 0 };

/**
 * Corazones + contadores por track, compartido por el catálogo, Favoritos,
 * Novedades, etc.:
 *  - `metricas` sale de una sola llamada agregada (descargas,
 *    reproducciones y favoritos por track — nunca quién ni cuándo).
 *  - `misFavoritos` son las filas propias de la tabla favoritos (lo único
 *    que RLS deja ver de esa tabla), para pintar el corazón lleno.
 *  - `toggleFavorito` marca/desmarca con actualización optimista del
 *    corazón y del contador; si falla, vuelve atrás.
 */
export function useFavoritos() {
  const { session } = useAuth();
  const [metricas, setMetricas] = useState<Record<string, MetricasTrack>>({});
  const [misFavoritos, setMisFavoritos] = useState<Set<string>>(new Set());
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);
  // true después de la primera carga (haya andado o no) — para que las
  // páginas que dependen de las métricas no muestren "vacío" antes de tiempo.
  const [cargado, setCargado] = useState(false);

  const recargar = useCallback(async () => {
    try {
      const [{ data: m }, { data: f }] = await Promise.all([
        supabase.rpc("obtener_metricas_tracks"),
        supabase.from("favoritos").select("track_id"),
      ]);
      if (m) {
        const mapa: Record<string, MetricasTrack> = {};
        for (const fila of m as (MetricasTrack & { track_id: string })[]) {
          mapa[fila.track_id] = {
            descargas: Number(fila.descargas),
            reproducciones: Number(fila.reproducciones),
            favoritos: Number(fila.favoritos),
          };
        }
        setMetricas(mapa);
      }
      if (f) setMisFavoritos(new Set((f as { track_id: string }[]).map((x) => x.track_id)));
    } catch {
      // Los contadores simplemente no se muestran si esto falla — nunca
      // debe tirar abajo la página.
    } finally {
      setCargado(true);
    }
  }, []);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  const metricasDe = useCallback((trackId: string) => metricas[trackId] ?? SIN_METRICAS, [metricas]);
  const esFavorito = useCallback((trackId: string) => misFavoritos.has(trackId), [misFavoritos]);

  const toggleFavorito = useCallback(
    async (trackId: string) => {
      const usuarioId = session?.user.id;
      if (!usuarioId || ocupadoId === trackId) return;
      const eraFavorito = misFavoritos.has(trackId);
      const delta = eraFavorito ? -1 : 1;

      // Optimista: se pinta ya, se confirma (o revierte) después.
      setMisFavoritos((prev) => {
        const next = new Set(prev);
        if (eraFavorito) next.delete(trackId);
        else next.add(trackId);
        return next;
      });
      setMetricas((prev) => ({
        ...prev,
        [trackId]: { ...(prev[trackId] ?? SIN_METRICAS), favoritos: Math.max(0, (prev[trackId]?.favoritos ?? 0) + delta) },
      }));

      setOcupadoId(trackId);
      try {
        const { error } = eraFavorito
          ? await supabase.from("favoritos").delete().eq("track_id", trackId).eq("usuario_id", usuarioId)
          : await supabase.from("favoritos").insert({ usuario_id: usuarioId, track_id: trackId });
        if (error) throw error;
      } catch {
        // Revertir
        setMisFavoritos((prev) => {
          const next = new Set(prev);
          if (eraFavorito) next.add(trackId);
          else next.delete(trackId);
          return next;
        });
        setMetricas((prev) => ({
          ...prev,
          [trackId]: { ...(prev[trackId] ?? SIN_METRICAS), favoritos: Math.max(0, (prev[trackId]?.favoritos ?? 0) - delta) },
        }));
      } finally {
        setOcupadoId(null);
      }
    },
    [session?.user.id, misFavoritos, ocupadoId],
  );

  return { metricas, metricasDe, esFavorito, toggleFavorito, recargar, ocupadoId, cargado };
}
