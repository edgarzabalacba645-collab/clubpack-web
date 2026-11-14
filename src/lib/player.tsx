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
import { supabase } from "./supabase";

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

/** Lo que hace falta para reproducir un track puntual: la URL firmada
 * más, si ya se calcularon (ver audio.py::calcular_peaks en el backend),
 * la envolvente de volumen y la duración real — con esas dos, wavesurfer
 * puede dibujar la onda y arrancar en streaming nativo SIN tener que
 * bajar y decodificar el archivo entero primero. Si peaks viene null
 * (temas viejos todavía sin backfill), el player simplemente tarda lo de
 * siempre para ESE tema puntual — no rompe nada. */
export interface ResolucionTrack {
  url: string;
  duracion_seg?: number | null;
  peaks?: number[] | null;
}

export interface TrackReproduccion extends TrackCola {
  url: string;
  peaks?: number[] | null;
}

export type EstadoReproduccion = "cargando" | "sonando" | "pausado";

/**
 * 0.2s de silencio digital puro (WAV mono, generado local con ffmpeg —
 * no es un archivo de ningún lado, no tiene licencia que importe).
 *
 * Por qué hace falta: investigando por qué la notificación/controles de
 * la pantalla de bloqueo desaparecen en Android durante reproducción
 * continua, encontramos reportes de otros devs con el mismo síntoma
 * exacto — la causa es que ANDROID/CHROME CORTA LA SESIÓN DE AUDIO EN
 * SEGUNDO PLANO APENAS SE CAMBIA EL "src" DEL <audio>, que es
 * EXACTAMENTE lo que hacemos en cada cambio de tema (ver ws.load() más
 * abajo) — no importa cuán rápido se reanude después. Ya probamos: (1)
 * que playbackState nunca baje a "none" durante la carga, y (2) instalar
 * la app como PWA — ninguno de los dos alcanza, porque ninguno evita el
 * cambio de src en sí.
 *
 * El arreglo documentado (mismo mecanismo que usan varios reproductores
 * web): mantener un SEGUNDO <audio>, de puro silencio, sonando en loop
 * todo el tiempo que haya reproducción activa. Al sistema operativo le
 * alcanza con que ALGÚN <audio> de la pestaña esté genuinamente
 * reproduciendo sonido en todo momento para seguir tratando la sesión
 * como legítima — no cambiamos su src nunca, así que nunca sufre el
 * corte. El tema principal (wavesurfer) sigue cambiando de src como
 * siempre, pero ahora eso ya no es el único audio activo de la página.
 */
const SILENCIO_DATA_URI =
  "data:audio/wav;base64,UklGRsYMAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAATElTVBoAAABJTkZPSVNGVA4AAABMYXZmNjAuMTYuMTAwAGRhdGGADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

