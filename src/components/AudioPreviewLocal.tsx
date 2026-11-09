import { useEffect, useMemo, useRef } from "react";

// Atributo que marca a cada <audio> de vista previa, para poder
// encontrar y pausar a "los demás" sin necesitar un Context ni pasar
// referencias entre filas — cada fila de la carga masiva es su propia
// instancia de este componente, sin ningún estado compartido entre
// ellas más que el DOM.
const ATRIBUTO_MARCA = "data-preview-local";

/**
 * Reproductor nativo mínimo para escuchar un archivo que el usuario
 * ACABA de elegir en su dispositivo, antes de subirlo — no pasa por el
 * backend ni por el reproductor global (ese es para temas que YA están
 * en el catálogo, con id y URL firmada de R2). Usa directamente el
 * archivo local vía URL.createObjectURL, así que funciona apenas se
 * elige el archivo, incluso antes de analizarlo o subirlo.
 *
 * Pensado para la carga de temas (de a uno o masiva): poder escuchar
 * qué es cada archivo mientras se completa género/BPM/tonalidad, sin
 * tener que adivinar por el nombre del archivo — a Edgar le pasó de
 * terminar de analizar un tema y no asignarle género por no acordarse
 * cuál era ni su ritmo.
 */
export default function AudioPreviewLocal({ archivo }: { archivo: File }) {
  // useMemo (no useState): si "archivo" cambia (otro File), hace falta
  // una URL nueva apuntando al nuevo archivo, no quedarse con la vieja.
  const url = useMemo(() => URL.createObjectURL(archivo), [archivo]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Libera la URL cuando se deja de usar esta (sea porque el componente
    // se desmonta, p.ej. se quita la fila, o porque cambió el archivo y
    // ya se creó una URL nueva) — si no, cada archivo elegido se queda
    // ocupando memoria del navegador para siempre en esta pestaña.
    return () => URL.revokeObjectURL(url);
  }, [url]);

  // Al tocar play en ESTA vista previa, pausa cualquier OTRA vista previa
  // que estuviera sonando — antes, en la carga masiva, cada fila era un
  // <audio> totalmente independiente, así que quedaban sonando todos los
  // temas a los que se les daba play, uno encima del otro.
  function pausarLasDemas() {
    document.querySelectorAll<HTMLAudioElement>(`audio[${ATRIBUTO_MARCA}]`).forEach((el) => {
      if (el !== audioRef.current) el.pause();
    });
  }

  return (
    <audio
      ref={audioRef}
      controls
      preload="none"
      src={url}
      className="w-full h-9"
      onPlay={pausarLasDemas}
      {...{ [ATRIBUTO_MARCA]: "1" }}
    />
  );
}
