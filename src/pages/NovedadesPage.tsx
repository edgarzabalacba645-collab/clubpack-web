import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { mensajeErrorAmigable } from "../lib/format";
import { rotuloDia, SELECT_TRACK_RESUMEN, type TrackResumen } from "../lib/tracks";
import { useAccionesLista } from "../lib/escucha";
import { useAuth, esLicenciaDj } from "../lib/auth";
import ListaTracks from "../components/ListaTracks";
import AvisoSuscripcionModal from "../components/AvisoSuscripcionModal";

const DIAS = 30;
const LIMITE = 200;

interface HerramientaNueva {
  id: string;
  nombre: string;
  fecha_creacion: string;
}

/* Lo último que entró al catálogo (y a Herramientas DJ), agrupado por día,
   más nuevo arriba. Es la versión "completa" de lo que resume la
   campanita del header (ver NotificacionesNovedades). */
export default function NovedadesPage() {
  const [tracks, setTracks] = useState<TrackResumen[]>([]);
  const [herramientas, setHerramientas] = useState<HerramientaNueva[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { acciones, escucha } = useAccionesLista(tracks);
  const { perfil } = useAuth();

  useEffect(() => {
    (async () => {
      setCargando(true);
      setError(null);
      const desde = new Date(Date.now() - DIAS * 86400e3).toISOString();
      try {
        const [t, h] = await Promise.all([
          supabase
            .from("tracks")
            .select(SELECT_TRACK_RESUMEN)
            .eq("estado", "activo")
            .gte("fecha_subida", desde)
            .order("fecha_subida", { ascending: false })
            .limit(LIMITE),
          // Herramientas: sin suscripción activa RLS devuelve vacío — no
          // es error, simplemente no se muestra la sección.
          supabase
            .from("herramientas_dj")
            .select("id, nombre, fecha_creacion")
            .gte("fecha_creacion", desde)
            .order("fecha_creacion", { ascending: false })
            .limit(20),
        ]);
        if (t.error) throw t.error;
        setTracks((t.data ?? []) as unknown as TrackResumen[]);
        if (!h.error && h.data) setHerramientas(h.data as HerramientaNueva[]);
      } catch (e) {
        setError(mensajeErrorAmigable(e));
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  const grupos = useMemo(() => {
    const porDia = new Map<string, TrackResumen[]>();
    for (const t of tracks) {
      const k = rotuloDia(t.fecha_subida);
      if (!porDia.has(k)) porDia.set(k, []);
      porDia.get(k)!.push(t);
    }
    return [...porDia.entries()];
  }, [tracks]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display font-extrabold text-3xl tracking-[-0.5px] m-0">Novedades</h1>
        <p className="text-muted text-sm mt-1 m-0">
          Todo lo que entró en los últimos {DIAS} días, lo más nuevo arriba.
        </p>
      </div>

      {escucha.avisoAccion && (
        <p className="text-sm bg-card border border-border-soft rounded-xl px-4 py-3 m-0">{escucha.avisoAccion}</p>
      )}
      {error && <p className="text-sm text-accent font-medium m-0">{error}</p>}
      {cargando && <p className="text-sm text-muted m-0">Cargando…</p>}

      {!cargando && herramientas.length > 0 && (
        <div className="bg-card rounded-2xl border border-border-soft p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display font-bold text-base m-0">Herramientas DJ nuevas</h2>
            <Link to="/herramientas" className="text-xs font-semibold text-accent no-underline">
              Ver todas →
            </Link>
          </div>
          <ul className="list-none m-0 p-0 flex flex-wrap gap-2">
            {herramientas.map((h) => (
              <li key={h.id} className="text-xs font-semibold px-3 py-1.5 rounded-full bg-accent-lime/20 text-ink">
                {h.nombre} <span className="font-normal text-muted">· {rotuloDia(h.fecha_creacion)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!cargando && grupos.length === 0 && (
        <p className="text-sm text-muted m-0">No se subió nada en los últimos {DIAS} días.</p>
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
            tracks={lista}
            acciones={acciones}
            puedeDescargar={esLicenciaDj(perfil)}
          />
        ))}

      <AvisoSuscripcionModal mensaje={escucha.avisoSuscripcion} onCerrar={() => escucha.setAvisoSuscripcion(null)} />
    </div>
  );
}
