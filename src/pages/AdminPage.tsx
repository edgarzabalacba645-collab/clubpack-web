import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import {
  ApiError,
  borrarTrackAdmin,
  escanearDuplicados,
  listarDuplicadosPendientes,
  marcarDuplicado,
  subirImagenHerramienta,
  type DuplicadoPendiente,
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
type Tab = "usuarios" | "generos" | "herramientas" | "duplicados" | "catalogo" | "suscripcion";

const TABS: { id: Tab; etiqueta: string }[] = [
  { id: "usuarios", etiqueta: "Usuarios" },
  { id: "generos", etiqueta: "Géneros" },
  { id: "herramientas", etiqueta: "Herramientas DJ" },
  { id: "duplicados", etiqueta: "Duplicados" },
  { id: "catalogo", etiqueta: "Catálogo completo" },
  { id: "suscripcion", etiqueta: "Suscripción" },
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
}

function CatalogoCompletoTab() {
  const [tracks, setTracks] = useState<TrackCompleto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setCargando(true);
      setError(null);
      try {
        const { data, error } = await supabase
          .from("tracks")
          .select("id, titulo, remixer, genero, bpm, estado, fecha_subida")
          .order("fecha_subida", { ascending: false })
          .limit(500);
        if (error) throw error;
        setTracks((data ?? []) as TrackCompleto[]);
      } catch (e) {
        setError(mensajeErrorAmigable(e));
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  if (cargando) return <p className="text-sm text-muted m-0">Cargando…</p>;
  if (error) return <p className="text-sm text-accent font-medium m-0">{error}</p>;

  return (
    <div className="bg-card rounded-2xl border border-border-soft overflow-hidden">
      {tracks.map((t) => (
        <div key={t.id} className="flex items-center gap-4 px-5 py-3 border-b border-border-soft last:border-b-0">
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-sm truncate">{t.titulo}</div>
            <div className="text-xs text-muted truncate">{t.remixer || "—"}</div>
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
