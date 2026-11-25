import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth, esLicenciaDj } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { formatearFecha, mensajeErrorAmigable, rotuloEstadoSuscripcion } from "../lib/format";
import type { PerfilUpdate } from "../lib/types";
import {
  activarBiometria,
  biometriaActivada,
  biometriaDisponible,
  desactivarBiometria,
  mensajeErrorBiometria,
} from "../lib/biometria";
import { activarPush, desactivarPush, mensajeErrorPush, pushActivado, pushDisponible } from "../lib/push";

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
  const { session, perfil, recargarPerfil } = useAuth();

  const [editandoNombre, setEditandoNombre] = useState(false);
  const [nombreDj, setNombreDj] = useState("");
  const [guardandoNombre, setGuardandoNombre] = useState(false);
  const [errorNombre, setErrorNombre] = useState<string | null>(null);

  const [misTracks, setMisTracks] = useState<TrackSubido[]>([]);
  const [cargandoTracks, setCargandoTracks] = useState(true);
  const [errorTracks, setErrorTracks] = useState<string | null>(null);

  const [misDescargas, setMisDescargas] = useState<DescargaFila[]>([]);
  const [cargandoDescargas, setCargandoDescargas] = useState(true);
  const [errorDescargas, setErrorDescargas] = useState<string | null>(null);

  // null mientras se chequea si este dispositivo soporta biometría.
  const [biometriaDisp, setBiometriaDisp] = useState<boolean | null>(null);
  const [biometriaOn, setBiometriaOn] = useState(false);
  const [cambiandoBiometria, setCambiandoBiometria] = useState(false);
  const [errorBiometria, setErrorBiometria] = useState<string | null>(null);

  const [pushOn, setPushOn] = useState(false);
  const [cambiandoPush, setCambiandoPush] = useState(false);
  const [errorPush, setErrorPush] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    setBiometriaOn(biometriaActivada(session.user.id));
    biometriaDisponible().then(setBiometriaDisp);
    pushActivado().then(setPushOn);
  }, [session]);

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

  async function alternarBiometria() {
    if (!session) return;
    setErrorBiometria(null);
    setCambiandoBiometria(true);
    try {
      if (biometriaOn) {
        desactivarBiometria(session.user.id);
        setBiometriaOn(false);
      } else {
        const nombreMostrado = perfil?.nombre_dj || session.user.email || "Usuario PLAYLIST";
        await activarBiometria(session.user.id, nombreMostrado);
        setBiometriaOn(true);
      }
    } catch (e) {
      setErrorBiometria(
        biometriaOn ? "No se pudo desactivar. Probá de nuevo." : `No se pudo activar. ${mensajeErrorBiometria(e)}`,
      );
    } finally {
      setCambiandoBiometria(false);
    }
  }

  async function alternarPush() {
    if (!session) return;
    setErrorPush(null);
    setCambiandoPush(true);
    try {
      if (pushOn) {
        await desactivarPush();
        setPushOn(false);
      } else {
        await activarPush(session.user.id);
        setPushOn(true);
      }
    } catch (e) {
      setErrorPush(pushOn ? "No se pudo desactivar. Probá de nuevo." : mensajeErrorPush(e));
    } finally {
      setCambiandoPush(false);
    }
  }

  function empezarEdicionNombre() {
    setNombreDj(perfil?.nombre_dj ?? "");
    setErrorNombre(null);
    setEditandoNombre(true);
  }

  async function guardarNombreDj(e: FormEvent) {
    e.preventDefault();
    if (!session) return;
    const valor = nombreDj.trim();
    if (!valor) {
      setErrorNombre("Poné algún nombre.");
      return;
    }
    setGuardandoNombre(true);
    setErrorNombre(null);
    try {
      const cambios: PerfilUpdate = { nombre_dj: valor };
      const { error } = await supabase.from("perfiles").update(cambios).eq("id", session.user.id);
      if (error) throw error;
      await recargarPerfil();
      setEditandoNombre(false);
    } catch (e) {
      setErrorNombre(mensajeErrorAmigable(e));
    } finally {
      setGuardandoNombre(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display font-extrabold text-3xl tracking-[-0.5px] m-0">Mi cuenta</h1>

      <div className="max-w-xl flex flex-col gap-6 w-full">
      <div className="bg-card rounded-2xl p-6 flex flex-col gap-3 border border-border-soft">
        {editandoNombre ? (
          <form onSubmit={guardarNombreDj} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted font-medium shrink-0">DJ</span>
            <div className="flex items-center gap-2 flex-1 justify-end">
              <input
                autoFocus
                value={nombreDj}
                onChange={(e) => setNombreDj(e.target.value)}
                placeholder="Tu nombre de DJ"
                maxLength={40}
                className="min-w-0 flex-1 px-2.5 py-1.5 rounded-lg border-[1.5px] border-border text-sm font-semibold bg-[color:var(--color-cream-soft)] focus:outline-2 focus:outline-accent focus:outline-offset-1"
              />
              <button
                type="submit"
                disabled={guardandoNombre}
                className="text-xs font-semibold bg-ink text-cream px-3 py-1.5 rounded-full appearance-none border-none cursor-pointer disabled:opacity-60 shrink-0"
              >
                {guardandoNombre ? "..." : "Guardar"}
              </button>
              <button
                type="button"
                onClick={() => setEditandoNombre(false)}
                disabled={guardandoNombre}
                className="text-xs font-semibold text-muted hover:text-ink appearance-none bg-transparent border-none cursor-pointer shrink-0"
              >
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="text-muted font-medium">DJ</span>
            <span className="flex items-center gap-2">
              <span className="font-semibold">{perfil?.nombre_dj ?? "—"}</span>
              <button
                type="button"
                onClick={empezarEdicionNombre}
                className="text-xs font-semibold underline text-ink appearance-none bg-transparent border-none cursor-pointer"
              >
                Editar
              </button>
            </span>
          </div>
        )}
        {errorNombre && <p className="text-xs text-accent font-medium m-0 text-right">{errorNombre}</p>}
        <Fila etiqueta="Email" valor={perfil?.email ?? "—"} />
        <div className="flex items-center justify-between gap-4 text-sm">
          <span className="text-muted font-medium">Suscripción</span>
          <span
            className={`font-semibold px-2.5 py-1 rounded-full text-xs ${
              suscripcionOk ? "bg-accent-lime text-ink-fixed" : "bg-accent/10 text-accent"
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

      {/* Bloqueo biométrico: a pedido de Edgar, para que si alguien
          agarra el celular y abre la app instalada, no pueda entrar sin
          la huella/rostro del dueño. Es por DISPOSITIVO — hay que
          activarlo de nuevo en cada celular/navegador donde se use (ver
          lib/biometria.ts para el detalle de cómo funciona). */}
      {biometriaDisp !== false && (
        <div className="bg-card rounded-2xl p-6 flex flex-col gap-2 border border-border-soft">
          <div className="flex items-center justify-between gap-4 text-sm">
            <div className="flex flex-col gap-0.5">
              <span className="font-semibold text-ink">Bloqueo con huella/rostro</span>
              <span className="text-xs text-muted">
                Pedir huella o rostro al abrir la app en este dispositivo.
              </span>
            </div>
            <button
              type="button"
              onClick={alternarBiometria}
              disabled={biometriaDisp === null || cambiandoBiometria}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full appearance-none border-none cursor-pointer shrink-0 disabled:opacity-60 ${
                biometriaOn ? "bg-accent/10 text-accent" : "bg-ink text-cream"
              }`}
            >
              {cambiandoBiometria ? "..." : biometriaOn ? "Desactivar" : "Activar"}
            </button>
          </div>
          {errorBiometria && <p className="text-xs text-accent font-medium m-0">{errorBiometria}</p>}
        </div>
      )}

      {/* Notificaciones push: avisa en este dispositivo (como cualquier
          notificación del celular, aunque la app esté cerrada o la
          pantalla bloqueada) cuando alguien te arroba (@) en el chat
          de comunidad. Es por DISPOSITIVO, igual que la biometría de
          arriba — hay que activarla de nuevo en cada celular/navegador
          donde se quiera recibir (ver lib/push.ts). */}
      {pushDisponible() && (
        <div className="bg-card rounded-2xl p-6 flex flex-col gap-2 border border-border-soft">
          <div className="flex items-center justify-between gap-4 text-sm">
            <div className="flex flex-col gap-0.5">
              <span className="font-semibold text-ink">Notificaciones</span>
              <span className="text-xs text-muted">Avisarme en este dispositivo cuando me arroben (@) en el chat.</span>
            </div>
            <button
              type="button"
              onClick={alternarPush}
              disabled={cambiandoPush}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full appearance-none border-none cursor-pointer shrink-0 disabled:opacity-60 ${
                pushOn ? "bg-accent/10 text-accent" : "bg-ink text-cream"
              }`}
            >
              {cambiandoPush ? "..." : pushOn ? "Desactivar" : "Activar"}
            </button>
          </div>
          {errorPush && <p className="text-xs text-accent font-medium m-0">{errorPush}</p>}
        </div>
      )}

      {/* Licencia Simple no sube temas (sql/019_tipo_licencia.sql) — esta
          sección no le aporta nada, directamente no se dibuja. */}
      {esLicenciaDj(perfil) && (
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
      )}

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
