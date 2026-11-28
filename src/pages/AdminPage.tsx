import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import {
  ApiError,
  borrarTrackAdmin,
  calcularPeaksTrack,
  escanearDuplicados,
  fijarPortadaGenericaTrack,
  listarDuplicadosPendientes,
  listarPendientesPeaks,
  listarPendientesPortadaGenerica,
  listarPendientesVolumen,
  marcarDuplicado,
  nivelarVolumenTrack,
  obtenerBalanceCloudflare,
  obtenerBalanceRender,
  subirImagenHerramienta,
  type BalanceCloudflare,
  type BalanceRender,
  type DuplicadoPendiente,
  type ItemUso,
  type TrackPendientePeaks,
  type TrackPendientePortada,
  type TrackPendienteVolumen,
} from "../lib/api";
import {
  formatearBpm,
  formatearFecha,
  formatearFechaHora,
  formatearMonto,
  mensajeErrorAmigable,
  rotuloEstadoSuscripcion,
} from "../lib/format";
import type {
  ActividadUsuario,
  ConfiguracionCatalogo,
  DetalleActividad,
  TipoActividad,
  ConfiguracionSuscripcion,
  ConfiguracionSuscripcionUpdate,
  EstadoSuscripcion,
  EstadoTrack,
  GeneroInsert,
  HerramientaDJ,
  HerramientaDJInsert,
  Pago,
  Perfil,
  Rol,
  TipoLicencia,
} from "../lib/types";
import { ordenarGenerosAlfabetico, type Genero } from "../lib/types";
import Portada from "../components/Portada";

// Top 50 ya no vive acá — ahora es su propia página (/top50), visible
// para cualquier miembro y no solo para admins (ver Top50Page.tsx y
// sql/007_top50_para_todos.sql).
type Tab =
  | "usuarios"
  | "actividad"
  | "generos"
  | "herramientas"
  | "duplicados"
  | "catalogo"
  | "suscripcion"
  | "uso";

const TABS: { id: Tab; etiqueta: string }[] = [
  { id: "usuarios", etiqueta: "Usuarios" },
  { id: "actividad", etiqueta: "Actividad" },
  { id: "generos", etiqueta: "Géneros" },
  { id: "herramientas", etiqueta: "Herramientas DJ" },
  { id: "duplicados", etiqueta: "Duplicados" },
  { id: "catalogo", etiqueta: "Catálogo completo" },
  { id: "suscripcion", etiqueta: "Suscripción" },
  { id: "uso", etiqueta: "Uso y costos" },
];

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("usuarios");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display font-extrabold text-3xl tracking-[-0.5px] m-0">Admin</h1>

      <div className="flex items-center gap-1 overflow-x-auto bg-card border border-border-soft rounded-full p-1 self-start max-w-full">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`shrink-0 whitespace-nowrap text-sm font-semibold px-4 py-2 rounded-full appearance-none border-none cursor-pointer transition-colors ${
              tab === t.id ? "bg-ink text-cream" : "text-muted hover:text-ink bg-transparent"
            }`}
          >
            {t.etiqueta}
          </button>
        ))}
      </div>

      {tab === "usuarios" && <UsuariosTab />}
      {tab === "actividad" && <ActividadTab />}
      {tab === "generos" && <GenerosTab />}
      {tab === "herramientas" && <HerramientasTab />}
      {tab === "duplicados" && <DuplicadosTab />}
      {tab === "catalogo" && <CatalogoCompletoTab />}
      {tab === "suscripcion" && <SuscripcionAdminTab />}
      {tab === "uso" && <UsoTab />}
    </div>
  );
}

// ============================================================
// USUARIOS
// ============================================================

const ROLES: Rol[] = ["miembro", "admin"];
const ESTADOS_SUSCRIPCION: EstadoSuscripcion[] = ["activo", "vencido", "cancelado", "pendiente"];
// Ver sql/019_tipo_licencia.sql.
const TIPOS_LICENCIA: TipoLicencia[] = ["simple", "dj"];

