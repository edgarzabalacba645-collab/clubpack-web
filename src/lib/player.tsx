import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import WaveSurfer from "wavesurfer.js";

/**
 * Datos livianos de un track para la cola de reproducción continua —
 * sin URL: la URL firmada de cada uno se pide recién cuando le toca el
 * turno (vencen rápido, no tiene sentido pedirlas todas de una).
 */
export interface TrackCola {
  id: string;
  titulo: string;
  artista_original: string | null;
  remixer: string | null;
  duracion_seg: number | null;
}

export interface TrackReproduccion extends TrackCola {
  url: string;
}

export type EstadoReproduccion = "cargando" | "sonando" | "pausado";

interface ReproducirOpciones {
  /** Lista ordenada de la que forma parte este track (p.ej. el catálogo
   * filtrado tal cual se ve en pantalla en ese momento) — define qué
   * sigue cuando está activa la reproducción continua. Si no se pasa,
   * sigue valiendo la cola que ya hubiera. */
  cola?: TrackCola[];
  /** Cómo conseguir la URL firmada de cualquier track de la cola, dado
   * su id — el reproductor la necesita para avanzar solo al siguiente
   * tema sin que la pantalla que lo inició sea quien lo pida. */
  resolverUrl?: (id: string) => Promise<string>;
}

interface PlayerContextValue {
  trackActual: TrackReproduccion | null;
  estado: EstadoReproduccion;
  error: string | null;
  /** Reproducción continua: al terminar un tema, sigue con el próximo
   * de la cola (la lista filtrada desde la que se arrancó) en vez de
   * parar. Se puede prender/apagar en cualquier momento. */
  modoContinuo: boolean;
  toggleModoContinuo: () => void;
  /** Ref callback para el <div> donde wavesurfer dibuja la onda — lo usa la barra del reproductor (ver AppShell). */
  contenedorRef: (el: HTMLDivElement | null) => void;
  reproducir: (track: TrackReproduccion, opciones?: ReproducirOpciones) => void;
  togglePlay: () => void;
  cerrar: () => void;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

/**
 * Reproductor global de previews.
 *
 * Antes el <audio> (vía wavesurfer.js) lo creaba y destruía CatalogoPage
 * directamente, montado adentro de la fila del track activo. Eso significa
 * que al navegar a otra pantalla (por ejemplo a "Subir Temas" para seguir
 * cargando temas mientras se escucha algo), React desmonta CatalogoPage y
 * con él el reproductor — el tema se corta.
 *
 * Este contexto vive por encima de las rutas (se monta una sola vez en
 * App.tsx, envolviendo AppShell) para que un tema sonando sobreviva a la
 * navegación entre pantallas: cualquier página solo le pide "reproducí
 * este track" y el audio en sí sigue sonando en la barra fija de abajo,
 * sin importar a qué pantalla se navegue después.
 */
export function PlayerProvider({ children }: { children: ReactNode }) {
  const [trackActual, setTrackActual] = useState<TrackReproduccion | null>(null);
  const [estado, setEstado] = useState<EstadoReproduccion>("pausado");
  const [error, setError] = useState<string | null>(null);
  const [modoContinuo, setModoContinuo] = useState(false);
  const wsRef = useRef<WaveSurfer | null>(null);
  const contenedorElRef = useRef<HTMLDivElement | null>(null);
  // Cola + resolver de URL: quedan en refs (no state) porque cambiarlos
  // nunca debería disparar un re-render por sí solo, solo importan en el
  // momento de avanzar al siguiente tema.
  const colaRef = useRef<TrackCola[]>([]);
  const resolverUrlRef = useRef<((id: string) => Promise<string>) | null>(null);
  const modoContinuoRef = useRef(modoContinuo);
  modoContinuoRef.current = modoContinuo;

  // Busca el siguiente track de la cola después de `actualId` y, si hay
  // uno y tenemos cómo pedir su URL, pasa a reproducirlo — si no, se
  // comporta como el final de siempre (para la reproducción).
  const avanzarSiguiente = useCallback(async (actualId: string) => {
    const cola = colaRef.current;
    const idx = cola.findIndex((t) => t.id === actualId);
    const siguiente = idx >= 0 ? cola[idx + 1] : undefined;
    const resolver = resolverUrlRef.current;
    if (!siguiente || !resolver) {
      setTrackActual(null);
      return;
    }
    try {
      setEstado("cargando");
      const url = await resolver(siguiente.id);
      setTrackActual({ ...siguiente, url });
    } catch {
      setError("No se pudo reproducir el siguiente tema.");
      setTrackActual(null);
    }
  }, []);

  useEffect(() => {
    if (!trackActual || !contenedorElRef.current) return;
    setEstado("cargando");
    setError(null);

    const ws = WaveSurfer.create({
      container: contenedorElRef.current,
      height: 36,
      waveColor: "#c7c3b8",
      progressColor: "#ff3366",
      cursorColor: "#0a0a0c",
      cursorWidth: 1,
      barWidth: 2,
      barGap: 1,
      barRadius: 1,
      normalize: true,
      url: trackActual.url,
    });
    wsRef.current = ws;

    ws.on("ready", () => ws.play());
    ws.on("play", () => setEstado("sonando"));
    ws.on("pause", () => setEstado("pausado"));
    ws.on("finish", () => {
      if (modoContinuoRef.current) {
        void avanzarSiguiente(trackActual.id);
      } else {
        setTrackActual(null);
      }
    });
    ws.on("error", (err) => {
      // Lo más común acá es que falte CORS en el bucket de R2: a
      // diferencia de un <audio src> simple, wavesurfer necesita poder
      // DESCARGAR y decodificar el audio en el navegador para dibujar
      // la onda, no solo reproducirlo.
      console.error("wavesurfer error:", err);
      setError("No se pudo reproducir (probablemente falta CORS en el bucket de R2).");
      setTrackActual(null);
    });

    return () => {
      ws.destroy();
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackActual?.id, trackActual?.url]);

  const contenedorRef = useCallback((el: HTMLDivElement | null) => {
    contenedorElRef.current = el;
  }, []);

  const reproducir = useCallback((track: TrackReproduccion, opciones?: ReproducirOpciones) => {
    if (opciones?.cola) colaRef.current = opciones.cola;
    if (opciones?.resolverUrl) resolverUrlRef.current = opciones.resolverUrl;
    setTrackActual((actual) => {
      if (actual?.id === track.id) {
        // Ya es el track activo — togglear en vez de recrear el waveform.
        wsRef.current?.playPause();
        return actual;
      }
      return track;
    });
  }, []);

  const togglePlay = useCallback(() => {
    wsRef.current?.playPause();
  }, []);

  const cerrar = useCallback(() => {
    setTrackActual(null);
  }, []);

  const toggleModoContinuo = useCallback(() => {
    setModoContinuo((v) => !v);
  }, []);

  return (
    <PlayerContext.Provider
      value={{
        trackActual,
        estado,
        error,
        modoContinuo,
        toggleModoContinuo,
        contenedorRef,
        reproducir,
        togglePlay,
        cerrar,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer debe usarse dentro de <PlayerProvider>");
  return ctx;
}
