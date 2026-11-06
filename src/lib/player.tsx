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

export interface TrackReproduccion {
  id: string;
  titulo: string;
  remixer: string | null;
  url: string;
}

export type EstadoReproduccion = "cargando" | "sonando" | "pausado";

interface PlayerContextValue {
  trackActual: TrackReproduccion | null;
  estado: EstadoReproduccion;
  error: string | null;
  /** Ref callback para el <div> donde wavesurfer dibuja la onda — lo usa la barra del reproductor (ver AppShell). */
  contenedorRef: (el: HTMLDivElement | null) => void;
  reproducir: (track: TrackReproduccion) => void;
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
  const wsRef = useRef<WaveSurfer | null>(null);
  const contenedorElRef = useRef<HTMLDivElement | null>(null);

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
    ws.on("finish", () => setTrackActual(null));
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

  const reproducir = useCallback((track: TrackReproduccion) => {
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

  return (
    <PlayerContext.Provider
      value={{ trackActual, estado, error, contenedorRef, reproducir, togglePlay, cerrar }}
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