interface ReproducirOpciones {
  /** Lista ordenada de la que forma parte este track (p.ej. el catálogo
   * filtrado tal cual se ve en pantalla en ese momento) — define qué
   * sigue cuando está activa la reproducción continua. Si no se pasa,
   * sigue valiendo la cola que ya hubiera. */
  cola?: TrackCola[];
  /** Cómo conseguir la URL firmada (+ peaks/duración si ya existen) de
   * cualquier track de la cola, dado su id — el reproductor la necesita
   * para avanzar solo al siguiente tema sin que la pantalla que lo inició
   * sea quien lo pida. */
  resolverUrl?: (id: string) => Promise<ResolucionTrack>;
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
  const resolverUrlRef = useRef<((id: string) => Promise<ResolucionTrack>) | null>(null);
  const modoContinuoRef = useRef(modoContinuo);
  modoContinuoRef.current = modoContinuo;
  // El id del track actual, en un ref aparte: lo necesita el handler de
  // "finish" (ver más abajo, se registra UNA sola vez y si leyera
  // trackActual directamente quedaría con el valor del primer tema para
  // siempre — closure obsoleta).
  const trackActualIdRef = useRef<string | null>(null);
  trackActualIdRef.current = trackActual?.id ?? null;
  // Mismo motivo que trackActualIdRef, pero con el track completo — lo
  // necesita "repintarMetadata" (ver más abajo) para reconstruir la
  // metadata de Media Session desde los handlers nativos play/pause, que
  // también se registran una sola vez.
  const trackActualRef = useRef<TrackReproduccion | null>(null);
  trackActualRef.current = trackActual;
  // URL del PRÓXIMO tema de la cola, pedida de antemano (ver el effect más
  // abajo) — para que al terminar un tema no haya que esperar un fetch de
  // red justo en ese instante. Con la pantalla bloqueada, ese hueco async
  // cae justo en el momento en que el celular puede llegar a congelar la
  // pestaña en segundo plano antes de que termine — precargar la URL
  // mientras el tema actual todavía suena achica ese hueco a (casi) cero.
  const proximaUrlRef = useRef<({ id: string } & ResolucionTrack) | null>(null);
  // Segundo <audio> aparte, de silencio puro en loop — ver el comentario
  // grande más abajo (donde se arranca) sobre por qué hace falta.
  const audioSilencioRef = useRef<HTMLAudioElement | null>(null);
  // ¿Ya se anotó la reproducción del tema cargado actualmente? Se anota
  // UNA vez por carga de tema, en el primer "play" real (no al pedir la
  // URL firmada: esa se precarga para el tema siguiente antes de saber
  // si va a llegar a sonar, y reanudar después de una pausa tampoco
  // cuenta como escucha nueva). Ver sql/014_actividad_por_usuario.sql.
  const reproduccionRegistradaRef = useRef(false);

