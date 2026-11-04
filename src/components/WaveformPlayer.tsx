import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import WaveSurfer from "wavesurfer.js";

export type EstadoWaveform = "cargando" | "sonando" | "pausado";

export interface WaveformPlayerHandle {
  togglePlay: () => void;
}

interface Props {
  url: string;
  onEstado?: (estado: EstadoWaveform) => void;
  onFinish?: () => void;
  onError?: (mensaje: string) => void;
}

/**
 * Waveform que arranca a sonar solo al montarse (lo usa CatalogoPage,
 * que lo monta/desmonta según cuál track está activo) y deja click para
 * saltar a cualquier punto del tema — igual que el preview de
 * cuencamusic.com y sitios parecidos.
 *
 * Dueño de su propio <audio> interno (lo crea wavesurfer.js solo); el
 * padre solo necesita la URL firmada y togglear play/pause por ref.
 */
const WaveformPlayer = forwardRef<WaveformPlayerHandle, Props>(function WaveformPlayer(
  { url, onEstado, onFinish, onError },
  ref,
) {
  const contenedorRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WaveSurfer | null>(null);

  useImperativeHandle(ref, () => ({
    togglePlay: () => {
      wsRef.current?.playPause();
    },
  }));

  useEffect(() => {
    if (!contenedorRef.current) return;

    onEstado?.("cargando");

    const ws = WaveSurfer.create({
      container: contenedorRef.current,
      height: 36,
      waveColor: "#c7c3b8",
      progressColor: "#ff3366",
      cursorColor: "#0a0a0c",
      cursorWidth: 1,
      barWidth: 2,
      barGap: 1,
      barRadius: 1,
      normalize: true,
      url,
    });
    wsRef.current = ws;

    ws.on("ready", () => {
      ws.play();
    });
    ws.on("play", () => onEstado?.("sonando"));
    ws.on("pause", () => onEstado?.("pausado"));
    ws.on("finish", () => onFinish?.());
    ws.on("error", (err) => {
      // Lo más común acá es que falte CORS en el bucket de R2: a
      // diferencia de un <audio src> simple, wavesurfer necesita poder
      // DESCARGAR y decodificar el audio en el navegador para dibujar
      // la onda, no solo reproducirlo.
      console.error("wavesurfer error:", err);
      onError?.(
        "No se pudo cargar el waveform (probablemente falta CORS en el bucket de R2).",
      );
    });

    return () => {
      ws.destroy();
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  return <div ref={contenedorRef} className="flex-1 min-w-0 cursor-pointer" />;
});

export default WaveformPlayer;
