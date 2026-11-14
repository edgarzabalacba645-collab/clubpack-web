import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { abrirDescargaDirecta, ApiError, obtenerUrlDescarga } from "./api";
import { tieneAccesoActivo, useAuth } from "./auth";
import { usePlayer, type TrackCola } from "./player";
import { useFavoritos } from "./favoritos";
import type { AccionesFila } from "../components/ListaTracks";

/** Lo mínimo que necesita saber el reproductor de un tema. */
export type TrackEscuchable = TrackCola;

export const MENSAJE_ESCUCHA_SIN_ACCESO =
  "Para escuchar este tema necesitás una suscripción activa. Mientras tanto, podés escuchar gratis los últimos 10 temas de Cachengue.";
export const MENSAJE_DESCARGA_SIN_ACCESO = "Para descargar necesitás una suscripción activa.";

/**
 * Reproducir / bajar un tema desde cualquier página (Favoritos, Novedades,
 * Descargas…) con las mismas reglas que el catálogo: sin acceso activo
 * solo se escucha la muestra gratis de Cachengue y no se baja nada; en
 * esos casos se abre el modal de suscripción en vez de pegarle al backend
 * para recibir el 403. (CatalogoPage conserva su propia versión de esto,
 * integrada con sus filtros — es el mismo criterio.)
 */
export function useEscucha() {
  const { perfil } = useAuth();
  const player = usePlayer();
  const [muestraGratisIds, setMuestraGratisIds] = useState<Set<string>>(new Set());
  const [cargandoId, setCargandoId] = useState<string | null>(null);
  const [descargandoId, setDescargandoId] = useState<string | null>(null);
  const [avisoSuscripcion, setAvisoSuscripcion] = useState<string | null>(null);
  const [avisoAccion, setAvisoAccion] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.rpc("obtener_muestra_gratis_cachengue");
        if (!error && data) {
          setMuestraGratisIds(new Set((data as { track_id: string }[]).map((f) => f.track_id)));
        }
      } catch {
        // sin muestra, nadie sin suscripción escucha nada — no rompe nada
      }
    })();
  }, []);

  const puedeEscuchar = useCallback(
    (trackId: string) => tieneAccesoActivo(perfil) || muestraGratisIds.has(trackId),
    [perfil, muestraGratisIds],
  );

  const reproducir = useCallback(
    async (track: TrackEscuchable, cola: TrackEscuchable[], filaEl?: HTMLElement | null) => {
      filaEl?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      if (player.trackActual?.id === track.id) {
        player.togglePlay();
        return;
      }
      if (!puedeEscuchar(track.id)) {
        setAvisoSuscripcion(MENSAJE_ESCUCHA_SIN_ACCESO);
        return;
      }
      setAvisoAccion(null);
      setCargandoId(track.id);
      try {
        const { url, duracion_seg, peaks } = await obtenerUrlDescarga(track.id, false);
        player.reproducir(
          { ...track, duracion_seg: duracion_seg ?? track.duracion_seg, url, peaks },
          {
            cola: tieneAccesoActivo(perfil) ? cola : cola.filter((t) => muestraGratisIds.has(t.id)),
            resolverUrl: async (id) => {
              const r = await obtenerUrlDescarga(id, false);
              return { url: r.url, duracion_seg: r.duracion_seg, peaks: r.peaks };
            },
          },
        );
      } catch (e) {
        setAvisoAccion(e instanceof ApiError ? e.message : "No se pudo reproducir el preview.");
      } finally {
        setCargandoId(null);
      }
    },
    [player, perfil, puedeEscuchar, muestraGratisIds],
  );

  const descargar = useCallback(
    async (track: TrackEscuchable) => {
      if (!tieneAccesoActivo(perfil)) {
        setAvisoSuscripcion(MENSAJE_DESCARGA_SIN_ACCESO);
        return;
      }
      setDescargandoId(track.id);
      setAvisoAccion(null);
      try {
        const { url } = await obtenerUrlDescarga(track.id, true);
        abrirDescargaDirecta(url);
      } catch (e) {
        setAvisoAccion(e instanceof ApiError ? e.message : "No se pudo descargar.");
      } finally {
        setDescargandoId(null);
      }
    },
    [perfil],
  );

  return {
    player,
    puedeEscuchar,
    reproducir,
    descargar,
    cargandoId,
    descargandoId,
    avisoSuscripcion,
    setAvisoSuscripcion,
    avisoAccion,
    setAvisoAccion,
  };
}

/**
 * Arma el paquete de acciones que espera <ListaTracks> (reproducir,
 * bajar, corazón) a partir de useEscucha + useFavoritos — para no repetir
 * el mismo pegamento en Favoritos, Novedades y Descargas. `cola` es la
 * lista que sigue sonando en reproducción continua (normalmente la misma
 * que se muestra).
 */
export function useAccionesLista(cola: TrackEscuchable[]) {
  const escucha = useEscucha();
  const favoritos = useFavoritos();
  const { player } = escucha;

  const acciones: AccionesFila = {
    puedeEscuchar: escucha.puedeEscuchar,
    estaSonando: (id) => player.trackActual?.id === id && player.estado === "sonando",
    estaCargando: (id) =>
      escucha.cargandoId === id || (player.trackActual?.id === id && player.estado === "cargando"),
    onReproducir: (track, filaEl) => void escucha.reproducir(track, cola, filaEl),
    onDescargar: (track) => void escucha.descargar(track),
    descargandoId: escucha.descargandoId,
    esFavorito: favoritos.esFavorito,
    conteoFavoritos: (id) => favoritos.metricasDe(id).favoritos,
    onToggleFavorito: (id) => void favoritos.toggleFavorito(id),
  };

  return { acciones, escucha, favoritos };
}
