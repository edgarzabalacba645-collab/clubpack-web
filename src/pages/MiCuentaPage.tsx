import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { formatearFecha, mensajeErrorAmigable, rotuloEstadoSuscripcion } from "../lib/format";

interface TrackSubido {
  id: string;
  titulo: string;
  remixer: string | null;
  fecha_subida: string;
}

interface DescargaFila {
  id: string;
  fecha: string;
  tracks: { titulo: string; remixer: string | null } | null;
}

export default function MiCuentaPage() {
  const { session, perfil } = useAuth();

  const [misTracks, setMisTracks] = useState<TrackSubido[]>([]);
  const [cargandoTracks, setCargandoTracks] = useState(true);
  const [errorTracks, setErrorTracks] = useState<string | null>(null);

  const [misDescargas, setMisDescargas] = useState<DescargaFila[]>([]);
  const [cargandoDescargas, setCargandoDescargas] = useState(true);
  const [errorDescargas, setErrorDescargas] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;

    (async () => {
      setCargandoTracks(true);
      try {
        const { data, error } = await supabase
          .from("tracks")
          .select("id, titulo, remixer, fecha_subida")
          .eq("subido_por", session.user.id)
          .order("fecha_subida", { ascending: false })
          .limit(50);
        if (error) throw error;
        setMisTracks((data ?? []) as TrackSubido[]);
      } catch (e) {
        setErrorTracks(mensajeErrorAmigable(e));
      } finally {
        setCargandoTracks(false);
      }
    })();

    (async () => {
      setCargandoDescargas(true);
      try {
        const { data, error } = await supabase
          .from("descargas")
          .select("id, fecha, tracks(titulo, remixer)")
          .eq("usuario_id", session.user.id)
          .order("fecha", { ascending: false })
          .limit(20);
        if (error) throw error;
        setMisDescargas((data ?? []) as unknown as DescargaFila[]);
      } catch (e) {
        setErrorDescargas(mensajeErrorAmigable(e));
      } finally {
        setCargandoDescargas(false);
      }
    })();
  }, [session]);

  const estado = perfil?.estado_suscripcion;
  const suscripcionOk = estado === "activo" || perfil?.rol === "admin";

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display font-extrabold text-3xl tracking-[-0.5px] m-0">Mi cuenta</h1>

      <div className="max-w-xl flex flex-col gap-6 w-full">
      <div className="bg-card rounded-2xl p-6 flex flex-col gap-3 border border-border-soft">
        <Fila etiqueta="DJ" valor={perfil?.nombre_dj ?? "—"} />
        <Fila etiqueta="Email" valor={perfil?.email ?? "—"} />
        <div className="flex items-center justify-between gap-4 text-sm">
          <span className="text-muted font-medium">Suscripción</span>
          <span
            className={`font-semibold px-2.5 py-1 rounded-full text-xs ${
              suscripcionOk ? "bg-accent-lime text-ink" : "bg-accent/10 text-accent"
            }`}
          >
            {rotuloEstadoSuscripcion(estado)}
          </span>
        </div>
        <Fila etiqueta="Rol" valor={perfil?.rol === "admin" ? "Admin" : "Miembro"} />
      </div>

      {!suscripcionOk && (
        <p className="text-sm text-accent bg-card border border-border-soft rounded-xl px-4 py-3 m-0">
          Tu suscripción no está activa.{" "}
          <Link to="/suscripcion" className="underline font-semibold">
            Pagá o avisá tu transferencia acá
          </Link>
          .
        </p>
      )}

      <Link
        to="/suscripcion"
        className="text-sm font-semibold underline -mt-2 self-start text-ink"
      >
        Ver detalles de pago / suscripción →
      </Link>

      <section className="flex flex-col gap-3">
        <h2 className="font-display font-bold text-lg m-0">Tracks que subiste</h2>
        <div className="bg-card rounded-2xl border border-border-soft overflow-hidden">
          {cargandoTracks && <EstadoVacio texto="Cargando…" />}
          {!cargandoTracks && errorTracks && <EstadoVacio texto={errorTracks} esError />}
          {!cargandoTracks && !errorTracks && misTracks.length === 0 && (
            <EstadoVacio texto="Todavía no subiste ningún track." />
          )}
          {!cargandoTracks &&
            !errorTracks &&
            misTracks.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between gap-4 px-5 py-3 border-b border-border-soft last:border-b-0 text-sm"
              >
                <div className="min-w-0">
                  <div className="font-semibold truncate">{t.titulo}</div>
                  {t.remixer && <div className="text-xs text-muted truncate">{t.remixer}</div>}
                </div>
                <div className="text-xs text-muted shrink-0">{formatearFecha(t.fecha_subida)}</div>
              </div>
            ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display font-bold text-lg m-0">Tus últimas descargas</h2>
        <div className="bg-card rounded-2xl border border-border-soft overflow-hidden">
          {cargandoDescargas && <EstadoVacio texto="Cargando…" />}
          {!cargandoDescargas && errorDescargas && <EstadoVacio texto={errorDescargas} esError />}
          {!cargandoDescargas && !errorDescargas && misDescargas.length === 0 && (
            <EstadoVacio texto="Todavía no descargaste nada." />
          )}
          {!cargandoDescargas &&
            !errorDescargas &&
            misDescargas.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between gap-4 px-5 py-3 border-b border-border-soft last:border-b-0 text-sm"
              >
                <div className="min-w-0">
                  <div className="font-semibold truncate">{d.tracks?.titulo ?? "Track eliminado"}</div>
                  {d.tracks?.remixer && <div className="text-xs text-muted truncate">{d.tracks.remixer}</div>}
                </div>
                <div className="text-xs text-muted shrink-0">{formatearFecha(d.fecha)}</div>
              </div>
            ))}
        </div>
      </section>
      </div>
    </div>
  );
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted font-medium">{etiqueta}</span>
      <span className="font-semibold">{valor}</span>
    </div>
  );
}

function EstadoVacio({ texto, esError = false }: { texto: string; esError?: boolean }) {
  return (
    <div className={`px-5 py-6 text-sm text-center ${esError ? "text-accent font-medium" : "text-muted"}`}>
      {texto}
    </div>
  );
}
