import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { mensajeErrorAmigable } from "../lib/format";

interface FilaRanking {
  trackId: string;
  titulo: string;
  remixer: string | null;
  descargas: number;
}

/*
 * Antes esto vivía solo como una pestaña adentro de AdminPage. Ahora es
 * su propia página, visible para cualquier miembro (no solo admins) —
 * lee el ranking ya agregado desde la función obtener_ranking_top_50()
 * (ver sql/007_top50_para_todos.sql) en vez de leer la tabla descargas
 * directo: esa tabla solo deja ver las descargas propias por RLS, así
 * que un miembro normal necesitaba sí o sí una función agregada del
 * lado del servidor para ver el ranking de todo el grupo.
 */
export default function Top50Page() {
  const [ranking, setRanking] = useState<FilaRanking[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setCargando(true);
      setError(null);
      try {
        const { data, error } = await supabase.rpc("obtener_ranking_top_50");
        if (error) throw error;

        setRanking(
          ((data ?? []) as { track_id: string; titulo: string; remixer: string | null; descargas: number }[]).map(
            (f) => ({
              trackId: f.track_id,
              titulo: f.titulo,
              remixer: f.remixer,
              descargas: f.descargas,
            })
          )
        );
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
        <h1 className="font-display font-extrabold text-3xl tracking-[-0.5px] m-0">Top 50</h1>
        <p className="text-muted text-sm mt-1">Los temas más descargados por todo el grupo.</p>
      </div>

      {cargando && <p className="text-sm text-muted m-0">Cargando…</p>}
      {!cargando && error && <p className="text-sm text-accent font-medium m-0">{error}</p>}
      {!cargando && !error && ranking.length === 0 && (
        <p className="text-sm text-muted m-0">Todavía no hay descargas registradas.</p>
      )}

      {!cargando && !error && ranking.length > 0 && (
        <div className="bg-card rounded-2xl border border-border-soft overflow-hidden max-w-2xl">
          {ranking.map((f, i) => (
            <div
              key={f.trackId}
              className="flex items-center gap-4 px-5 py-3 border-b border-border-soft last:border-b-0"
            >
              <span className="text-xs font-bold text-muted w-6 shrink-0">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm truncate">{f.titulo}</div>
                {f.remixer && <div className="text-xs text-muted truncate">{f.remixer}</div>}
              </div>
              <span className="text-sm font-bold shrink-0">{f.descargas}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
