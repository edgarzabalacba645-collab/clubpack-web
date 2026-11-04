import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { ApiError, crearSuscripcionMP } from "../lib/api";
import {
  formatearFecha,
  formatearMonto,
  mensajeErrorAmigable,
  rotuloEstadoSuscripcion,
} from "../lib/format";
import type {
  ConfiguracionSuscripcion,
  Pago,
  PagoManualInsert,
} from "../lib/types";

export default function SuscripcionPage() {
  const { session, perfil, recargarPerfil } = useAuth();
  const [params] = useSearchParams();
  const volviendoDeMp = params.get("resultado") === "mp";

  const [config, setConfig] = useState<ConfiguracionSuscripcion | null>(null);
  const [cargandoConfig, setCargandoConfig] = useState(true);
  const [errorConfig, setErrorConfig] = useState<string | null>(null);

  const [misPagos, setMisPagos] = useState<Pago[]>([]);
  const [cargandoPagos, setCargandoPagos] = useState(true);

  const [creandoMp, setCreandoMp] = useState(false);
  const [errorMp, setErrorMp] = useState<string | null>(null);
  const [linkMp, setLinkMp] = useState<{ init_point: string } | null>(null);

  const [comentarioManual, setComentarioManual] = useState("");
  const [enviandoManual, setEnviandoManual] = useState(false);
  const [errorManual, setErrorManual] = useState<string | null>(null);
  const [avisoEnviado, setAvisoEnviado] = useState(false);

  async function cargarPagos() {
    if (!session) return;
    setCargandoPagos(true);
    const { data, error } = await supabase
      .from("pagos")
      .select("*")
      .eq("usuario_id", session.user.id)
      .order("fecha", { ascending: false })
      .limit(20);
    if (!error) setMisPagos((data ?? []) as Pago[]);
    setCargandoPagos(false);
  }

  useEffect(() => {
    (async () => {
      setCargandoConfig(true);
      try {
        const { data, error } = await supabase
          .from("configuracion_suscripcion")
          .select("*")
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        setConfig((data ?? null) as ConfiguracionSuscripcion | null);
      } catch (e) {
        setErrorConfig(mensajeErrorAmigable(e));
      } finally {
        setCargandoConfig(false);
      }
    })();

    void cargarPagos();

    // Si volvemos del checkout de Mercado Pago, el webhook puede tardar
    // unos segundos en activar la suscripción — refrescamos el perfil para
    // mostrar el estado real en vez de asumir nada.
    if (volviendoDeMp) {
      void recargarPerfil();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, volviendoDeMp]);

  async function handlePagarMp() {
    setErrorMp(null);
    setCreandoMp(true);
    try {
      const resultado = await crearSuscripcionMP();
      setLinkMp({ init_point: resultado.init_point });
    } catch (e) {
      setErrorMp(e instanceof ApiError ? e.message : mensajeErrorAmigable(e));
    } finally {
      setCreandoMp(false);
    }
  }

  async function handleAvisarManual() {
    if (!session) return;
    setErrorManual(null);
    setEnviandoManual(true);
    try {
      const fila: PagoManualInsert = {
        usuario_id: session.user.id,
        tipo: "manual",
        estado: "pendiente",
        comentario: comentarioManual.trim() || null,
      };
      const { error } = await supabase.from("pagos").insert(fila);
      if (error) throw error;
      setAvisoEnviado(true);
      setComentarioManual("");
      void cargarPagos();
    } catch (e) {
      setErrorManual(mensajeErrorAmigable(e));
    } finally {
      setEnviandoManual(false);
    }
  }

  const estado = perfil?.estado_suscripcion;
  const suscripcionOk = estado === "activo" || perfil?.rol === "admin";
  const tieneDatosManuales = Boolean(config?.cbu_cvu || config?.alias_cbu);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display font-extrabold text-3xl tracking-[-0.5px] m-0">Suscripción</h1>

      <div className="max-w-xl flex flex-col gap-6 w-full">
      {volviendoDeMp && (
        <p className="text-sm bg-accent-lime/30 border border-accent-lime rounded-xl px-4 py-3 m-0">
          Volviste de Mercado Pago. Si autorizaste el pago, la activación puede tardar unos segundos
          (el aviso nos llega por webhook) — actualizá esta página si tu estado todavía no cambió.
        </p>
      )}

      <div className="bg-card rounded-2xl p-6 flex items-center justify-between gap-4 border border-border-soft">
        <span className="text-sm text-muted font-medium">Tu suscripción</span>
        <span
          className={`font-semibold px-2.5 py-1 rounded-full text-xs ${
            suscripcionOk ? "bg-accent-lime text-ink" : "bg-accent/10 text-accent"
          }`}
        >
          {rotuloEstadoSuscripcion(estado)}
        </span>
      </div>

      {cargandoConfig && <p className="text-sm text-muted">Cargando precio y datos de pago…</p>}
      {errorConfig && <p className="text-sm text-accent">{errorConfig}</p>}

      {config && (
        <>
          <section className="bg-card rounded-2xl p-6 border border-border-soft flex flex-col gap-2">
            <h2 className="font-display font-bold text-lg m-0">Precio</h2>
            <p className="text-2xl font-extrabold m-0">
              {formatearMonto(config.precio_mensual, config.moneda)}{" "}
              <span className="text-sm font-medium text-muted">/ mes</span>
            </p>
          </section>

          {config.mp_habilitado && (
            <section className="bg-card rounded-2xl p-6 border border-border-soft flex flex-col gap-4">
              <h2 className="font-display font-bold text-lg m-0">Pagar con Mercado Pago</h2>
              <p className="text-sm text-muted m-0">
                Autorizás un cobro mensual recurrente — podés cancelarlo cuando quieras desde tu
                cuenta de Mercado Pago.
              </p>

              {!linkMp && (
                <button
                  type="button"
                  onClick={() => void handlePagarMp()}
                  disabled={creandoMp}
                  className="self-start px-5 py-2.5 rounded-lg bg-ink text-cream text-sm font-semibold disabled:opacity-50 cursor-pointer"
                >
                  {creandoMp ? "Generando…" : "Pagar con Mercado Pago"}
                </button>
              )}

              {errorMp && <p className="text-sm text-accent m-0">{errorMp}</p>}

              {linkMp && (
                <div className="flex flex-wrap items-start gap-6">
                  <div className="bg-white p-3 rounded-xl border border-border-soft">
                    <QRCodeSVG value={linkMp.init_point} size={168} />
                  </div>
                  <div className="flex flex-col gap-2 max-w-xs">
                    <p className="text-sm text-muted m-0">
                      Escaneá el QR desde la app de Mercado Pago, o abrí el link directamente:
                    </p>
                    <a
                      href={linkMp.init_point}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-semibold underline text-ink"
                    >
                      Abrir Mercado Pago →
                    </a>
                  </div>
                </div>
              )}
            </section>
          )}

          {tieneDatosManuales && (
            <section className="bg-card rounded-2xl p-6 border border-border-soft flex flex-col gap-4">
              <h2 className="font-display font-bold text-lg m-0">O por transferencia</h2>
              <div className="flex flex-col gap-2 text-sm">
                {config.cbu_cvu && <Fila etiqueta="CBU/CVU" valor={config.cbu_cvu} />}
                {config.alias_cbu && <Fila etiqueta="Alias" valor={config.alias_cbu} />}
                {config.titular_cuenta && <Fila etiqueta="Titular" valor={config.titular_cuenta} />}
              </div>

              {!avisoEnviado ? (
                <div className="flex flex-col gap-3">
                  <textarea
                    value={comentarioManual}
                    onChange={(e) => setComentarioManual(e.target.value)}
                    placeholder="Opcional: fecha de la transferencia, últimos dígitos, lo que le sirva al admin para encontrarla."
                    rows={2}
                    className="rounded-lg border border-border-soft px-3 py-2 text-sm resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
                  />
                  {errorManual && <p className="text-sm text-accent m-0">{errorManual}</p>}
                  <button
                    type="button"
                    onClick={() => void handleAvisarManual()}
                    disabled={enviandoManual}
                    className="self-start px-5 py-2.5 rounded-lg border border-ink text-sm font-semibold disabled:opacity-50 cursor-pointer"
                  >
                    {enviandoManual ? "Enviando…" : "Ya transferí, avisar a un admin"}
                  </button>
                </div>
              ) : (
                <p className="text-sm bg-accent-lime/30 border border-accent-lime rounded-xl px-4 py-3 m-0">
                  Listo, le avisamos a los admins. Mientras lo revisan tu suscripción queda en
                  "Pendiente de activación".
                </p>
              )}
            </section>
          )}

          {!config.mp_habilitado && !tieneDatosManuales && (
            <p className="text-sm text-muted">
              Todavía no hay ninguna forma de pago configurada — hablá con un admin del grupo.
            </p>
          )}
        </>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="font-display font-bold text-lg m-0">Tus pagos</h2>
        <div className="bg-card rounded-2xl border border-border-soft overflow-hidden">
          {cargandoPagos && <div className="px-5 py-6 text-sm text-center text-muted">Cargando…</div>}
          {!cargandoPagos && misPagos.length === 0 && (
            <div className="px-5 py-6 text-sm text-center text-muted">Todavía no hay pagos registrados.</div>
          )}
          {!cargandoPagos &&
            misPagos.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-4 px-5 py-3 border-b border-border-soft last:border-b-0 text-sm"
              >
                <div className="min-w-0">
                  <div className="font-semibold">
                    {p.tipo === "mercadopago" ? "Mercado Pago" : "Transferencia manual"}
                    {" — "}
                    <EstadoPagoBadge estado={p.estado} />
                  </div>
                  {p.comentario && <div className="text-xs text-muted truncate">{p.comentario}</div>}
                </div>
                <div className="flex flex-col items-end shrink-0">
                  {p.monto != null && <span className="font-semibold">{formatearMonto(p.monto, p.moneda)}</span>}
                  <span className="text-xs text-muted">{formatearFecha(p.fecha)}</span>
                </div>
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
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted font-medium">{etiqueta}</span>
      <span className="font-semibold">{valor}</span>
    </div>
  );
}

function EstadoPagoBadge({ estado }: { estado: string | null }) {
  const texto = estado ?? "pendiente";
  const ok = texto === "approved" || texto === "aprobado";
  return (
    <span className={`text-xs font-medium ${ok ? "text-accent-lime" : "text-muted"}`}>{texto}</span>
  );
}
