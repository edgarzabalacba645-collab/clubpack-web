import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import {
  ApiError,
  borrarTrackAdmin,
  calcularPeaksTrack,
  escanearDuplicados,
  listarDuplicadosPendientes,
  listarPendientesPeaks,
  marcarDuplicado,
  obtenerBalanceCloudflare,
  subirImagenHerramienta,
  type BalanceCloudflare,
  type DuplicadoPendiente,
  type ItemUsoCloudflare,
  type TrackPendientePeaks,
} from "../lib/api";
import { formatearBpm, formatearFecha, formatearMonto, mensajeErrorAmigable } from "../lib/format";
import type {
  ConfiguracionSuscripcion,
  ConfiguracionSuscripcionUpdate,
  EstadoSuscripcion,
  EstadoTrack,
  Genero,
  GeneroInsert,
  HerramientaDJ,
  HerramientaDJInsert,
  Pago,
  Perfil,
  Rol,
} from "../lib/types";
import Portada from "../components/Portada";

// Top 50 ya no vive acá — ahora es su propia página (/top50), visible
// para cualquier miembro y no solo para admins (ver Top50Page.tsx y
// sql/007_top50_para_todos.sql).
type Tab = "usuarios" | "generos" | "herramientas" | "duplicados" | "catalogo" | "suscripcion" | "uso";

const TABS: { id: Tab; etiqueta: string }[] = [
  { id: "usuarios", etiqueta: "Usuarios" },
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

function UsuariosTab() {
  const [usuarios, setUsuarios] = useState<Perfil[]>([]);
  const [ediciones, setEdiciones] = useState<Record<string, { rol: Rol; estado_suscripcion: EstadoSuscripcion }>>({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardandoId, setGuardandoId] = useState<string | null>(null);

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
          lista.map((u) => [u.id, { rol: u.rol, estado_suscripcion: u.estado_suscripcion }]),
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
        .update({ rol: edicion.rol, estado_suscripcion: edicion.estado_suscripcion })
        .eq("id", u.id);
      if (error) throw error;
      setUsuarios((prev) =>
        prev.map((p) => (p.id === u.id ? { ...p, rol: edicion.rol, estado_suscripcion: edicion.estado_suscripcion } : p)),
      );
    } catch (e) {
      setError(mensajeErrorAmigable(e));
    } finally {
      setGuardandoId(null);
    }
  }

  if (cargando) return <p className="text-sm text-muted m-0">Cargando…</p>;

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <p className="text-sm text-muted m-0">
        Cambia el estado a mano — para pagos reales (Mercado Pago o transferencias) usá la pestaña
        Suscripción, que mantiene esto sincronizado solo.
      </p>
      {error && <p className="text-sm text-accent font-medium m-0">{error}</p>}

      {usuarios.map((u) => {
        const edicion = ediciones[u.id] ?? { rol: u.rol, estado_suscripcion: u.estado_suscripcion };
        const huboCambios = edicion.rol !== u.rol || edicion.estado_suscripcion !== u.estado_suscripcion;
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
      setGeneros((data ?? []) as Genero[]);
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
      setGeneros((prev) => [...prev, data as Genero]);
      setNombreNuevo("");
    } catch (e) {
      setError(mensajeErrorAmigable(e));
    } finally {
      setAgregando(false);
    }
  }

  async function toggleActivo(g: Genero) {
    setOcupadoId(g.id);
    setError(null);
    try {
      const { error } = await supabase.from("generos").update({ activo: !g.activo }).eq("id", g.id);
      if (error) throw error;
      setGeneros((prev) => prev.map((x) => (x.id === g.id ? { ...x, activo: !g.activo } : x)));
    } catch (e) {
      setError(mensajeErrorAmigable(e));
    } finally {
      setOcupadoId(null);
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
          className="flex-1 px-3 py-2 rounded-lg border border-border text-sm bg-cream-soft"
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
            <span className="flex-1 text-sm font-medium">{g.nombre}</span>

            <button
              type="button"
              onClick={() => toggleActivo(g)}
              disabled={ocupadoId === g.id}
              aria-label={g.activo ? "Desactivar género" : "Activar género"}
              className={`relative w-10 h-6 rounded-full transition-colors appearance-none border-none cursor-pointer shrink-0 disabled:opacity-60 ${
                g.activo ? "bg-accent-lime" : "bg-border"
              }`}
            >
              <span
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  g.activo ? "translate-x-[18px]" : "translate-x-0.5"
                }`}
              />
            </button>

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
            {d.tipo === "fingerprint_exacto" ? "🎵 Audio idéntico" : `📝 Texto ${d.similitud}% parecido`}
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
          .select("id, titulo, remixer, genero, bpm, estado, fecha_subida, subido_por, perfiles(nombre_dj, email)")
          .order("fecha_subida", { ascending: false })
          .limit(500);
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
      <PeaksPendientesPanel />

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
  perfiles: { nombre_dj: string | null; email: string | null } | null;
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
        .select("*, perfiles(nombre_dj, email)")
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
        const { error: errorPerfil } = await supabase
          .from("perfiles")
          .update({ estado_suscripcion: "activo" })
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
              <Campo etiqueta="Precio mensual">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={edicion.precio_mensual ?? ""}
                  onChange={(e) =>
                    setEdicion((prev) => ({ ...prev, precio_mensual: Number(e.target.value) }))
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
            {config && <span className="text-sm font-semibold shrink-0">{formatearMonto(config.precio_mensual, config.moneda)}</span>}
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
      <div className="max-w-2xl bg-card rounded-2xl border border-border-soft p-5 flex flex-col gap-4">
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
            Le ponés un nombre (ej. "ClubPack - solo lectura") y en Permisos elegís{" "}
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
    <div className="max-w-2xl flex flex-col gap-4">
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

function TarjetaUso({
  etiqueta,
  item,
  unidad,
  decimales,
  tarifaExcedente,
}: {
  etiqueta: string;
  item: ItemUsoCloudflare;
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
