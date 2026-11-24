import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { BloqueoBiometrico } from "./BloqueoBiometrico";

function PantallaCargando() {
  return (
    <div className="min-h-screen bg-cream flex items-center justify-center">
      <div className="font-display font-extrabold text-lg tracking-[-0.5px] text-ink">
        PLAYLIST
      </div>
    </div>
  );
}

/**
 * Requiere sesión iniciada. Si no hay, manda a /.
 *
 * Además, si el usuario activó el bloqueo biométrico en este
 * dispositivo (ver BloqueoBiometrico.tsx y Mi Cuenta), no deja pasar
 * al resto de la app sin confirmar huella/rostro primero.
 */
export function RutaProtegida() {
  const { session, cargando } = useAuth();
  if (cargando) return <PantallaCargando />;
  if (!session) return <Navigate to="/" replace />;
  return (
    <BloqueoBiometrico>
      <Outlet />
    </BloqueoBiometrico>
  );
}

/** Requiere además rol admin. Asume que ya está dentro de RutaProtegida. */
export function RutaAdmin() {
  const { perfil, cargando } = useAuth();
  if (cargando) return <PantallaCargando />;
  if (perfil && perfil.rol !== "admin") return <Navigate to="/catalogo" replace />;
  return <Outlet />;
}
