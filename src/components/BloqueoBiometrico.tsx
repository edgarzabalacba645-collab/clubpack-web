import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "../lib/auth";
import { biometriaActivada, desactivarBiometria, verificarBiometria } from "../lib/biometria";

function PantallaCargando() {
  return (
    <div className="min-h-screen bg-cream flex items-center justify-center">
      <div className="font-display font-extrabold text-lg tracking-[-0.5px] text-ink">
        PLAYLIST
      </div>
    </div>
  );
}

function IconoCandado() {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="text-ink"
    >
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

/**
 * Envuelve toda la app ya logueada (ver ProtectedRoute.tsx): si este
 * usuario activó el bloqueo biométrico en ESTE dispositivo (Mi Cuenta),
 * no deja ver nada hasta confirmar huella/rostro — dispara el diálogo
 * nativo solo, apenas se sabe que hace falta. Si no lo activó, pasa
 * directo sin pedir nada (comportamiento de siempre).
 *
 * Alcance a propósito acotado a "pedir al abrir la app": esto chequea
 * una sola vez por carga de la app (por montaje de este componente),
 * no vuelve a pedir si la pestaña pasa a segundo plano y vuelve sin
 * que la app se haya cerrado del todo — eso sería un paso más (volver
 * a bloquear al reanudar), que no es lo que se pidió por ahora.
 */
export function BloqueoBiometrico({ children }: { children: ReactNode }) {
  const { session, signOut } = useAuth();
  const userId = session?.user.id ?? null;

  // null = todavía no se decidió si hace falta bloquear.
  const [desbloqueado, setDesbloqueado] = useState<boolean | null>(null);
  const [verificando, setVerificando] = useState(false);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    if (!userId) return;
    setDesbloqueado(biometriaActivada(userId) ? false : true);
  }, [userId]);

  async function intentar(idUsuario: string) {
    setVerificando(true);
    setFallo(false);
    const ok = await verificarBiometria(idUsuario);
    setVerificando(false);
    if (ok) setDesbloqueado(true);
    else setFallo(true);
  }

  useEffect(() => {
    // Apenas se sabe que hace falta bloquear, dispara el diálogo nativo
    // solo — así el usuario no tiene que tocar nada para que aparezca,
    // como cualquier app con bloqueo de huella/rostro.
    if (desbloqueado === false && userId) {
      intentar(userId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desbloqueado, userId]);

  if (!userId || desbloqueado === null) return <PantallaCargando />;
  if (desbloqueado) return <>{children}</>;

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center p-6">
      <div className="max-w-xs w-full flex flex-col items-center gap-5 text-center">
        <div className="font-display font-extrabold text-xl tracking-[-0.5px] text-ink">
          PLAYLIST
        </div>
        <IconoCandado />
        <div className="flex flex-col gap-1">
          <p className="font-semibold text-ink m-0">
            {verificando
              ? "Verificando…"
              : fallo
                ? "No se pudo confirmar"
                : "Desbloqueá con tu huella o rostro"}
          </p>
          {fallo && (
            <p className="text-sm text-muted m-0">Cancelaste o no coincidió. Probá de nuevo.</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => intentar(userId)}
          disabled={verificando}
          className="text-sm font-semibold bg-ink text-cream px-5 py-2.5 rounded-full appearance-none border-none cursor-pointer disabled:opacity-60"
        >
          {verificando ? "..." : fallo ? "Reintentar" : "Desbloquear"}
        </button>
        <button
          type="button"
          onClick={() => signOut()}
          className="text-xs font-semibold text-muted underline appearance-none bg-transparent border-none cursor-pointer"
        >
          Cerrar sesión
        </button>
        {/* Salida de emergencia: si la verificación falla siempre (ej. se
            resetearon las huellas del celular, o cambió algo del lado
            del sistema operativo), sin esto la persona quedaría
            encerrada afuera de su propia app sin forma de entrar ni
            para desactivar la traba — ni siquiera cerrando sesión y
            volviendo a entrar, porque esto es por dispositivo, no por
            sesión. Solo aparece después de un intento fallido, no de
            entrada, para no ser un atajo obvio que invite a saltearse
            el bloqueo sin ni probar la huella. */}
        {fallo && userId && (
          <button
            type="button"
            onClick={() => {
              desactivarBiometria(userId);
              setDesbloqueado(true);
            }}
            className="text-xs text-muted underline appearance-none bg-transparent border-none cursor-pointer"
          >
            No puedo desbloquear — desactivar este bloqueo en este dispositivo
          </button>
        )}
      </div>
    </div>
  );
}
