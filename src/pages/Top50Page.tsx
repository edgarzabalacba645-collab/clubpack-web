import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { mensajeErrorAmigable } from "../lib/format";

interface FilaRanking {
  trackId: string;
  titulo: string;
  remixer: string | null;
  valor: number;
}

/*
 * Antes esto vivía solo como una pestaña adentro de AdminPage. Ahora es
 * su propia página, visible para cualquier miembro (no solo admins) —
 * lee el ranking ya agregado desde funciones del servidor en vez de
 * leer las tablas descargas/reproducciones directo: esas tablas solo
 * dejan ver las filas propias por RLS, así que un miembro normal
 * necesita sí o sí una función agregada del lado del servidor para ver
 * el ranking de todo el grupo.
 *
 * Dos rankings lado a lado, cada uno con su propia función:
 *   - Más descargados: obtener_ranking_top_50() (sql/007_top50_para_todos.sql)
 *   - Más escuchados: obtener_ranking_mas_escuchados() (sql/018_ranking_mas_escuchados.sql)
 * Cuentan cosas distintas (bajar un tema vs. que arranque a sonar de
 * verdad en el player) y pueden salir en orden distinto.
 */
function useRanking(rpc: string, claveValor: string) {
  const [ranking, setRanking] = useState<FilaRanking[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setCargando(true);
      setError(null);
      try {
        const { data, error } = await supabase.rpc(rpc);
        if (error) throw error;

        setRanking(
          ((data ?? []) as Record<string, unknown>[]).map((f) => ({
            trackId: f.track_id as string,
            titulo: f.titulo as string,
            remixer: f.remixer as string | null,
            valor: Number(f[claveValor]),
          })),
        );
      } catch (e) {
        setError(mensajeErrorAmigable(e));
      } finally {
        setCargando(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ranking, cargando, error };
}

function TablaRanking({
  titulo,
  bajada,
  mensajeVacio,
  datos,
}: {
  titulo: string;
  bajada: string;
  mensajeVacio: string;
  datos: { ranking: FilaRanking[]; cargando: boolean; error: string | null };
}) {
  const { ranking, cargando, error } = datos;

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="font-display font-bold text-lg m-0">{titulo}</h2>
        <p className="text-muted text-sm mt-0.5 m-0">{bajada}</p>
      </div>

      {cargando && <p className="text-sm text-muted m-0">Cargando…</p>}
      {!cargando && error && <p className="text-sm text-accent font-medium m-0">{error}</p>}
      {!cargando && !error && ranking.length === 0 && (
        <p className="text-sm text-muted m-0">{mensajeVacio}</p>
      )}

      {!cargando && !error && ranking.length > 0 && (
        <div className="bg-card rounded-2xl border border-border-soft overflow-hidden">
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
              <span className="text-sm font-bold shrink-0">{f.valor}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function Top50Page() {
  const descargas = useRanking("obtener_ranking_top_50", "descargas");
  const escuchados = useRanking("obtener_ranking_mas_escuchados", "reproducciones");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display font-extrabold text-3xl tracking-[-0.5px] m-0">Top 50</h1>
        <p className="text-muted text-sm mt-1">Lo más popular del catálogo, para todo el grupo.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <TablaRanking
          titulo="Más descargados"
          bajada="Los temas que más se bajaron."
          mensajeVacio="Todavía no hay descargas registradas."
          datos={descargas}
        />
        <TablaRanking
          titulo="Más escuchados"
          bajada="Los temas que más veces arrancaron a sonar en el player."
          mensajeVacio="Todavía no hay reproducciones registradas."
          datos={escuchados}
        />
      </div>
    </div>
  );
}
