import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { formatearFechaHora, mensajeErrorAmigable } from "../lib/format";
import { rotuloDia, SELECT_TRACK_RESUMEN, type TrackResumen } from "../lib/tracks";
import { useAccionesLista } from "../lib/escucha";
import ListaTracks from "../components/ListaTracks";
import AvisoSuscripcionModal from "../components/AvisoSuscripcionModal";

const LIMITE = 500;

interface FilaDescarga {
  id: string;
  fecha: string;
  tracks: TrackResumen | null;
}

/* Historial de descargas del usuario logueado (RLS solo deja ver las
   propias), agrupado por día. Cada fila se puede volver a escuchar o
   bajar de nuevo. */
export default function DescargasPage() {
  const [filas, setFilas] = useState<FilaDescarga[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // La cola de reproducción continua: cada tema una sola vez, en el orden
  // en que aparecen (más reciente primero).
  const tracksUnicos = useMemo(() => {
    const vistos = new Set<string>();
    const lista: TrackResumen[] = [];
    for (const f of filas) {
      if (f.tracks && !vistos.has(f.tracks.id)) {
        vistos.add(f.tracks.id);
        lista.push(f.tracks);
      }
    }
    return lista;
  }, [filas]);
  const { acciones, escucha } = useAccionesLista(tracksUnicos);

  useEffect(() => {
    (async () => {
      setCargando(true);
      setError(null);
      try {
        const { data, error } = await supabase
          .from("descargas")
          .select(`id, fecha, tracks(${SELECT_TRACK_RESUMEN})`)
          .order("fecha", { ascending: false })
          .limit(LIMITE);
        if (error) throw error;
        setFilas((data ?? []) as unknown as FilaDescarga[]);
      } catch (e) {
        setError(mensajeErrorAmigable(e));
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  const grupos = useMemo(() => {
    const porDia = new Map<string, { track: TrackResumen; fecha: string }[]>();
    for (const f of filas) {
      if (!f.tracks) continue;
      const k = rotuloDia(f.fecha);
      if (!porDia.has(k)) porDia.set(k, []);
      porDia.get(k)!.push({ track: f.tracks, fecha: f.fecha });
    }
    return [...porDia.entries()];
  }, [filas]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display font-extrabold text-3xl tracking-[-0.5px] m-0">Mis descargas</h1>
        <p className="text-muted text-sm mt-1 m-0">
          Todo lo que bajaste, lo más reciente arriba. Podés volver a escuchar o bajar cualquiera.
        </p>
      </div>

      {escucha.avisoAccion && (
        <p className="text-sm bg-card border border-border-soft rounded-xl px-4 py-3 m-0">{escucha.avisoAccion}</p>
      )}
      {error && <p className="text-sm text-accent font-medium m-0">{error}</p>}
      {cargando && <p className="text-sm text-muted m-0">Cargando…</p>}

      {!cargando && grupos.length === 0 && (
        <p className="text-sm text-muted m-0">Todavía no descargaste nada.</p>
      )}

      {!cargando &&
        grupos.map(([dia, lista]) => (
          <ListaTracks
            key={dia}
            titulo={
              <>
                {dia} <span className="font-normal text-muted-2">· {lista.length}</span>
              </>
            }
            tracks={lista.map((x) => x.track)}
            acciones={acciones}
            extra={(_t, i) => (
              <span className="hidden sm:inline">{formatearFechaHora(lista[i]?.fecha ?? null).slice(11)}</span>
            )}
          />
        ))}

      <AvisoSuscripcionModal mensaje={escucha.avisoSuscripcion} onCerrar={() => escucha.setAvisoSuscripcion(null)} />
    </div>
  );
}
