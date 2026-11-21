import type { ReactNode } from "react";
import { formatearBpm, formatearDuracion } from "../lib/format";
import type { TrackResumen } from "../lib/tracks";
import BotonCorazon from "./BotonCorazon";
import BotonReproducir from "./BotonReproducir";
import Portada from "./Portada";

function IconoBajar() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 4v11.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M7.5 11.5 12 16l4.5-4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 19.5h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export interface AccionesFila {
  puedeEscuchar: (id: string) => boolean;
  estaSonando: (id: string) => boolean;
  estaCargando: (id: string) => boolean;
  onReproducir: (track: TrackResumen, filaEl: HTMLElement | null) => void;
  onDescargar: (track: TrackResumen) => void;
  descargandoId: string | null;
  esFavorito: (id: string) => boolean;
  conteoFavoritos: (id: string) => number;
  onToggleFavorito: (id: string) => void;
}

/**
 * Lista de temas con la misma fila en todas las páginas secundarias:
 * play, portada, título/remixer, género, BPM, duración, corazón y bajar.
 * `extra(track)` permite sumar algo a la derecha (p. ej. el puesto en un
 * ranking, o la fecha de descarga). Si `titulo` viene, se dibuja como
 * encabezado de grupo (p. ej. "Hoy").
 */
export default function ListaTracks({
  tracks,
  acciones,
  extra,
  titulo,
  vacio = "No hay temas para mostrar.",
  puedeDescargar = true,
}: {
  tracks: TrackResumen[];
  acciones: AccionesFila;
  extra?: (track: TrackResumen, indice: number) => ReactNode;
  titulo?: ReactNode;
  vacio?: string;
  /** Licencia Simple no descarga (sql/019_tipo_licencia.sql) — en false,
   * el botón de bajar ni se dibuja (no solo se deshabilita). Default true
   * para no romper a nadie que todavía no pasa este prop. */
  puedeDescargar?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      {titulo && <h2 className="font-display font-bold text-base m-0 text-muted">{titulo}</h2>}
      <div className="bg-card rounded-2xl border border-border-soft overflow-hidden">
        {tracks.length === 0 && <div className="p-8 text-center text-muted text-sm">{vacio}</div>}
        {tracks.map((t, i) => {
          const sonando = acciones.estaSonando(t.id);
          return (
            <div
              key={`${t.id}-${i}`}
              data-fila-track
              data-id={t.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 sm:px-5 py-3 border-b border-border-soft last:border-b-0 scroll-mb-20"
            >
              <BotonReproducir
                puede={acciones.puedeEscuchar(t.id)}
                sonando={sonando}
                cargando={acciones.estaCargando(t.id)}
                titulo={t.titulo}
                onClick={() => {
                  const el = document.querySelector<HTMLElement>(`[data-fila-track][data-id="${t.id}"]`);
                  acciones.onReproducir(t, el);
                }}
              />
              <Portada
                path={t.portada_url}
                alt=""
                className="hidden sm:block shrink-0 w-10 h-10 rounded-lg object-cover border border-border-soft"
              />
              <div className="min-w-[140px] flex-1">
                <div className="font-semibold text-sm truncate">{t.titulo}</div>
                <div className="text-xs text-muted truncate">
                  {t.remixer ? `Remix: ${t.remixer}` : ""}
                  {t.remixer && t.artista_original ? " · " : ""}
                  {t.artista_original ? `Original: ${t.artista_original}` : ""}
                  {!t.remixer && !t.artista_original ? (t.perfiles?.nombre_dj ?? "—") : ""}
                </div>
                <div className="sm:hidden text-[11px] text-muted-2 mt-0.5">
                  {[t.generos?.nombre, t.bpm != null ? `${formatearBpm(t.bpm)} bpm` : null, formatearDuracion(t.duracion_seg)]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>

              <div className="hidden sm:flex items-center gap-3 text-xs text-muted shrink-0">
                {t.generos?.nombre && (
                  <span className="inline-block max-w-[110px] truncate font-semibold px-2.5 py-1 rounded-full bg-accent/12 text-accent">
                    {t.generos.nombre}
                  </span>
                )}
                <span className="w-16 text-center">{formatearBpm(t.bpm)} bpm</span>
                <span className="w-12 text-center">{formatearDuracion(t.duracion_seg)}</span>
              </div>

              {extra && <div className="shrink-0 text-xs text-muted-2">{extra(t, i)}</div>}

              <div className="flex items-center gap-2 shrink-0 ml-auto">
                <BotonCorazon
                  activo={acciones.esFavorito(t.id)}
                  cantidad={acciones.conteoFavoritos(t.id)}
                  onClick={() => acciones.onToggleFavorito(t.id)}
                />
                {puedeDescargar && (
                  <button
                    type="button"
                    onClick={() => acciones.onDescargar(t)}
                    disabled={acciones.descargandoId === t.id}
                    aria-label={`Bajar ${t.titulo}`}
                    title="Bajar"
                    className="shrink-0 p-2 flex items-center justify-center rounded-lg border border-border hover:border-ink transition-colors appearance-none bg-transparent cursor-pointer disabled:opacity-50"
                  >
                    {acciones.descargandoId === t.id ? <span className="text-xs px-0.5">…</span> : <IconoBajar />}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
