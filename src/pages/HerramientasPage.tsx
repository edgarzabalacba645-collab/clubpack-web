import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { mensajeErrorAmigable } from "../lib/format";
import type { HerramientaDJ } from "../lib/types";
import Portada from "../components/Portada";

export default function HerramientasPage() {
  const [herramientas, setHerramientas] = useState<HerramientaDJ[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setCargando(true);
      try {
        const { data, error } = await supabase
          .from("herramientas_dj")
          .select("*")
          .order("orden")
          .order("fecha_creacion", { ascending: false });
        if (error) throw error;
        setHerramientas((data ?? []) as HerramientaDJ[]);
      } catch (e) {
        setError(mensajeErrorAmigable(e));
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display font-extrabold text-3xl tracking-[-0.5px] m-0">Herramientas DJ</h1>
        <p className="text-muted text-sm mt-1">Plugins, packs y otros recursos para descargar.</p>
      </div>

      {cargando && <p className="text-sm text-muted">Cargando…</p>}
      {!cargando && error && <p className="text-sm text-accent font-medium">{error}</p>}
      {!cargando && !error && herramientas.length === 0 && (
        <div className="bg-card rounded-2xl border border-border-soft p-8 text-center text-muted text-sm">
          Todavía no hay herramientas cargadas.
        </div>
      )}

      {!cargando && !error && herramientas.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {herramientas.map((h) => (
            <div
              key={h.id}
              className="bg-card rounded-2xl border border-border-soft overflow-hidden flex flex-col"
            >
              <Portada path={h.imagen_path} alt={h.nombre} className="w-full aspect-[16/9] object-cover" />
              <div className="p-5 flex flex-col gap-2 flex-1">
                <div className="font-display font-bold text-base">{h.nombre}</div>
                {h.descripcion && <p className="text-sm text-muted m-0 flex-1">{h.descripcion}</p>}
                <a
                  href={h.link_descarga}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 self-start text-sm font-semibold bg-ink text-cream px-4 py-2 rounded-full no-underline"
                >
                  Descargar
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