  // Intento de forzar a Android a repintar la notificación de la pantalla
  // bloqueada (para corregir el ícono de play/pausa que se le queda
  // pegado en pausa — ver el comentario grande en el handler "pause" de
  // wavesurfer más abajo). Pista real: con el ícono pegado, tocar
  // "Siguiente" (que cambia de tema, audio incluido) destrababa todo y
  // volvía a sonar. La hipótesis era que alcanzaba con repintar la
  // metadata (sin tocar el audio) para lograr el mismo efecto — PROBADO
  // en el celular de Edgar (POCO M6 Pro, HyperOS) y NO FUE SUFICIENTE: el
  // ícono siguió pegado igual. Tampoco fue timing (el repintado corre en
  // el mismo instante del pause nativo, confirmado con logs). Revisados
  // también los ajustes de batería/autostart/apps bloqueadas específicos
  // de MIUI/HyperOS — ya estaban bien puestos, así que tampoco es eso.
  // Conclusión por ahora: parece una limitación de la plataforma en este
  // equipo en particular, no arreglable desde acá — se deja esta función
  // (es inocua y podría ayudar en otros Android) pero sin seguir
  // invirtiendo tiempo en el síntoma del ícono pegado.
  const repintarMetadata = useCallback(() => {
    if (!("mediaSession" in navigator)) return;
    const t = trackActualRef.current;
    if (!t) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t.titulo,
      artist: t.remixer ?? t.artista_original ?? "ClubPack",
      album: "ClubPack",
    });
  }, []);

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
      const precargada = proximaUrlRef.current;
      const resuelto =
        precargada && precargada.id === siguiente.id ? precargada : await resolver(siguiente.id);
      setTrackActual({ ...siguiente, url: resuelto.url, peaks: resuelto.peaks ?? null });
    } catch (e) {
      // OJO: antes acá también se hacía setTrackActual(null) — pero eso
      // desmonta la barra entera (ver BarraReproductor: "if (!trackActual)
      // return null"), ¡incluido el <p> del error que se acababa de
      // setear! Por eso nunca se veía ningún aviso cuando esto fallaba
      // con la pantalla bloqueada: el error se seteaba y se escondía en
      // el mismo instante. Dejando trackActual como estaba (el tema que
      // recién terminó, en pausa), el error queda visible de verdad.
      const detalle = e instanceof Error ? e.message : String(e);
      setError(`No se pudo reproducir el siguiente tema (${detalle}).`);
      setEstado("pausado");
    }
  }, []);

  // Busca el track ANTERIOR al actual en la cola — para el botón "anterior"
  // de la pantalla de bloqueo / auriculares / etc. A diferencia de
  // avanzarSiguiente, no hay precarga (proximaUrlRef solo guarda el que
  // sigue): pide la URL fresca en el momento, como cualquier salto que no
  // sea el avance natural hacia adelante.
  const retrocederAnterior = useCallback(async (actualId: string) => {
    const cola = colaRef.current;
    const idx = cola.findIndex((t) => t.id === actualId);
    const anterior = idx > 0 ? cola[idx - 1] : undefined;
    const resolver = resolverUrlRef.current;
    if (!anterior || !resolver) return;
    try {
      setEstado("cargando");
      const resuelto = await resolver(anterior.id);
      setTrackActual({ ...anterior, url: resuelto.url, peaks: resuelto.peaks ?? null });
    } catch (e) {
      const detalle = e instanceof Error ? e.message : String(e);
      setError(`No se pudo reproducir el tema anterior (${detalle}).`);
      setEstado("pausado");
    }
  }, []);

  // Reanudar un tema que estuvo PAUSADO (no uno que recién arranca) puede
  // quedar "fantasma" en Android: el navegador reporta que arrancó bien
  // (play() resuelve sin error, se dispara el evento "play", el ícono
  // cambia) pero no sale ningún sonido de verdad — le pasó a Edgar
  // reanudando desde la notificación de la pantalla bloqueada. Es un
  // patrón de bug conocido de la capa de audio nativa de Android al
  // reactivar un audio que estuvo pausado y en segundo plano un rato: el
  // primer pedacito de datos de ese nuevo "AudioTrack" se pierde si el
  // pipeline todavía no está listo del todo — y como play() ya resolvió
  // para cuando pasa, no hay ningún error que atrapar.
  //
  // El workaround documentado para el mismo tipo de síntoma en otros
  // reproductores: "cebar" el play mudo un instante antes de destaparlo,
  // para que ESE primer pedacito (potencialmente perdido) sea silencio
  // de todos modos y lo que sí se escuche arranque ya con el pipeline
  // despierto. No es una garantía — es un bug de la plataforma, no
  // nuestro — pero es de bajo riesgo (en el peor caso no cambia nada) y
  // vale la pena probarlo.
  const reanudarConCebado = useCallback(async () => {
    const ws = wsRef.current;
    if (!ws) return;
    try {
      ws.setMuted(true);
      await ws.play();
      // Destapar el audio recién cuando el navegador confirma que avanzó
      // de verdad (evento nativo "timeupdate"), NO después de un tiempo
      // fijo con setTimeout como se hacía antes. Motivo: con la pantalla
      // bloqueada, Chrome puede frenar/demorar los timers de una pestaña
      // en segundo plano mucho más que esos 150ms — y si ese setTimeout
      // nunca llega a disparar, el audio queda mudo para siempre (suena,
      // reproduce, pero sin volumen) hasta que se desbloquea el celular
      // y se reintenta desde la app. Esto explica el síntoma reportado:
      // "pausa funciona, pero play no vuelve a sonar hasta desbloquear".
      // timeupdate en cambio sí sigue llegando en segundo plano (ya se
      // usa más abajo para setPositionState mientras el tema suena con
      // la pantalla bloqueada), así que no depende de que un timer
      // dispare puntual — y si por algo rarísimo no llegara, el setTimeout
      // de 1.5s es solo una red de seguridad, no el camino principal.
      await new Promise<void>((resolve) => {
        let resuelto = false;
        const destapar = () => {
          if (resuelto) return;
          resuelto = true;
          cancelarSuscripcion();
          resolve();
        };
        const cancelarSuscripcion = ws.once("timeupdate", destapar);
        setTimeout(destapar, 1500);
      });
      ws.setMuted(false);
    } catch {
      ws.setMuted(false);
      setError("El navegador bloqueó la reproducción — tocá play de nuevo.");
      setEstado("pausado");
    }
  }, []);

  // Precarga la URL del tema que sigue apenas arranca el actual (no hace
  // falta esperar a que termine) — así ya está lista cuando "finish" la
  // necesita. Si falla (red, token vencido, etc.) no pasa nada: queda
  // null y avanzarSiguiente la pide de nuevo en el momento, como antes.
  useEffect(() => {
    if (!trackActual || !modoContinuo) return;
    const cola = colaRef.current;
    const idx = cola.findIndex((t) => t.id === trackActual.id);
    const siguiente = idx >= 0 ? cola[idx + 1] : undefined;
    const resolver = resolverUrlRef.current;
    if (!siguiente || !resolver) return;
    let cancelado = false;
    resolver(siguiente.id)
      .then((resuelto) => {
        if (!cancelado) proximaUrlRef.current = { id: siguiente.id, ...resuelto };
        // OJO: acá antes también se disparaba un fetch() aparte para bajar
        // el archivo de audio completo de antemano. Se sacó: wavesurfer YA
        // baja el archivo entero por su cuenta en cada ws.load() (lo
        // necesita para poder dibujar la onda, no solo reproducir — ver
        // Fetcher.fetchBlob en su código), así que esa precarga manual
        // terminaba compitiendo por el mismo ancho de banda limitado del
        // celular justo con la descarga del tema que SÍ hace falta ya
        // mismo — probablemente la causa de que de repente nada cargara.
      })
      .catch(() => {
        /* no pasa nada, se vuelve a intentar al llegar el momento */
      });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackActual?.id, modoContinuo]);

  useEffect(() => {
    if (!trackActual || !contenedorElRef.current) return;
    setEstado("cargando");
    setError(null);
    // Tema nuevo (o el mismo recargado): su escucha todavía no se anotó.
    reproduccionRegistradaRef.current = false;

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
      // Audio de silencio en loop — ver el comentario grande en
      // SILENCIO_DATA_URI (arriba del todo del archivo) para el por qué.
      // Se crea y arranca en el mismo momento que wavesurfer (dentro del
      // mismo toque real del usuario que arranca el primer tema), igual
      // que éste — así queda "destrabado" para reproducir por código de
      // ahí en adelante, sin necesitar un toque nuevo.
      if (!audioSilencioRef.current) {
        const silencio = new Audio(SILENCIO_DATA_URI);
        silencio.loop = true;
        audioSilencioRef.current = silencio;
        silencio.play().catch(() => {
          // Si por lo que sea el navegador lo bloquea, no pasa nada: el
          // resto sigue andando igual, solo sin este colchón extra.
        });
      }

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

      ws.on("ready", (duracion) => {
        // setPositionState: lo que le falta a la sesión para que el
        // sistema (pantalla de bloqueo, auriculares, etc.) la trate como
        // una reproducción "completa" de verdad, con posición y duración
        // reales en vez de quedarse en 00:00/00:00 — además de prolijo,
        // es parte de lo que un sistema operativo mira para decidir si
        // una sesión en segundo plano es legítima o no.
        if ("mediaSession" in navigator && "setPositionState" in navigator.mediaSession) {
          try {
            navigator.mediaSession.setPositionState({ duration: duracion, position: 0 });
          } catch {
            /* algunos navegadores tiran si duration es 0/NaN — no pasa nada */
          }
        }
        // Por si el navegador igual lo bloquea en algún caso raro (pestaña
        // en segundo plano, modo ahorro de datos, etc.) — así no se queda
        // colgado en "cargando" para siempre sin avisar nada.
        ws?.play().catch(() => {
          setError("El navegador bloqueó la reproducción automática — tocá play para seguir.");
          setEstado("pausado");
        });
      });
      ws.on("play", () => {
        // Limpia cualquier error de un intento anterior (p.ej. "el
        // navegador pausó la reproducción en segundo plano") — si no, un
        // mensaje viejo se quedaba pegado en pantalla aunque la
        // reproducción ya se hubiera recuperado y estuviera sonando bien
        // (confundía: "¿por qué dice que se cortó si está sonando?").
        // Setear playbackState ACÁ, directo, y no solo dejarlo en manos
        // del useEffect de más abajo que lo deriva de "estado" (React) —
        // ver el mismo razonamiento en el "pause" de abajo. Es lo que el
        // sistema operativo lee para decidir qué ícono mostrar en la
        // notificación de la pantalla de bloqueo.
        if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing";
        // Repintar metadata además de playbackState — ver el comentario
        // grande de "repintarMetadata" y el del handler "pause" de acá
        // abajo: a este Android/Chrome el playbackState solo no le
        // alcanza para refrescar el ícono de la notificación.
        repintarMetadata();
        setError(null);
        setEstado("sonando");
        // Anotar la escucha para el visor de actividad del admin — una
        // sola vez por tema cargado (ver reproduccionRegistradaRef). Si
        // falla, no pasa nada: es un log, nunca debe afectar el audio.
        const idSonando = trackActualIdRef.current;
        if (idSonando && !reproduccionRegistradaRef.current) {
          reproduccionRegistradaRef.current = true;
          supabase
            .rpc("registrar_reproduccion", { p_track_id: idSonando })
            .then(({ error: errRegistro }) => {
              if (errRegistro) console.warn("No se pudo registrar la reproducción:", errRegistro.message);
            });
        }
      });
      ws.on("timeupdate", (posicion) => {
        if ("mediaSession" in navigator && "setPositionState" in navigator.mediaSession) {
          try {
            navigator.mediaSession.setPositionState({ duration: ws!.getDuration(), position: posicion });
          } catch {
            /* ídem arriba */
          }
        }
      });
      ws.on("pause", () => {
        // Puede ser porque tocamos pausa nosotros, pero en el celular
        // también puede ser el navegador/sistema pausando por su cuenta
        // una reproducción que arrancó sola (sin un toque) estando en
        // segundo plano — distinguirlo bien necesitaría poder ver la
        // consola del celular, así que por ahora al menos se avisa.
        //
        // NOTA sobre el bug de "ícono de pausa pegado" en la notificación
        // de pantalla bloqueada (reportado por Edgar, POCO M6 Pro /
        // HyperOS): se probaron acá, en orden, (1) setear playbackState
        // directo y sincrónico con el evento nativo en vez de dejarlo en
        // manos del useEffect que lo deriva de "estado" (React podía
        // tardar en correrlo con la pantalla bloqueada) y (2) repintar la
        // metadata (repintarMetadata) además de playbackState, ya que
        // tocar "Siguiente" con el ícono pegado sí lo destrababa. NINGUNA
        // de las dos alcanzó en ese equipo — confirmado con logs que
        // corrían en el instante correcto, y con los ajustes de batería/
        // autostart de MIUI ya puestos en "sin restricciones". Quedan
        // las dos igual (no hacen daño y podrían ayudar en otros
        // Android), pero el síntoma en sí parece ser una limitación de
        // la plataforma en ese equipo puntual, no arreglable desde acá.
        if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
        repintarMetadata();
        if (modoContinuoRef.current && document.visibilityState === "hidden") {
          setError("El navegador pausó la reproducción en segundo plano.");
        }
        setEstado("pausado");
      });
      ws.on("finish", () => {
        const actualId = trackActualIdRef.current;
        if (modoContinuoRef.current && actualId) {
          void avanzarSiguiente(actualId);
        } else {
          setTrackActual(null);
        }
      });
      ws.on("error", (err) => {
        // Lo más común acá (cuando NO hay peaks precalculados, así que
        // wavesurfer todavía tiene que bajar+decodificar el archivo él
        // mismo) es que falte CORS en el bucket de R2.
        //
        // OJO: a propósito NO se hace setTrackActual(null) acá — eso
        // desmonta la barra entera (ver BarraReproductor: "if
        // (!trackActual) return null"), incluido el <p> de este mismo
        // error, así que nunca se llegaba a VER ningún aviso. Dejando el
        // track puesto (en pausa), el mensaje queda visible de verdad.
        console.error("wavesurfer error:", err);
        setError("No se pudo reproducir (probablemente falta CORS en el bucket de R2).");
        setEstado("pausado");
      });
    }

    // Pasarle peaks + duración ya calculados (ver audio.py::calcular_peaks)
    // hace que wavesurfer se salte su descarga+decodificación completa del
    // archivo (lo que hace por su cuenta si no le pasamos esto — necesita
    // esos datos para poder dibujar la onda) y use streaming nativo en su
    // lugar: la onda aparece al toque y el audio arranca mucho más rápido,
    // sobre todo con señal floja. Si el track todavía no tiene peaks
    // (temas viejos sin backfill), quedan undefined y wavesurfer hace lo
    // de siempre para ESE tema puntual — no se rompe nada.
    // wavesurfer espera un array POR CANAL (aunque sea uno solo) — el
    // backend manda un solo array plano (mono, alcanza para dibujar la
    // onda), así que se envuelve acá en un array de un solo canal.
    const channelData = trackActual.peaks ? [trackActual.peaks] : undefined;
    ws.load(trackActual.url, channelData, trackActual.duracion_seg ?? undefined);
    // Por si Android llegó a pausar el audio de silencio por su cuenta
    // (p.ej. en algún ciclo previo de throttling) — lo reafirma en cada
    // cambio de tema, no solo al crearlo.
    audioSilencioRef.current?.play().catch(() => {});
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
      // Se pausa (no se destruye): si se arranca otro tema más tarde en
      // la misma sesión de la pestaña, lo reutilizamos ya "destrabado"
      // en vez de crear uno nuevo que necesitaría su propio toque.
      audioSilencioRef.current?.pause();
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
    if (!trackActual) {
      navigator.mediaSession.playbackState = "none";
      return;
    }
    // "cargando" (el hueco entre que termina un tema y arranca el
    // siguiente, en reproducción continua) ANTES cafa acá en "none" —
    // que para el sistema operativo significa "no hay ninguna sesión de
    // reproducción activa". Con eso, cada transición entre temas podía
    // leerse como que la sesión TERMINÓ, y después de unos pocos ciclos
    // así Android dejaba de mostrar la notificación/controles de la
    // pantalla de bloqueo (lo que reportó Edgar: a partir del 3er tema
    // ya no aparecía más, aunque el audio seguía sonando bien). Mientras
    // haya un trackActual puesto, para el sistema esto sigue siendo una
    // sesión activa — "cargando" cuenta como "playing", nunca "none".
    navigator.mediaSession.playbackState = estado === "pausado" ? "paused" : "playing";
  }, [estado, trackActual]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.setActionHandler("play", () => void reanudarConCebado());
    navigator.mediaSession.setActionHandler("pause", () => wsRef.current?.pause());
    navigator.mediaSession.setActionHandler("nexttrack", () => {
      const actualId = trackActualIdRef.current;
      if (actualId) void avanzarSiguiente(actualId);
    });
    navigator.mediaSession.setActionHandler("previoustrack", () => {
      const actualId = trackActualIdRef.current;
      if (actualId) void retrocederAnterior(actualId);
    });
    return () => {
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("nexttrack", null);
      navigator.mediaSession.setActionHandler("previoustrack", null);
    };
  }, [avanzarSiguiente, retrocederAnterior, reanudarConCebado]);

  // Red de seguridad para cuando el provider en sí se desmonta (en la práctica
  // casi nunca, vive en la raíz de la app) — evita dejar un <audio> colgado.
  useEffect(() => {
    return () => {
      wsRef.current?.destroy();
      wsRef.current = null;
      audioSilencioRef.current?.pause();
      audioSilencioRef.current = null;
    };
  }, []);

  const reproducir = useCallback((track: TrackReproduccion, opciones?: ReproducirOpciones) => {
    if (opciones?.cola) colaRef.current = opciones.cola;
    if (opciones?.resolverUrl) resolverUrlRef.current = opciones.resolverUrl;
    setTrackActual((actual) => {
      if (actual?.id === track.id) {
        // Ya es el track activo — togglear en vez de recrear el waveform.
        // Para REANUDAR pasa por reanudarConCebado (ver su comentario) en
        // vez de playPause() directo — para PAUSAR no hace falta nada de
        // eso, pause() no tiene el problema de "éxito fantasma".
        if (wsRef.current?.isPlaying()) {
          wsRef.current.pause();
        } else {
          void reanudarConCebado();
        }
        return actual;
      }
      return track;
    });
  }, [reanudarConCebado]);

  const togglePlay = useCallback(() => {
    if (wsRef.current?.isPlaying()) {
      wsRef.current.pause();
    } else {
      void reanudarConCebado();
    }
  }, [reanudarConCebado]);

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
