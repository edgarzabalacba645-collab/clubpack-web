import { useEffect, useMemo } from "react";

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

  useEffect(() => {
    // Libera la URL cuando se deja de usar esta (sea porque el componente
    // se desmonta, p.ej. se quita la fila, o porque cambió el archivo y
    // ya se creó una URL nueva) — si no, cada archivo elegido se queda
    // ocupando memoria del navegador para siempre en esta pestaña.
    return () => URL.revokeObjectURL(url);
  }, [url]);

  return <audio controls preload="none" src={url} className="w-full h-9" />;
}
