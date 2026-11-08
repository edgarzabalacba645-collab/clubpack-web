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
  // El id del track actual, en un ref aparte: lo necesita el handler de
  // "finish" (ver más abajo, se registra UNA sola vez y si leyera
  // trackActual directamente quedaría con el valor del primer tema para
  // siempre — closure obsoleta).
  const trackActualIdRef = useRef<string | null>(null);
  trackActualIdRef.current = trackActual?.id ?? null;

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

    // Reproducción continua en el celular: antes cada tema destruía la
    // instancia de wavesurfer y creaba una nueva — eso crea un <audio> del
    // DOM distinto por cada tema. iOS Safari (y Chrome en Android, más
    // flexible pero no siempre) solo permite reproducir SIN que el usuario
    // vuelva a tocar la pantalla cuando es el MISMO elemento <audio> que ya
    // arrancó una vez con un toque real — uno nuevo necesita su propio
    // toque. Como el "finish" del tema anterior dispara el play() del
    // siguiente por código (no por un tap), ese <audio> nuevo quedaba
    // bloqueado y la cola se cortaba en el celular, aunque en la compu
    // anduviera bien. Por eso ahora se crea la instancia una sola vez (al
    // arrancar el primer tema de una sesión de escucha) y los temas
    // siguientes se cargan con ws.load(), reutilizando el mismo <audio> —
    // una vez destrabado por el primer toque, se queda destrabado.
    let ws = wsRef.current;
    if (!ws) {
      ws = WaveSurfer.create({
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
      });
      wsRef.current = ws;

      ws.on("ready", () => {
        // Por si el navegador igual lo bloquea en algún caso raro (pestaña
        // en segundo plano, modo ahorro de datos, etc.) — así no se queda
        // colgado en "cargando" para siempre sin avisar nada.
        ws?.play().catch(() => {
          setError("El navegador bloqueó la reproducción automática — tocá play para seguir.");
          setEstado("pausado");
        });
      });
      ws.on("play", () => setEstado("sonando"));
      ws.on("pause", () => setEstado("pausado"));
      ws.on("finish", () => {
        const actualId = trackActualIdRef.current;
        if (modoContinuoRef.current && actualId) {
          void avanzarSiguiente(actualId);
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
    }

    ws.load(trackActual.url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackActual?.id, trackActual?.url]);

  // Se destruye la instancia recién cuando la barra del reproductor
  // desaparece de verdad (se cerró o terminó la cola sin continuar) — no en
  // cada cambio de tema, que es justo lo que había que dejar de hacer (ver
  // el comentario de arriba). La próxima vez que arranque algo, el
  // contenedor vuelve a existir recién por un toque real, así que una
  // instancia nueva en ese momento no tiene el problema.
  const contenedorRef = useCallback((el: HTMLDivElement | null) => {
    contenedorElRef.current = el;
    if (!el && wsRef.current) {
      wsRef.current.destroy();
      wsRef.current = null;
    }
  }, []);

  // Media Session: sin esto, el navegador no tiene forma de saber que esta
  // pestaña está reproduciendo audio "de verdad" cuando la pantalla está
  // bloqueada o el celular pasó a otra app — y en ese estado, Chrome/Safari
  // bloquean el play() automático del siguiente tema de la cola (aunque sea
  // el mismo <audio> de siempre, ver el fix de arriba). Declarar la
  // metadata y los controles acá es lo que hace que el sistema operativo
  // trate esto como una sesión de reproducción legítima en segundo plano
  // (y de paso aparecen los controles en la pantalla de bloqueo).
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    if (!trackActual) {
      navigator.mediaSession.metadata = null;
      return;
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title: trackActual.titulo,
      artist: trackActual.remixer ?? trackActual.artista_original ?? "ClubPack",
      album: "ClubPack",
    });
  }, [trackActual]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState =
      estado === "sonando" ? "playing" : estado === "pausado" ? "paused" : "none";
  }, [estado]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.setActionHandler("play", () => wsRef.current?.play());
    navigator.mediaSession.setActionHandler("pause", () => wsRef.current?.pause());
    navigator.mediaSession.setActionHandler("nexttrack", () => {
      const actualId = trackActualIdRef.current;
      if (actualId) void avanzarSiguiente(actualId);
    });
    return () => {
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("nexttrack", null);
    };
  }, [avanzarSiguiente]);

  // Red de seguridad para cuando el provider en sí se desmonta (en la práctica
  // casi nunca, vive en la raíz de la app) — evita dejar un <audio> colgado.
  useEffect(() => {
    return () => {
      wsRef.current?.destroy();
      wsRef.current = null;
    };
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