function UsuariosTab() {
  const { session } = useAuth();
  const [usuarios, setUsuarios] = useState<Perfil[]>([]);
  const [ediciones, setEdiciones] = useState<
    Record<string, { rol: Rol; estado_suscripcion: EstadoSuscripcion; tipo_licencia: TipoLicencia }>
  >({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardandoId, setGuardandoId] = useState<string | null>(null);
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);
  const [confirmandoBorrarId, setConfirmandoBorrarId] = useState<string | null>(null);

  useEffect(() => {
    cargar();
  }, []);

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      const { data, error } = await supabase.from("perfiles").select("*").order("fecha_alta");
      if (error) throw error;
      const lista = (data ?? []) as Perfil[];
      setUsuarios(lista);
      setEdiciones(
        Object.fromEntries(
          lista.map((u) => [
            u.id,
            { rol: u.rol, estado_suscripcion: u.estado_suscripcion, tipo_licencia: u.tipo_licencia },
          ]),
        ),
      );
    } catch (e) {
      setError(mensajeErrorAmigable(e));
    } finally {
      setCargando(false);
    }
  }

  async function guardar(u: Perfil) {
    const edicion = ediciones[u.id];
    if (!edicion) return;
    setGuardandoId(u.id);
    setError(null);
    try {
      const { error } = await supabase
        .from("perfiles")
        .update({
          rol: edicion.rol,
          estado_suscripcion: edicion.estado_suscripcion,
          tipo_licencia: edicion.tipo_licencia,
        })
        .eq("id", u.id);
      if (error) throw error;
      setUsuarios((prev) =>
        prev.map((p) =>
          p.id === u.id
            ? {
                ...p,
                rol: edicion.rol,
                estado_suscripcion: edicion.estado_suscripcion,
                tipo_licencia: edicion.tipo_licencia,
              }
            : p,
        ),
      );
    } catch (e) {
      setError(mensajeErrorAmigable(e));
    } finally {
      setGuardandoId(null);
    }
  }

  // Borrado COMPLETO: cuenta de login (auth.users) + perfil + actividad
  // personal (descargas, reproducciones, favoritos, mensajes de chat).
  // No usa la Admin API ni la service_role key — es una función SQL
  // "security definer" (borrar_usuario_completo, solo-admin) que borra
  // auth.users directo; la cascada ya definida en el schema hace el
  // resto sola. Sus temas subidos y su historial de pagos NO se borran,
  // quedan sin usuario asociado. Ver sql/017_borrar_usuario_completo.sql.
  async function borrar(u: Perfil) {
    setOcupadoId(u.id);
    setError(null);
    try {
      const { error } = await supabase.rpc("borrar_usuario_completo", { p_usuario_id: u.id });
      if (error) throw error;
      setUsuarios((prev) => prev.filter((p) => p.id !== u.id));
    } catch (e) {
      setError(mensajeErrorAmigable(e));
    } finally {
      setOcupadoId(null);
      setConfirmandoBorrarId(null);
    }
  }

  if (cargando) return <p className="text-sm text-muted m-0">Cargando…</p>;

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <p className="text-sm text-muted m-0">
        Cambia el estado a mano — para pagos reales (Mercado Pago o transferencias) usá la pestaña
        Suscripción, que mantiene esto sincronizado solo.
      </p>
      <p className="text-xs text-muted-2 m-0">
        Licencia Simple: solo escucha. Licencia DJ: escucha + descarga + sube temas. Las cuentas que
        ya estaban antes de agregar esto quedaron todas en DJ — las nuevas arrancan en Simple.
      </p>
      <p className="text-xs text-muted-2 m-0">
        "Borrar" es definitivo: se va de esta lista, pierde el acceso y su cuenta de login se borra
        por completo (su email queda libre para registrarse de nuevo si quiere). Sus temas subidos y
        su historial de pagos no se tocan, quedan sin usuario asociado.
      </p>
      {error && <p className="text-sm text-accent font-medium m-0">{error}</p>}

      {usuarios.map((u) => {
        const edicion =
          ediciones[u.id] ?? {
            rol: u.rol,
            estado_suscripcion: u.estado_suscripcion,
            tipo_licencia: u.tipo_licencia,
          };
        const huboCambios =
          edicion.rol !== u.rol ||
          edicion.estado_suscripcion !== u.estado_suscripcion ||
          edicion.tipo_licencia !== u.tipo_licencia;
        return (
          <div key={u.id} className="bg-card rounded-2xl border border-border-soft p-4 flex flex-wrap items-center gap-4">
            <div className="min-w-[160px] flex-1">
              <div className="font-semibold text-sm">{u.nombre_dj || u.email}</div>
              <div className="text-xs text-muted">{u.email}</div>
            </div>

            <select
              value={edicion.rol}
              onChange={(e) =>
                setEdiciones((prev) => ({ ...prev, [u.id]: { ...edicion, rol: e.target.value as Rol } }))
              }
              className="px-3 py-1.5 rounded-lg border border-border text-sm bg-cream-soft"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r === "admin" ? "Admin" : "Miembro"}
                </option>
              ))}
            </select>

            <select
              value={edicion.estado_suscripcion}
              onChange={(e) =>
                setEdiciones((prev) => ({
                  ...prev,
                  [u.id]: { ...edicion, estado_suscripcion: e.target.value as EstadoSuscripcion },
                }))
              }
              className="px-3 py-1.5 rounded-lg border border-border text-sm bg-cream-soft"
            >
              {ESTADOS_SUSCRIPCION.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <select
              value={edicion.tipo_licencia}
              onChange={(e) =>
                setEdiciones((prev) => ({
                  ...prev,
                  [u.id]: { ...edicion, tipo_licencia: e.target.value as TipoLicencia },
                }))
              }
              className="px-3 py-1.5 rounded-lg border border-border text-sm bg-cream-soft"
              title="Licencia: Simple (solo escucha) o DJ (escucha + descarga + carga)"
            >
              {TIPOS_LICENCIA.map((t) => (
                <option key={t} value={t}>
                  {t === "dj" ? "Licencia DJ" : "Licencia Simple"}
                </option>
              ))}
            </select>

            {/* El usuario puede pedir cambio de licencia desde Suscripción
                (ver SuscripcionPage) sin que eso toque tipo_licencia todavía
                — esto es solo el aviso visual acá, para quien no vio el
                mensaje de Telegram. Se apaga solo en cuanto un admin guarda
                el cambio arriba (tipo_licencia pasa a igualar lo pedido). */}
            {u.tipo_licencia_solicitada && u.tipo_licencia_solicitada !== u.tipo_licencia && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-accent-lime/30 text-ink shrink-0">
                Pidió: {u.tipo_licencia_solicitada === "dj" ? "DJ" : "Simple"}
              </span>
            )}

            {huboCambios && (
              <button
                type="button"
                onClick={() => guardar(u)}
                disabled={guardandoId === u.id}
                className="text-sm font-semibold bg-accent text-white px-4 py-1.5 rounded-full appearance-none border-none cursor-pointer disabled:opacity-60"
              >
                {guardandoId === u.id ? "Guardando…" : "Guardar cambios"}
              </button>
            )}

            {u.id === session?.user.id ? (
              <span className="text-xs text-muted-2 shrink-0">(vos)</span>
            ) : confirmandoBorrarId === u.id ? (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => borrar(u)}
                  disabled={ocupadoId === u.id}
                  className="text-xs font-semibold text-accent appearance-none bg-transparent border-none cursor-pointer disabled:opacity-60"
                >
                  {ocupadoId === u.id ? "Borrando…" : "Confirmar"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmandoBorrarId(null)}
                  className="text-xs text-muted hover:text-ink appearance-none bg-transparent border-none cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmandoBorrarId(u.id)}
                className="text-xs font-semibold text-muted hover:text-accent appearance-none bg-transparent border-none cursor-pointer shrink-0"
              >
                Borrar
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// ACTIVIDAD POR USUARIO
// ============================================================
// Todo sale de dos funciones SQL solo-admin (ver
// sql/014_actividad_por_usuario.sql): el resumen por usuario y, al
// desplegar uno, su detalle de movimientos. Las reproducciones las
// anota el player (lib/player.tsx) una vez por tema que arranca a sonar.

const ROTULO_TIPO: Record<TipoActividad, { texto: string; clase: string }> = {
  subida: { texto: "Subió", clase: "bg-accent-lime/30 text-ink" },
  descarga: { texto: "Bajó", clase: "bg-accent/15 text-accent" },
  reproduccion: { texto: "Escuchó", clase: "bg-black/5 dark:bg-white/10 text-body" },
};

function ActividadTab() {
  const [filas, setFilas] = useState<ActividadUsuario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [abiertoId, setAbiertoId] = useState<string | null>(null);
  const [detalles, setDetalles] = useState<Record<string, DetalleActividad[]>>({});
  const [cargandoDetalleId, setCargandoDetalleId] = useState<string | null>(null);
  const [filtroTipo, setFiltroTipo] = useState<TipoActividad | "todo">("todo");

  useEffect(() => {
    cargar();
  }, []);

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      const { data, error } = await supabase.rpc("obtener_actividad_por_usuario");
      if (error) throw error;
      setFilas((data ?? []) as ActividadUsuario[]);
    } catch (e) {
      setError(mensajeErrorAmigable(e));
    } finally {
      setCargando(false);
    }
  }

  async function abrir(usuarioId: string) {
    if (abiertoId === usuarioId) {
      setAbiertoId(null);
      return;
    }
    setAbiertoId(usuarioId);
    setFiltroTipo("todo");
    if (detalles[usuarioId]) return;
    setCargandoDetalleId(usuarioId);
    setError(null);
    try {
      const { data, error } = await supabase.rpc("obtener_detalle_actividad_usuario", {
        p_usuario_id: usuarioId,
        p_limite: 200,
      });
      if (error) throw error;
      setDetalles((prev) => ({ ...prev, [usuarioId]: (data ?? []) as DetalleActividad[] }));
    } catch (e) {
      setError(mensajeErrorAmigable(e));
    } finally {
      setCargandoDetalleId(null);
    }
  }

  const filasFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return filas;
    return filas.filter(
      (f) => (f.nombre_dj ?? "").toLowerCase().includes(q) || (f.email ?? "").toLowerCase().includes(q),
    );
  }, [filas, busqueda]);

  const totales = useMemo(
    () =>
      filas.reduce(
        (acc, f) => ({
          subidas: acc.subidas + f.subidas,
          descargas: acc.descargas + f.descargas,
          reproducciones: acc.reproducciones + f.reproducciones,
        }),
        { subidas: 0, descargas: 0, reproducciones: 0 },
      ),
    [filas],
  );

  if (cargando) return <p className="text-sm text-muted m-0">Cargando…</p>;

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <p className="text-sm text-muted m-0">
        Cuánto subió, bajó y escuchó cada usuario. Tocá un usuario para ver sus últimos movimientos
        (hasta 200). Las escuchas se cuentan desde que se activó este visor — lo anterior no quedó
        registrado.
      </p>
      {error && <p className="text-sm text-accent font-medium m-0">{error}</p>}

      <div className="flex flex-wrap gap-3">
        {[
          { etiqueta: "Subidas", valor: totales.subidas },
          { etiqueta: "Descargas", valor: totales.descargas },
          { etiqueta: "Reproducciones", valor: totales.reproducciones },
          { etiqueta: "Usuarios", valor: filas.length },
        ].map((t) => (
          <div key={t.etiqueta} className="bg-card rounded-xl border border-border-soft px-4 py-2.5 min-w-[120px]">
            <div className="text-[11px] uppercase tracking-wide text-muted-2">{t.etiqueta}</div>
            <div className="font-display font-bold text-xl leading-tight">{t.valor.toLocaleString("es-AR")}</div>
          </div>
        ))}
      </div>

      <input
        type="search"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar por nombre o email…"
        className="w-full min-w-0 px-3 py-2 rounded-lg border border-border text-sm bg-cream-soft"
      />

      {filasFiltradas.length === 0 && <p className="text-sm text-muted m-0">No hay usuarios que coincidan.</p>}

      {filasFiltradas.map((f) => {
        const abierto = abiertoId === f.usuario_id;
        const detalle = detalles[f.usuario_id];
        const detalleFiltrado =
          detalle && filtroTipo !== "todo" ? detalle.filter((d) => d.tipo === filtroTipo) : detalle;
        return (
          <div key={f.usuario_id} className="bg-card rounded-2xl border border-border-soft overflow-hidden">
            <div
              role="button"
              tabIndex={0}
              onClick={() => abrir(f.usuario_id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  abrir(f.usuario_id);
                }
              }}
              aria-expanded={abierto}
              className="w-full p-4 flex flex-wrap items-center gap-x-4 gap-y-2 cursor-pointer select-none"
            >
              <div className="min-w-[160px] flex-1">
                <div className="font-semibold text-sm">
                  {f.nombre_dj || f.email}
                  {f.rol === "admin" && <span className="ml-2 text-[11px] font-normal text-muted-2">admin</span>}
                </div>
                <div className="text-xs text-muted">
                  {f.email} · {rotuloEstadoSuscripcion(f.estado_suscripcion)}
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="px-2.5 py-1 rounded-full bg-accent-lime/30 font-semibold" title="Temas subidos">
                  ↑ {f.subidas}
                </span>
                <span className="px-2.5 py-1 rounded-full bg-accent/15 text-accent font-semibold" title="Descargas">
                  ↓ {f.descargas}
                </span>
                <span
                  className="px-2.5 py-1 rounded-full bg-black/5 dark:bg-white/10 font-semibold"
                  title="Reproducciones"
                >
                  ▶ {f.reproducciones}
                </span>
              </div>

              <div className="text-xs text-muted-2 w-full sm:w-auto sm:min-w-[130px] sm:text-right">
                {f.ultima_actividad ? `Último: ${formatearFechaHora(f.ultima_actividad)}` : "Sin actividad"}
              </div>
            </div>

            {abierto && (
              <div className="border-t border-border-soft px-4 py-3 flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {(
                    [
                      { id: "todo", texto: "Todo" },
                      { id: "subida", texto: "Subidas" },
                      { id: "descarga", texto: "Descargas" },
                      { id: "reproduccion", texto: "Reproducciones" },
                    ] as { id: TipoActividad | "todo"; texto: string }[]
                  ).map((op) => (
                    <button
                      key={op.id}
                      type="button"
                      onClick={() => setFiltroTipo(op.id)}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-full appearance-none border-none cursor-pointer transition-colors ${
                        filtroTipo === op.id ? "bg-ink text-cream" : "bg-black/5 dark:bg-white/10 text-muted hover:text-ink"
                      }`}
                    >
                      {op.texto}
                    </button>
                  ))}
                  <span className="text-xs text-muted-2 ml-auto">
                    Alta: {formatearFechaHora(f.fecha_alta).slice(0, 10)}
                  </span>
                </div>

                {cargandoDetalleId === f.usuario_id && <p className="text-sm text-muted m-0">Cargando…</p>}

                {detalleFiltrado && detalleFiltrado.length === 0 && (
                  <p className="text-sm text-muted m-0">Nada por acá todavía.</p>
                )}

                {detalleFiltrado && detalleFiltrado.length > 0 && (
                  <ul className="list-none m-0 p-0 flex flex-col divide-y divide-border-soft">
                    {detalleFiltrado.map((d, i) => (
                      <li key={`${d.tipo}-${d.track_id}-${d.fecha}-${i}`} className="py-2 flex items-start gap-3 min-w-0">
                        <span
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 w-[68px] text-center mt-0.5 ${ROTULO_TIPO[d.tipo].clase}`}
                        >
                          {ROTULO_TIPO[d.tipo].texto}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm break-words">
                            {d.titulo}
                            {d.remixer && <span className="text-muted"> — {d.remixer}</span>}
                          </div>
                          <div className="text-xs text-muted-2 sm:hidden">{formatearFechaHora(d.fecha)}</div>
                        </div>
                        <span className="text-xs text-muted-2 shrink-0 hidden sm:block mt-0.5">
                          {formatearFechaHora(d.fecha)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// GÉNEROS
// ============================================================

function GenerosTab() {
  const [generos, setGeneros] = useState<Genero[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [agregando, setAgregando] = useState(false);
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);
  const [confirmandoBorrarId, setConfirmandoBorrarId] = useState<string | null>(null);

  useEffect(() => {
    cargar();
  }, []);

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      const { data, error } = await supabase.from("generos").select("*").order("orden");
      if (error) throw error;
      setGeneros(ordenarGenerosAlfabetico((data ?? []) as Genero[]));
    } catch (e) {
      setError(mensajeErrorAmigable(e));
    } finally {
      setCargando(false);
    }
  }

  async function agregar() {
    if (!nombreNuevo.trim()) return;
    setAgregando(true);
    setError(null);
    try {
      const nuevo: GeneroInsert = { nombre: nombreNuevo.trim() };
      const { data, error } = await supabase.from("generos").insert(nuevo).select().single();
      if (error) {
        throw new Error(
          error.code === "23505" ? `Ya existe un género llamado "${nombreNuevo.trim()}".` : error.message,
        );
      }
      setGeneros((prev) => ordenarGenerosAlfabetico([...prev, data as Genero]));
      setNombreNuevo("");
    } catch (e) {
      setError(mensajeErrorAmigable(e));
    } finally {
      setAgregando(false);
    }
  }

  async function borrar(g: Genero) {
    setOcupadoId(g.id);
    setError(null);
    try {
      const { error } = await supabase.from("generos").delete().eq("id", g.id);
      if (error) throw error;
      setGeneros((prev) => prev.filter((x) => x.id !== g.id));
    } catch (e) {
      setError(mensajeErrorAmigable(e));
    } finally {
      setOcupadoId(null);
      setConfirmandoBorrarId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4 max-w-xl">
      <div className="flex gap-2">
        <input
          type="text"
          value={nombreNuevo}
          onChange={(e) => setNombreNuevo(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && agregar()}
          placeholder="Nuevo género, ej: Cuarteto"
          className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-border text-sm bg-cream-soft"
        />
        <button
          type="button"
          onClick={agregar}
          disabled={agregando || !nombreNuevo.trim()}
          className="text-sm font-semibold bg-ink text-cream px-4 py-2 rounded-full appearance-none border-none cursor-pointer disabled:opacity-60"
        >
          {agregando ? "Agregando…" : "+ Agregar"}
        </button>
      </div>

      {error && <p className="text-sm text-accent font-medium m-0">{error}</p>}
      {cargando && <p className="text-sm text-muted m-0">Cargando…</p>}

      <div className="flex flex-col gap-2">
        {generos.map((g) => (
          <div key={g.id} className="bg-card rounded-xl border border-border-soft px-4 py-3 flex items-center gap-4">
            <span className="flex-1 text-sm font-medium">
              {g.nombre}
              {!g.activo && (
                <span className="ml-2 text-xs font-normal text-muted-2">(inactivo — convendría borrarlo)</span>
              )}
            </span>

            {confirmandoBorrarId === g.id ? (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => borrar(g)}
                  disabled={ocupadoId === g.id}
                  className="text-xs font-semibold text-accent appearance-none bg-transparent border-none cursor-pointer disabled:opacity-60"
                >
                  Confirmar
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmandoBorrarId(null)}
                  className="text-xs text-muted hover:text-ink appearance-none bg-transparent border-none cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmandoBorrarId(g.id)}
                className="text-xs font-semibold text-muted hover:text-accent appearance-none bg-transparent border-none cursor-pointer shrink-0"
              >
                Borrar
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// HERRAMIENTAS DJ
// ============================================================

function HerramientasTab() {
  const { session } = useAuth();
  const [herramientas, setHerramientas] = useState<HerramientaDJ[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [nombreNuevo, setNombreNuevo] = useState("");
  const [descripcionNueva, setDescripcionNueva] = useState("");
  const [linkNuevo, setLinkNuevo] = useState("");
  const [imagenNueva, setImagenNueva] = useState<File | null>(null);
  const [agregando, setAgregando] = useState(false);

  const [ocupadoId, setOcupadoId] = useState<string | null>(null);
  const [confirmandoBorrarId, setConfirmandoBorrarId] = useState<string | null>(null);

  useEffect(() => {
    cargar();
  }, []);

  async function cargar() {
    setCargando(true);
    setError(null);
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
  }

  async function agregar() {
    if (!nombreNuevo.trim() || !linkNuevo.trim()) return;
    setAgregando(true);
    setError(null);
    try {
      let imagenPath: string | null = null;
      if (imagenNueva) {
        const { path } = await subirImagenHerramienta(imagenNueva);
        imagenPath = path;
      }
      const nueva: HerramientaDJInsert = {
        nombre: nombreNuevo.trim(),
        link_descarga: linkNuevo.trim(),
        descripcion: descripcionNueva.trim() || null,
        imagen_path: imagenPath,
        creado_por: session?.user.id ?? null,
      };
      const { data, error } = await supabase.from("herramientas_dj").insert(nueva).select().single();
      if (error) throw error;
      setHerramientas((prev) => [data as HerramientaDJ, ...prev]);
      setNombreNuevo("");
      setDescripcionNueva("");
      setLinkNuevo("");
      setImagenNueva(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : mensajeErrorAmigable(e));
    } finally {
      setAgregando(false);
    }
  }

  async function borrar(h: HerramientaDJ) {
    setOcupadoId(h.id);
    setError(null);
    try {
      const { error } = await supabase.from("herramientas_dj").delete().eq("id", h.id);
      if (error) throw error;
      setHerramientas((prev) => prev.filter((x) => x.id !== h.id));
    } catch (e) {
      setError(mensajeErrorAmigable(e));
    } finally {
      setOcupadoId(null);
      setConfirmandoBorrarId(null);
    }
  }

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      <div className="bg-card rounded-2xl border border-border-soft p-5 flex flex-col gap-3">
        <h2 className="font-display font-bold text-base m-0">Agregar herramienta</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            type="text"
            value={nombreNuevo}
            onChange={(e) => setNombreNuevo(e.target.value)}
            placeholder="Nombre, ej: Pack de samples"
            className="px-3 py-2 rounded-lg border border-border text-sm bg-cream-soft sm:col-span-2"
          />
          <textarea
            value={descripcionNueva}
            onChange={(e) => setDescripcionNueva(e.target.value)}
            placeholder="Descripción (opcional)"
            rows={2}
            className="px-3 py-2 rounded-lg border border-border text-sm bg-cream-soft sm:col-span-2 resize-none"
          />
          <input
            type="url"
            value={linkNuevo}
            onChange={(e) => setLinkNuevo(e.target.value)}
            placeholder="Link de descarga (https://…)"
            className="px-3 py-2 rounded-lg border border-border text-sm bg-cream-soft sm:col-span-2"
          />
          <label className="flex items-center gap-2 text-sm text-muted cursor-pointer sm:col-span-2">
            <span className="text-xs font-semibold underline text-ink shrink-0">
              {imagenNueva ? imagenNueva.name : "Elegir imagen (opcional)"}
            </span>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setImagenNueva(e.target.files?.[0] ?? null)}
              className="hidden"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={agregar}
          disabled={agregando || !nombreNuevo.trim() || !linkNuevo.trim()}
          className="self-start text-sm font-semibold bg-ink text-cream px-4 py-2 rounded-full appearance-none border-none cursor-pointer disabled:opacity-60"
        >
          {agregando ? "Agregando…" : "+ Agregar"}
        </button>
      </div>

      {error && <p className="text-sm text-accent font-medium m-0">{error}</p>}
      {cargando && <p className="text-sm text-muted m-0">Cargando…</p>}

      <div className="flex flex-col gap-2">
        {herramientas.map((h) => (
          <div key={h.id} className="bg-card rounded-xl border border-border-soft px-4 py-3 flex items-center gap-4">
            <Portada path={h.imagen_path} alt="" className="w-11 h-11 rounded-lg object-cover shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">{h.nombre}</div>
              {h.descripcion && <div className="text-xs text-muted truncate">{h.descripcion}</div>}
            </div>

            {confirmandoBorrarId === h.id ? (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => borrar(h)}
                  disabled={ocupadoId === h.id}
                  className="text-xs font-semibold text-accent appearance-none bg-transparent border-none cursor-pointer disabled:opacity-60"
                >
                  Confirmar
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmandoBorrarId(null)}
                  className="text-xs text-muted hover:text-ink appearance-none bg-transparent border-none cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmandoBorrarId(h.id)}
                className="text-xs font-semibold text-muted hover:text-accent appearance-none bg-transparent border-none cursor-pointer shrink-0"
              >
                Borrar
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// DUPLICADOS
// ============================================================

function DuplicadosTab() {
  const [pendientes, setPendientes] = useState<DuplicadoPendiente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [escaneando, setEscaneando] = useState(false);
  const [resultadoEscaneo, setResultadoEscaneo] = useState<string | null>(null);
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);

  useEffect(() => {
    cargar();
  }, []);

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      setPendientes(await listarDuplicadosPendientes());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : mensajeErrorAmigable(e));
    } finally {
      setCargando(false);
    }
  }

  async function handleEscanear() {
    setEscaneando(true);
    setError(null);
    setResultadoEscaneo(null);
    try {
      const r = await escanearDuplicados();
      setResultadoEscaneo(
        `Analizados ${r.tracks_analizados} tracks · ${r.nuevos_por_fingerprint} nuevos por audio idéntico · ${r.nuevos_por_texto} nuevos por texto parecido.`,
      );
      await cargar();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : mensajeErrorAmigable(e));
    } finally {
      setEscaneando(false);
    }
  }

  async function handleBorrarLado(dup: DuplicadoPendiente, lado: "a" | "b") {
    const track = lado === "a" ? dup.track_a : dup.track_b;
    if (!track) return;
    setOcupadoId(`${dup.id}-${lado}`);
    setError(null);
    try {
      await borrarTrackAdmin(track.id);
      await marcarDuplicado(dup.id, "resuelto");
      setPendientes((prev) => prev.filter((p) => p.id !== dup.id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : mensajeErrorAmigable(e));
    } finally {
      setOcupadoId(null);
    }
  }

  async function handleDescartar(dup: DuplicadoPendiente) {
    setOcupadoId(dup.id);
    setError(null);
    try {
      await marcarDuplicado(dup.id, "descartado");
      setPendientes((prev) => prev.filter((p) => p.id !== dup.id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : mensajeErrorAmigable(e));
    } finally {
      setOcupadoId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <div className="bg-card rounded-2xl border border-border-soft p-5 flex flex-col gap-3">
        <p className="text-sm text-muted m-0">
          El escaneo compara todo el catálogo: audio idéntico (fingerprint) y título/remixer muy
          parecidos. Puede tardar según el tamaño del catálogo.
        </p>
        <button
          type="button"
          onClick={handleEscanear}
          disabled={escaneando}
          className="self-start text-sm font-semibold bg-ink text-cream px-4 py-2 rounded-full appearance-none border-none cursor-pointer disabled:opacity-60"
        >
          {escaneando ? "Escaneando…" : "🔄 Escanear catálogo completo"}
        </button>
        {resultadoEscaneo && <p className="text-sm text-muted m-0">{resultadoEscaneo}</p>}
      </div>

      {error && <p className="text-sm text-accent font-medium m-0">{error}</p>}
      {cargando && <p className="text-sm text-muted m-0">Cargando…</p>}

      {!cargando && (
        <p className="text-sm text-muted m-0">
          {pendientes.length} par{pendientes.length === 1 ? "" : "es"} pendiente{pendientes.length === 1 ? "" : "s"} de revisión
        </p>
      )}

      {pendientes.map((d) => (
        <div key={d.id} className="bg-card rounded-2xl border border-border-soft p-5 flex flex-col gap-4">
          <p className="text-sm font-semibold m-0">
            {d.tipo === "fingerprint_exacto"
              ? "🎵 Audio idéntico"
              : d.tipo === "fingerprint_similar"
                ? `🎵 Audio ${d.similitud}% parecido`
                : `📝 Texto ${d.similitud}% parecido`}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <LadoDuplicado
              track={d.track_a}
              ocupado={ocupadoId === `${d.id}-a`}
              onBorrar={() => handleBorrarLado(d, "a")}
            />
            <LadoDuplicado
              track={d.track_b}
              ocupado={ocupadoId === `${d.id}-b`}
              onBorrar={() => handleBorrarLado(d, "b")}
            />
          </div>

          <button
            type="button"
            onClick={() => handleDescartar(d)}
            disabled={ocupadoId === d.id}
            className="self-start text-sm font-semibold text-muted hover:text-ink appearance-none bg-transparent border-none cursor-pointer disabled:opacity-60"
          >
            ✅ No es duplicado, descartar aviso
          </button>
        </div>
      ))}
    </div>
  );
}

function LadoDuplicado({
  track,
  ocupado,
  onBorrar,
}: {
  track: { id: string; titulo: string; remixer: string | null; fecha_subida: string } | null;
  ocupado: boolean;
  onBorrar: () => void;
}) {
  if (!track) return <div className="text-sm text-muted">Track no disponible.</div>;
  return (
    <div className="flex flex-col gap-1.5 bg-cream rounded-xl p-3">
      <div className="text-sm font-semibold">{track.titulo}</div>
      <div className="text-xs text-muted">{track.remixer || "—"}</div>
      <div className="text-xs text-muted-2">Subido: {formatearFecha(track.fecha_subida)}</div>
      <button
        type="button"
        onClick={onBorrar}
        disabled={ocupado}
        className="self-start mt-1 text-xs font-semibold text-accent appearance-none bg-transparent border-none cursor-pointer disabled:opacity-60"
      >
        {ocupado ? "Borrando…" : "🗑️ Borrar éste"}
      </button>
    </div>
  );
}

// ============================================================
// CATÁLOGO COMPLETO
// ============================================================

interface TrackCompleto {
  id: string;
  titulo: string;
  remixer: string | null;
  genero: string | null;
  bpm: number | null;
  estado: EstadoTrack;
  fecha_subida: string;
  subido_por: string | null;
  perfiles: { nombre_dj: string | null; email: string | null } | null;
}

function CatalogoCompletoTab() {
  const [tracks, setTracks] = useState<TrackCompleto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtroUsuario, setFiltroUsuario] = useState("");

  useEffect(() => {
    (async () => {
      setCargando(true);
      setError(null);
      try {
        const { data, error } = await supabase
          .from("tracks")
          .select("id, titulo, remixer, genero, bpm, estado, fecha_subida, subido_por, perfiles!tracks_subido_por_fkey(nombre_dj, email)")
          .order("fecha_subida", { ascending: false })
          // Mismo motivo que en el límite del Catálogo (ver CatalogoPage):
          // con el crecimiento del catálogo, un tope bajo termina
          // ocultando los tracks más viejos de este panel también.
          .limit(5000);
        if (error) throw error;
        setTracks((data ?? []) as unknown as TrackCompleto[]);
      } catch (e) {
        setError(mensajeErrorAmigable(e));
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  // Quién subió cada track, para la lista desplegable del filtro — se
  // arma de los temas ya cargados en vez de pedir /perfiles aparte, así
  // solo aparecen usuarios que efectivamente subieron algo al catálogo.
  const usuarios = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const t of tracks) {
      if (!t.subido_por) continue;
      mapa.set(t.subido_por, t.perfiles?.nombre_dj || t.perfiles?.email || "(sin nombre)");
    }
    return Array.from(mapa.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [tracks]);

  const tracksFiltrados = filtroUsuario
    ? tracks.filter((t) => t.subido_por === filtroUsuario)
    : tracks;

  if (cargando) return <p className="text-sm text-muted m-0">Cargando…</p>;
  if (error) return <p className="text-sm text-accent font-medium m-0">{error}</p>;

  return (
    <div className="flex flex-col gap-4">
      <ControlSubidasPanel />
      <PeaksPendientesPanel />
      <PortadaPendientesPanel />
      <VolumenPendientesPanel />

      <div className="flex items-center gap-2">
        <label className="text-xs font-semibold text-body">Subido por</label>
        <select
          value={filtroUsuario}
          onChange={(e) => setFiltroUsuario(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-border text-sm bg-cream-soft"
        >
          <option value="">Todos</option>
          {usuarios.map(([id, nombre]) => (
            <option key={id} value={id}>
              {nombre}
            </option>
          ))}
        </select>
        {filtroUsuario && (
          <span className="text-xs text-muted">
            {tracksFiltrados.length} tema{tracksFiltrados.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <div className="bg-card rounded-2xl border border-border-soft overflow-hidden">
        {tracksFiltrados.map((t) => (
          <div key={t.id} className="flex items-center gap-4 px-5 py-3 border-b border-border-soft last:border-b-0">
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-sm truncate">{t.titulo}</div>
              <div className="text-xs text-muted truncate">{t.remixer || "—"}</div>
            </div>
            <div className="hidden md:block text-xs text-muted w-28 shrink-0 truncate">
              {t.perfiles?.nombre_dj || t.perfiles?.email || "—"}
            </div>
            <div className="hidden sm:block text-xs text-muted w-24 shrink-0">{t.genero || "—"}</div>
            <div className="hidden sm:block text-xs text-muted w-16 shrink-0 text-right">
              {formatearBpm(t.bpm)} bpm
            </div>
            <EstadoBadge estado={t.estado} />
            <div className="hidden sm:block text-xs text-muted w-24 shrink-0 text-right">
              {formatearFecha(t.fecha_subida)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Backfill de peaks de waveform (ver audio.py::calcular_peaks) para los
// temas que ya estaban en el catálogo antes de que existiera este
// cálculo. Procesa de a UNO (no en paralelo): cada cálculo corre ffmpeg
// en el backend, y el plan gratis de Render tiene poca memoria — varios
// a la vez competirían entre sí (mismo motivo que en otras partes del
// backend, ver app/audio.py).
function ControlSubidasPanel() {
  const { session } = useAuth();
  const [config, setConfig] = useState<ConfiguracionCatalogo | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    cargar();
  }, []);

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from("configuracion_catalogo")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      setConfig(data as ConfiguracionCatalogo | null);
    } catch (e) {
      setError(mensajeErrorAmigable(e));
    } finally {
      setCargando(false);
    }
  }

  async function alternar() {
    if (!config) return;
    setGuardando(true);
    setError(null);
    try {
      const { error } = await supabase
        .from("configuracion_catalogo")
        .update({
          permite_subida_colaboradores: !config.permite_subida_colaboradores,
          actualizado_por: session?.user.id,
        })
        .eq("id", true);
      if (error) throw error;
      await cargar();
    } catch (e) {
      setError(mensajeErrorAmigable(e));
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) return <p className="text-sm text-muted m-0">Cargando…</p>;

  const habilitado = config?.permite_subida_colaboradores ?? true;

  return (
    <div className="bg-card rounded-2xl border border-border-soft p-5 flex flex-col gap-3">
      <div>
        <p className="font-semibold text-sm m-0">Quién puede subir temas</p>
        <p className="text-sm text-muted m-0">
          {habilitado
            ? "Cualquier suscriptor con cuenta activa puede subir temas. El catálogo se muestra como \"colaborativo\"."
            : "Las subidas quedan cerradas: solo el admin puede subir temas. El botón \"Subir Temas\" se oculta " +
              "para el resto, y si alguien intenta entrar igual, se le pide que mande el tema por el chat."}
        </p>
      </div>

      {error && <p className="text-sm text-accent font-medium m-0">{error}</p>}

      <button
        type="button"
        onClick={alternar}
        disabled={guardando || !config}
        className={`self-start text-sm font-semibold px-4 py-2 rounded-full appearance-none border-none cursor-pointer disabled:opacity-60 ${
          habilitado ? "bg-ink text-cream" : "bg-accent text-white"
        }`}
      >
        {guardando
          ? "Guardando…"
          : habilitado
            ? "Cerrar subidas a suscriptores"
            : "Habilitar subidas a suscriptores"}
      </button>
    </div>
  );
}

function PeaksPendientesPanel() {
  const [pendientes, setPendientes] = useState<TrackPendientePeaks[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [progreso, setProgreso] = useState<{ hechos: number; total: number } | null>(null);
  const [fallidos, setFallidos] = useState<TrackPendientePeaks[]>([]);
  // Texto crudo del último fallo puntual — se muestra en pantalla para
  // poder diagnosticar sin tener que abrir la consola del navegador.
  const [ultimoErrorDetalle, setUltimoErrorDetalle] = useState<string | null>(null);

  useEffect(() => {
    cargar();
  }, []);

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      const { tracks } = await listarPendientesPeaks();
      setPendientes(tracks);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : mensajeErrorAmigable(e));
    } finally {
      setCargando(false);
    }
  }

  async function handleCalcular() {
    setProcesando(true);
    setError(null);
    setFallidos([]);
    setUltimoErrorDetalle(null);
    try {
      // Pide la lista de pendientes DE NUEVO acá (no la que ya tenía la
      // pantalla, que puede estar vieja) — así, si esto se corta a mitad
      // de camino y después se vuelve a apretar el botón (con o sin
      // recargar la página antes), siempre arranca de los que todavía
      // faltan: nunca reprocesa uno que ya quedó con la onda calculada.
      const { tracks: actuales } = await listarPendientesPeaks();
      const fallidosAhora: TrackPendientePeaks[] = [];
      let fallosSeguidos = 0;
      let hechos = 0;
      const total = actuales.length;
      for (hechos = 0; hechos < total; hechos++) {
        const track = actuales[hechos];
        setProgreso({ hechos, total });
        // Pausa chica entre uno y otro — por las dudas sea algún límite
        // de ritmo (R2, Supabase) lo que cortó el lote anterior a los 50;
        // de paso le da margen a Render para no quedar siempre al límite
        // de CPU/memoria del plan gratis con ffmpeg corriendo seguido.
        if (hechos > 0) await new Promise((r) => setTimeout(r, 500));
        try {
          await calcularPeaksTrack(track.id);
          fallosSeguidos = 0;
        } catch (e) {
          fallidosAhora.push(track);
          fallosSeguidos++;
          const detalle = e instanceof ApiError ? e.message : String(e);
          setUltimoErrorDetalle(`"${track.titulo}": ${detalle}`);
          console.error(`No se pudo calcular peaks de "${track.titulo}" (${track.id}):`, e);
          // 5 fallos seguidos probablemente es el servidor caído o
          // reiniciándose, no temas puntuales con problemas — mejor
          // cortar acá con un aviso claro que seguir machacando pedidos
          // que van a seguir fallando igual.
          if (fallosSeguidos >= 5) {
            setError(
              "Se cortó después de 5 fallos seguidos (puede que el servidor esté reiniciándose) — " +
                "esperá un poco y volvé a apretar el botón, retoma de donde quedó.",
            );
            hechos++;
            break;
          }
        }
      }
      setProgreso({ hechos, total });
      setFallidos(fallidosAhora);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : mensajeErrorAmigable(e));
    } finally {
      setProcesando(false);
      await cargar();
    }
  }

  if (cargando) return <p className="text-sm text-muted m-0">Revisando temas pendientes de onda rápida…</p>;

  // Ya está todo al día: no vale la pena ocupar lugar en pantalla con un
  // panel vacío para esto el resto del tiempo.
  if (!cargando && pendientes.length === 0 && !progreso) return null;

  return (
    <div className="bg-card rounded-2xl border border-border-soft p-5 flex flex-col gap-3">
      <div>
        <p className="font-semibold text-sm m-0">Arranque rápido del player (peaks de waveform)</p>
        <p className="text-sm text-muted m-0">
          Temas subidos antes de este cambio que todavía no tienen la onda precalculada — sin eso,
          tardan más en arrancar a sonar. Los temas nuevos ya la calculan solos al subirlos.
        </p>
      </div>

      {error && <p className="text-sm text-accent font-medium m-0">{error}</p>}
      {ultimoErrorDetalle && (
        <p className="text-xs text-muted font-mono m-0 break-words">Último fallo: {ultimoErrorDetalle}</p>
      )}

      {pendientes.length > 0 && (
        <button
          type="button"
          onClick={handleCalcular}
          disabled={procesando}
          className="self-start text-sm font-semibold bg-ink text-cream px-4 py-2 rounded-full appearance-none border-none cursor-pointer disabled:opacity-60"
        >
          {procesando
            ? `Calculando… ${progreso?.hechos ?? 0}/${progreso?.total ?? pendientes.length}`
            : `⚡ Calcular peaks pendientes (${pendientes.length})`}
        </button>
      )}

      {!procesando && progreso && (
        <p className="text-sm text-muted m-0">
          Listo: {progreso.hechos - fallidos.length} de {progreso.total} calculados.
          {fallidos.length > 0 && ` ${fallidos.length} fallaron (${fallidos.map((f) => f.titulo).join(", ")}).`}
        </p>
      )}
    </div>
  );
}

function PortadaPendientesPanel() {
  const [pendientes, setPendientes] = useState<TrackPendientePortada[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [progreso, setProgreso] = useState<{ hechos: number; total: number } | null>(null);
  const [fallidos, setFallidos] = useState<TrackPendientePortada[]>([]);
  const [ultimoErrorDetalle, setUltimoErrorDetalle] = useState<string | null>(null);

  useEffect(() => {
    cargar();
  }, []);

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      const { tracks } = await listarPendientesPortadaGenerica();
      setPendientes(tracks);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : mensajeErrorAmigable(e));
    } finally {
      setCargando(false);
    }
  }

  async function handleFijar() {
    setProcesando(true);
    setError(null);
    setFallidos([]);
    setUltimoErrorDetalle(null);
    try {
      // Mismo motivo que en PeaksPendientesPanel: pide la lista de
      // pendientes DE NUEVO acá, así si esto se corta a mitad de camino
      // y se vuelve a apretar el botón, retoma de los que faltan nada
      // más (nunca reprocesa uno que ya quedó con la genérica grabada).
      const { tracks: actuales } = await listarPendientesPortadaGenerica();
      const fallidosAhora: TrackPendientePortada[] = [];
      let fallosSeguidos = 0;
      let hechos = 0;
      const total = actuales.length;
      for (hechos = 0; hechos < total; hechos++) {
        const track = actuales[hechos];
        setProgreso({ hechos, total });
        if (hechos > 0) await new Promise((r) => setTimeout(r, 500));
        try {
          await fijarPortadaGenericaTrack(track.id);
          fallosSeguidos = 0;
        } catch (e) {
          fallidosAhora.push(track);
          fallosSeguidos++;
          const detalle = e instanceof ApiError ? e.message : String(e);
          setUltimoErrorDetalle(`"${track.titulo}": ${detalle}`);
          console.error(`No se pudo fijar la portada genérica de "${track.titulo}" (${track.id}):`, e);
          if (fallosSeguidos >= 5) {
            setError(
              "Se cortó después de 5 fallos seguidos (puede que el servidor esté reiniciándose) — " +
                "esperá un poco y volvé a apretar el botón, retoma de donde quedó.",
            );
            hechos++;
            break;
          }
        }
      }
      setProgreso({ hechos, total });
      setFallidos(fallidosAhora);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : mensajeErrorAmigable(e));
    } finally {
      setProcesando(false);
      await cargar();
    }
  }

  if (cargando) return <p className="text-sm text-muted m-0">Revisando temas pendientes de portada…</p>;

  // Ya está todo al día: no vale la pena ocupar lugar en pantalla con un
  // panel vacío para esto el resto del tiempo.
  if (!cargando && pendientes.length === 0 && !progreso) return null;

  return (
    <div className="bg-card rounded-2xl border border-border-soft p-5 flex flex-col gap-3">
      <div>
        <p className="font-semibold text-sm m-0">Portada de PLAYLIST grabada en el archivo</p>
        <p className="text-sm text-muted m-0">
          Temas subidos con "no mantener carátula original" antes de que esa elección también se
          grabara en el MP3 — el catálogo ya mostraba la portada genérica, pero el archivo real
          seguía con la carátula vieja. No toca temas con carátula propia guardada.
        </p>
      </div>

      {error && <p className="text-sm text-accent font-medium m-0">{error}</p>}
      {ultimoErrorDetalle && (
        <p className="text-xs text-muted font-mono m-0 break-words">Último fallo: {ultimoErrorDetalle}</p>
      )}

      {pendientes.length > 0 && (
        <button
          type="button"
          onClick={handleFijar}
          disabled={procesando}
          className="self-start text-sm font-semibold bg-ink text-cream px-4 py-2 rounded-full appearance-none border-none cursor-pointer disabled:opacity-60"
        >
          {procesando
            ? `Grabando… ${progreso?.hechos ?? 0}/${progreso?.total ?? pendientes.length}`
            : `🖼️ Grabar portada pendiente (${pendientes.length})`}
        </button>
      )}

      {!procesando && progreso && (
        <p className="text-sm text-muted m-0">
          Listo: {progreso.hechos - fallidos.length} de {progreso.total} grabados.
          {fallidos.length > 0 && ` ${fallidos.length} fallaron (${fallidos.map((f) => f.titulo).join(", ")}).`}
        </p>
      )}
    </div>
  );
}

function VolumenPendientesPanel() {
  const [pendientes, setPendientes] = useState<TrackPendienteVolumen[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [progreso, setProgreso] = useState<{ hechos: number; total: number } | null>(null);
  const [fallidos, setFallidos] = useState<TrackPendienteVolumen[]>([]);
  const [ultimoErrorDetalle, setUltimoErrorDetalle] = useState<string | null>(null);

  useEffect(() => {
    cargar();
  }, []);

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      const { tracks } = await listarPendientesVolumen();
      setPendientes(tracks);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : mensajeErrorAmigable(e));
    } finally {
      setCargando(false);
    }
  }

  async function handleNivelar() {
    setProcesando(true);
    setError(null);
    setFallidos([]);
    setUltimoErrorDetalle(null);
    try {
      // Mismo motivo que en los otros paneles de backfill: pide la lista
      // de pendientes DE NUEVO acá, así si esto se corta a mitad de
      // camino y se vuelve a apretar el botón, retoma de los que faltan
      // nada más (nunca reprocesa uno que ya quedó nivelado).
      const { tracks: actuales } = await listarPendientesVolumen();
      const fallidosAhora: TrackPendienteVolumen[] = [];
      let fallosSeguidos = 0;
      let hechos = 0;
      const total = actuales.length;
      for (hechos = 0; hechos < total; hechos++) {
        const track = actuales[hechos];
        setProgreso({ hechos, total });
        // Acá cada tema de por sí tarda más que en peaks/portada (baja
        // de R2, reencodea el audio entero, vuelve a subir) — la pausa
        // es la misma igual, le da margen a Render entre una corrida de
        // ffmpeg y la siguiente en el plan gratis.
        if (hechos > 0) await new Promise((r) => setTimeout(r, 500));
        try {
          await nivelarVolumenTrack(track.id);
          fallosSeguidos = 0;
        } catch (e) {
          fallidosAhora.push(track);
          fallosSeguidos++;
          const detalle = e instanceof ApiError ? e.message : String(e);
          setUltimoErrorDetalle(`"${track.titulo}": ${detalle}`);
          console.error(`No se pudo nivelar el volumen de "${track.titulo}" (${track.id}):`, e);
          if (fallosSeguidos >= 5) {
            setError(
              "Se cortó después de 5 fallos seguidos (puede que el servidor esté reiniciándose) — " +
                "esperá un poco y volvé a apretar el botón, retoma de donde quedó.",
            );
            hechos++;
            break;
          }
        }
      }
      setProgreso({ hechos, total });
      setFallidos(fallidosAhora);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : mensajeErrorAmigable(e));
    } finally {
      setProcesando(false);
      await cargar();
    }
  }

  if (cargando) return <p className="text-sm text-muted m-0">Revisando temas pendientes de nivelado de volumen…</p>;

  // Ya está todo al día: no vale la pena ocupar lugar en pantalla con un
  // panel vacío para esto el resto del tiempo.
  if (!cargando && pendientes.length === 0 && !progreso) return null;

  return (
    <div className="bg-card rounded-2xl border border-border-soft p-5 flex flex-col gap-3">
      <div>
        <p className="font-semibold text-sm m-0">Nivelado de volumen (−14 LUFS)</p>
        <p className="text-sm text-muted m-0">
          Temas subidos antes de que existiera el nivelado automático de volumen — quedaron con el
          volumen que traía el archivo original. Esto los baja, los reencodea a MP3 320 ya nivelados
          y los vuelve a subir (tarda más por tema que los otros backfills). Los temas nuevos ya se
          nivelan solos al subirlos.
        </p>
      </div>

      {error && <p className="text-sm text-accent font-medium m-0">{error}</p>}
      {ultimoErrorDetalle && (
        <p className="text-xs text-muted font-mono m-0 break-words">Último fallo: {ultimoErrorDetalle}</p>
      )}

      {pendientes.length > 0 && (
        <button
          type="button"
          onClick={handleNivelar}
          disabled={procesando}
          className="self-start text-sm font-semibold bg-ink text-cream px-4 py-2 rounded-full appearance-none border-none cursor-pointer disabled:opacity-60"
        >
          {procesando
            ? `Nivelando… ${progreso?.hechos ?? 0}/${progreso?.total ?? pendientes.length}`
            : `🔊 Nivelar volumen pendiente (${pendientes.length})`}
        </button>
      )}

      {!procesando && progreso && (
        <p className="text-sm text-muted m-0">
          Listo: {progreso.hechos - fallidos.length} de {progreso.total} nivelados.
          {fallidos.length > 0 && ` ${fallidos.length} fallaron (${fallidos.map((f) => f.titulo).join(", ")}).`}
        </p>
      )}
    </div>
  );
}

function EstadoBadge({ estado }: { estado: EstadoTrack }) {
  const estilos: Record<EstadoTrack, string> = {
    activo: "bg-accent-lime text-ink-fixed",
    duplicado_sospechoso: "bg-accent/10 text-accent",
    eliminado: "bg-border text-muted",
  };
  return (
    <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${estilos[estado]}`}>{estado}</span>
  );
}

// ============================================================
// SUSCRIPCIÓN (precio/CBU + revisión de transferencias manuales)
// ============================================================

interface PagoPendiente extends Pago {
  perfiles: {
    nombre_dj: string | null;
    email: string | null;
    tipo_licencia: TipoLicencia;
    tipo_licencia_solicitada: TipoLicencia | null;
  } | null;
}

function SuscripcionAdminTab() {
  const { session } = useAuth();

  const [config, setConfig] = useState<ConfiguracionSuscripcion | null>(null);
  const [edicion, setEdicion] = useState<ConfiguracionSuscripcionUpdate>({});
  const [cargandoConfig, setCargandoConfig] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [errorConfig, setErrorConfig] = useState<string | null>(null);

  const [pendientes, setPendientes] = useState<PagoPendiente[]>([]);
  const [cargandoPendientes, setCargandoPendientes] = useState(true);
  const [errorPendientes, setErrorPendientes] = useState<string | null>(null);
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);

  useEffect(() => {
    cargarConfig();
    cargarPendientes();
  }, []);

  async function cargarConfig() {
    setCargandoConfig(true);
    setErrorConfig(null);
    try {
      const { data, error } = await supabase
        .from("configuracion_suscripcion")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      const fila = data as ConfiguracionSuscripcion | null;
      setConfig(fila);
      setEdicion(fila ?? {});
    } catch (e) {
      setErrorConfig(mensajeErrorAmigable(e));
    } finally {
      setCargandoConfig(false);
    }
  }

  async function cargarPendientes() {
    setCargandoPendientes(true);
    setErrorPendientes(null);
    try {
      const { data, error } = await supabase
        .from("pagos")
        .select("*, perfiles(nombre_dj, email, tipo_licencia, tipo_licencia_solicitada)")
        .eq("tipo", "manual")
        .eq("estado", "pendiente")
        .order("fecha");
      if (error) throw error;
      setPendientes((data ?? []) as unknown as PagoPendiente[]);
    } catch (e) {
      setErrorPendientes(mensajeErrorAmigable(e));
    } finally {
      setCargandoPendientes(false);
    }
  }

  const huboCambios =
    config != null &&
    (Object.keys(edicion) as (keyof ConfiguracionSuscripcionUpdate)[]).some(
      (k) => edicion[k] !== config[k],
    );

  async function guardarConfig() {
    setGuardando(true);
    setErrorConfig(null);
    try {
      const { error } = await supabase
        .from("configuracion_suscripcion")
        .update({ ...edicion, actualizado_por: session?.user.id })
        .eq("id", true);
      if (error) throw error;
      await cargarConfig();
    } catch (e) {
      setErrorConfig(mensajeErrorAmigable(e));
    } finally {
      setGuardando(false);
    }
  }

  async function handleAprobar(p: PagoPendiente) {
    setOcupadoId(p.id);
    setErrorPendientes(null);
    try {
      const { error: errorPago } = await supabase
        .from("pagos")
        .update({ estado: "aprobado", confirmado_por: session?.user.id })
        .eq("id", p.id);
      if (errorPago) throw errorPago;

      if (p.usuario_id) {
        // Si el usuario pidió una licencia (tipo_licencia_solicitada,
        // elegida en su página de Suscripción — ver
        // sql/022_precios_por_licencia.sql), se la otorgamos acá al
        // activar; si nunca eligió nada, se deja tipo_licencia como
        // estaba. El admin siempre puede corregirla después en Usuarios.
        const actualizacion: { estado_suscripcion: "activo"; tipo_licencia?: TipoLicencia } = {
          estado_suscripcion: "activo",
        };
        if (p.perfiles?.tipo_licencia_solicitada) {
          actualizacion.tipo_licencia = p.perfiles.tipo_licencia_solicitada;
        }
        const { error: errorPerfil } = await supabase
          .from("perfiles")
          .update(actualizacion)
          .eq("id", p.usuario_id);
        if (errorPerfil) throw errorPerfil;
      }

      setPendientes((prev) => prev.filter((x) => x.id !== p.id));
    } catch (e) {
      setErrorPendientes(mensajeErrorAmigable(e));
    } finally {
      setOcupadoId(null);
    }
  }

  async function handleRechazar(p: PagoPendiente) {
    setOcupadoId(p.id);
    setErrorPendientes(null);
    try {
      const { error } = await supabase
        .from("pagos")
        .update({ estado: "rechazado", confirmado_por: session?.user.id })
        .eq("id", p.id);
      if (error) throw error;
      setPendientes((prev) => prev.filter((x) => x.id !== p.id));
    } catch (e) {
      setErrorPendientes(mensajeErrorAmigable(e));
    } finally {
      setOcupadoId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <section className="bg-card rounded-2xl border border-border-soft p-5 flex flex-col gap-4">
        <h2 className="font-display font-bold text-lg m-0">Precio y datos de cobro</h2>
        {cargandoConfig && <p className="text-sm text-muted m-0">Cargando…</p>}
        {errorConfig && <p className="text-sm text-accent font-medium m-0">{errorConfig}</p>}

        {config && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Campo etiqueta="Precio mensual — Simple (solo escucha)">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={edicion.precio_mensual_simple ?? ""}
                  onChange={(e) =>
                    setEdicion((prev) => ({ ...prev, precio_mensual_simple: Number(e.target.value) }))
                  }
                  className="px-3 py-2 rounded-lg border border-border text-sm bg-cream-soft w-full"
                />
              </Campo>
              <Campo etiqueta="Precio mensual — DJ (con descarga y carga)">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={edicion.precio_mensual_dj ?? ""}
                  onChange={(e) =>
                    setEdicion((prev) => ({ ...prev, precio_mensual_dj: Number(e.target.value) }))
                  }
                  className="px-3 py-2 rounded-lg border border-border text-sm bg-cream-soft w-full"
                />
              </Campo>
              <Campo etiqueta="Moneda">
                <input
                  type="text"
                  value={edicion.moneda ?? ""}
                  onChange={(e) => setEdicion((prev) => ({ ...prev, moneda: e.target.value }))}
                  className="px-3 py-2 rounded-lg border border-border text-sm bg-cream-soft w-full"
                />
              </Campo>
              <Campo etiqueta="CBU/CVU">
                <input
                  type="text"
                  value={edicion.cbu_cvu ?? ""}
                  onChange={(e) => setEdicion((prev) => ({ ...prev, cbu_cvu: e.target.value }))}
                  className="px-3 py-2 rounded-lg border border-border text-sm bg-cream-soft w-full"
                />
              </Campo>
              <Campo etiqueta="Alias">
                <input
                  type="text"
                  value={edicion.alias_cbu ?? ""}
                  onChange={(e) => setEdicion((prev) => ({ ...prev, alias_cbu: e.target.value }))}
                  className="px-3 py-2 rounded-lg border border-border text-sm bg-cream-soft w-full"
                />
              </Campo>
              <Campo etiqueta="Titular de la cuenta">
                <input
                  type="text"
                  value={edicion.titular_cuenta ?? ""}
                  onChange={(e) => setEdicion((prev) => ({ ...prev, titular_cuenta: e.target.value }))}
                  className="px-3 py-2 rounded-lg border border-border text-sm bg-cream-soft w-full"
                />
              </Campo>
            </div>

            <label className="flex items-center gap-3 text-sm font-medium cursor-pointer">
              <button
                type="button"
                role="switch"
                aria-checked={Boolean(edicion.mp_habilitado)}
                onClick={() =>
                  setEdicion((prev) => ({ ...prev, mp_habilitado: !prev.mp_habilitado }))
                }
                className={`relative w-10 h-6 rounded-full transition-colors appearance-none border-none cursor-pointer shrink-0 ${
                  edicion.mp_habilitado ? "bg-accent-lime" : "bg-border"
                }`}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    edicion.mp_habilitado ? "translate-x-[18px]" : "translate-x-0.5"
                  }`}
                />
              </button>
              Habilitar pago automático con Mercado Pago
            </label>

            {!edicion.mp_habilitado && (
              <p className="text-xs text-muted-2 m-0">
                Mientras esto esté apagado, los miembros solo van a ver la opción de transferencia
                manual en la página de Suscripción.
              </p>
            )}

            {huboCambios && (
              <button
                type="button"
                onClick={guardarConfig}
                disabled={guardando}
                className="self-start text-sm font-semibold bg-ink text-cream px-4 py-2 rounded-full appearance-none border-none cursor-pointer disabled:opacity-60"
              >
                {guardando ? "Guardando…" : "Guardar cambios"}
              </button>
            )}
          </>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display font-bold text-lg m-0">Transferencias pendientes de revisión</h2>
        {cargandoPendientes && <p className="text-sm text-muted m-0">Cargando…</p>}
        {errorPendientes && <p className="text-sm text-accent font-medium m-0">{errorPendientes}</p>}
        {!cargandoPendientes && pendientes.length === 0 && !errorPendientes && (
          <p className="text-sm text-muted m-0">No hay avisos pendientes.</p>
        )}

        {pendientes.map((p) => (
          <div key={p.id} className="bg-card rounded-2xl border border-border-soft p-4 flex flex-wrap items-center gap-4">
            <div className="min-w-[160px] flex-1">
              <div className="font-semibold text-sm">{p.perfiles?.nombre_dj || p.perfiles?.email || "—"}</div>
              {p.comentario && <div className="text-xs text-muted">{p.comentario}</div>}
              <div className="text-xs text-muted-2">{formatearFecha(p.fecha)}</div>
            </div>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-cream-soft border border-border-soft shrink-0">
              {p.perfiles?.tipo_licencia_solicitada
                ? `Pidió: ${p.perfiles.tipo_licencia_solicitada === "dj" ? "DJ" : "Simple"}`
                : "No eligió licencia"}
            </span>
            {config && (
              <span className="text-sm font-semibold shrink-0">
                {formatearMonto(
                  (p.perfiles?.tipo_licencia_solicitada ?? p.perfiles?.tipo_licencia) === "dj"
                    ? config.precio_mensual_dj
                    : config.precio_mensual_simple,
                  config.moneda,
                )}
              </span>
            )}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleAprobar(p)}
                disabled={ocupadoId === p.id}
                className="text-sm font-semibold bg-accent-lime text-ink-fixed px-4 py-1.5 rounded-full appearance-none border-none cursor-pointer disabled:opacity-60"
              >
                {ocupadoId === p.id ? "…" : "Aprobar"}
              </button>
              <button
                type="button"
                onClick={() => handleRechazar(p)}
                disabled={ocupadoId === p.id}
                className="text-sm font-semibold text-accent appearance-none bg-transparent border-none cursor-pointer disabled:opacity-60"
              >
                Rechazar
              </button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

function Campo({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-muted">
      {etiqueta}
      {children}
    </label>
  );
}

// ============================================================
// USO Y COSTOS (balance de Cloudflare R2)
// ============================================================

function UsoTab() {
  return (
    <div className="max-w-2xl flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h3 className="text-base font-semibold m-0">Cloudflare R2 (archivos subidos)</h3>
        <SeccionCloudflare />
      </section>
      <section className="flex flex-col gap-3">
        <h3 className="text-base font-semibold m-0">Render (ancho de banda del backend)</h3>
        <SeccionRender />
      </section>
    </div>
  );
}

function SeccionCloudflare() {
  const [balance, setBalance] = useState<BalanceCloudflare | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    cargar();
  }, []);

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      setBalance(await obtenerBalanceCloudflare());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : mensajeErrorAmigable(e));
    } finally {
      setCargando(false);
    }
  }

  if (cargando) return <p className="text-sm text-muted m-0">Cargando…</p>;
  if (error) return <p className="text-sm text-accent font-medium m-0">{error}</p>;
  if (!balance) return null;

  if (!balance.configurado) {
    return (
      <div className="bg-card rounded-2xl border border-border-soft p-5 flex flex-col gap-4">
        <p className="text-sm font-semibold m-0">{balance.mensaje}</p>
        <p className="text-sm text-muted m-0">
          Para que este panel pueda leer los números reales de Cloudflare (storage, lecturas,
          escrituras y costo), hace falta un token de solo lectura — tres pasos:
        </p>
        <ol className="text-sm text-muted m-0 pl-5 flex flex-col gap-1.5 list-decimal">
          <li>
            En{" "}
            <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noreferrer" className="text-ink underline">
              dash.cloudflare.com → Mi perfil → API Tokens
            </a>
            , tocá <strong>Create Token → Create Custom Token</strong>.
          </li>
          <li>
            Le ponés un nombre (ej. "PLAYLIST - solo lectura") y en Permisos elegís{" "}
            <strong>Account → Account Analytics → Read</strong> — nada más, no necesita poder
            escribir ni borrar nada.
          </li>
          <li>
            En Account Resources dejás <strong>Include → tu cuenta</strong>, creás el token y
            copiás el valor (solo se muestra esa vez).
          </li>
          <li>
            En Render, en el servicio <strong>clubpack-api → Environment</strong>, agregás una
            variable nueva: Key <code className="bg-cream px-1 rounded">CLOUDFLARE_API_TOKEN</code>
            , Value el token que copiaste, y guardás — Render vuelve a desplegar solo.
          </li>
        </ol>
        <button
          type="button"
          onClick={cargar}
          className="self-start text-sm font-semibold bg-ink text-cream px-4 py-2 rounded-full appearance-none border-none cursor-pointer"
        >
          Ya lo configuré, volver a intentar
        </button>
      </div>
    );
  }

  const costoTotal = balance.costo_total_usd ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-muted m-0">
          Período en curso: {balance.periodo_desde} – {balance.periodo_hasta}
        </p>
        <p className="text-sm font-semibold m-0">
          Costo estimado del mes: <span className="text-base">USD {costoTotal.toFixed(2)}</span>
        </p>
      </div>

      {balance.storage && (
        <TarjetaUso
          etiqueta="Storage (todo lo guardado)"
          item={balance.storage}
          unidad="GB"
          decimales={2}
          tarifaExcedente="USD 0,015 / GB excedente"
        />
      )}
      {balance.operaciones_a && (
        <TarjetaUso
          etiqueta="Subidas y otras escrituras (Clase A)"
          item={balance.operaciones_a}
          unidad="operaciones"
          decimales={0}
          tarifaExcedente="USD 4,50 / millón excedente"
        />
      )}
      {balance.operaciones_b && (
        <TarjetaUso
          etiqueta="Escuchas y descargas (Clase B)"
          item={balance.operaciones_b}
          unidad="operaciones"
          decimales={0}
          tarifaExcedente="USD 0,36 / millón excedente"
        />
      )}

      <p className="text-xs text-muted-2 m-0">
        El tráfico de salida (los bytes de audio en sí, al escuchar o descargar) no tiene costo en
        R2 — por eso no aparece como límite acá. Los números se actualizan cada pocos minutos, no
        al instante.
      </p>
    </div>
  );
}

const CLAVE_NOTA_PAGO_RENDER = "clubpack.admin.notaPagoRender";

function SeccionRender() {
  const [balance, setBalance] = useState<BalanceRender | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nota, setNota] = useState("");
  const [notaGuardada, setNotaGuardada] = useState(false);

  useEffect(() => {
    cargar();
    try {
      setNota(localStorage.getItem(CLAVE_NOTA_PAGO_RENDER) ?? "");
    } catch {
      // Privado/bloqueado: la nota simplemente no persiste, no rompe nada.
    }
  }, []);

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      setBalance(await obtenerBalanceRender());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : mensajeErrorAmigable(e));
    } finally {
      setCargando(false);
    }
  }

  function guardarNota(valor: string) {
    setNota(valor);
    setNotaGuardada(false);
    try {
      if (valor.trim()) localStorage.setItem(CLAVE_NOTA_PAGO_RENDER, valor);
      else localStorage.removeItem(CLAVE_NOTA_PAGO_RENDER);
      setNotaGuardada(true);
    } catch {
      // Privado/bloqueado: no se pudo guardar, seguimos sin romper la pantalla.
    }
  }

  if (cargando) return <p className="text-sm text-muted m-0">Cargando…</p>;
  if (error) return <p className="text-sm text-accent font-medium m-0">{error}</p>;
  if (!balance) return null;

  if (!balance.configurado) {
    return (
      <div className="bg-card rounded-2xl border border-border-soft p-5 flex flex-col gap-4">
        <p className="text-sm font-semibold m-0">{balance.mensaje}</p>
        <ol className="text-sm text-muted m-0 pl-5 flex flex-col gap-1.5 list-decimal">
          <li>
            En{" "}
            <a href="https://dashboard.render.com/settings#api-keys" target="_blank" rel="noreferrer" className="text-ink underline">
              Render → Account Settings → API Keys
            </a>
            , tocá <strong>Create API key</strong> y copiá el valor (solo se muestra esa vez).
          </li>
          <li>
            Andá al servicio <strong>clubpack-api</strong> y copiá su Service ID de la URL del
            dashboard (empieza con <code className="bg-cream px-1 rounded">srv-</code>).
          </li>
          <li>
            En el grupo de variables de entorno del backend, agregá{" "}
            <code className="bg-cream px-1 rounded">RENDER_API_KEY</code> y{" "}
            <code className="bg-cream px-1 rounded">RENDER_SERVICE_ID</code> con esos dos valores,
            y guardá — Render vuelve a desplegar solo.
          </li>
        </ol>
        <button
          type="button"
          onClick={cargar}
          className="self-start text-sm font-semibold bg-ink text-cream px-4 py-2 rounded-full appearance-none border-none cursor-pointer"
        >
          Ya lo configuré, volver a intentar
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted m-0">
        Período en curso: {balance.periodo_desde} – {balance.periodo_hasta}
      </p>

      {balance.bandwidth && (
        <TarjetaUso
          etiqueta="Ancho de banda de salida"
          item={balance.bandwidth}
          unidad="GB"
          decimales={2}
          tarifaExcedente="USD 0,15 / GB excedente"
        />
      )}

      <p className="text-xs text-muted-2 m-0">
        Este número es de Render, no de PLAYLIST — el plan gratis (Hobby) incluye 5 GB de ancho de
        banda de salida por mes, compartido entre todos los servicios de tu cuenta de Render; al
        superarlo, Render empieza a cobrar. Se actualiza cada pocos minutos.
      </p>

      <div className="bg-card rounded-2xl border border-border-soft p-4 flex flex-col gap-2">
        <label className="text-xs font-semibold text-muted" htmlFor="nota-pago-render">
          Nota de pago (opcional — si ya pagaste un excedente, anotalo acá)
        </label>
        <input
          id="nota-pago-render"
          type="text"
          value={nota}
          onChange={(e) => guardarNota(e.target.value)}
          placeholder="ej: pagué USD 2,30 el 05/11/2026"
          className="text-sm bg-cream border border-border-soft rounded-lg px-3 py-2"
        />
        <p className="text-xs text-muted-2 m-0">
          Esto es solo un recordatorio tuyo: se guarda en este navegador, no en la base de datos —
          no se sincroniza con otro dispositivo ni lo ve nadie más. Render no expone por API si ya
          te cobró o no; eso se ve en su sección de Billing.{notaGuardada && " Guardado."}
        </p>
      </div>
    </div>
  );
}

function TarjetaUso({
  etiqueta,
  item,
  unidad,
  decimales,
  tarifaExcedente,
}: {
  etiqueta: string;
  item: ItemUso;
  unidad: string;
  decimales: number;
  /** Precio por unidad una vez agotado el límite gratis, ej. "USD 0,015 / GB excedente". */
  tarifaExcedente: string;
}) {
  const porcentaje = Math.max(0, item.porcentaje);
  const anchoBarra = Math.min(100, porcentaje);
  const cerca = porcentaje >= 80;

  return (
    <div className="bg-card rounded-2xl border border-border-soft p-5 flex flex-col gap-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-sm font-semibold">{etiqueta}</span>
        <span className="text-xs text-muted text-right">
          {item.usado.toLocaleString("es-AR", { maximumFractionDigits: decimales })} / {" "}
          {item.limite_gratis.toLocaleString("es-AR")} {unidad} gratis
          <span className="text-muted-2"> · {tarifaExcedente}</span>
        </span>
      </div>

      <div className="h-2 rounded-full bg-border overflow-hidden">
        <div
          className={`h-full rounded-full transition-[width] ${cerca ? "bg-accent" : "bg-accent-lime"}`}
          style={{ width: `${anchoBarra}%` }}
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-2">{porcentaje.toFixed(1)}% del límite gratis usado</span>
        <span className={`text-xs font-semibold ${item.costo_usd > 0 ? "text-accent" : "text-muted-2"}`}>
          {item.costo_usd > 0 ? `+ USD ${item.costo_usd.toFixed(2)} este mes` : "Sin costo todavía"}
        </span>
      </div>
    </div>
  );
}
