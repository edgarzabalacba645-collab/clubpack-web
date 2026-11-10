import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { mensajeErrorAmigable } from "../lib/format";
import { useAuth, tieneAccesoActivo } from "../lib/auth";
import type { HerramientaDJ } from "../lib/types";
import Portada from "../components/Portada";

export default function HerramientasPage() {
  const { perfil } = useAuth();
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

      {/* Esta sección entera queda atrás de la suscripción (sin el
          carve-out de géneros gratuitos que tiene el Catálogo) — sin
          acceso activo, RLS devuelve la lista vacía en vez de un error,
          así que sin este aviso se veía igual que "todavía no hay
          nada cargado" aunque sí hubiera herramientas. */}
      {!cargando && !error && !tieneAccesoActivo(perfil) && (
        <p className="text-sm bg-accent/10 border border-accent/30 rounded-xl px-4 py-3 m-0">
          Las herramientas DJ son parte de la suscripción mensual —{" "}
          <Link to="/suscripcion" className="underline font-semibold">
            suscribite acá
          </Link>{" "}
          para verlas.
        </p>
      )}

      {!cargando && !error && tieneAccesoActivo(perfil) && herramientas.length === 0 && (
        <div className="bg-card rounded-2xl border border-border-soft p-8 text-center text-muted text-sm">
          Todavía no hay herramientas cargadas.
        </div>
      )}

      {!cargando && !error && tieneAccesoActivo(perfil) && herramientas.length > 0 && (
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
