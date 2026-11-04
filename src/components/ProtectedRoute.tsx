import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";

function PantallaCargando() {
  return (
    <div className="min-h-screen bg-cream flex items-center justify-center">
      <div className="font-display font-extrabold text-lg tracking-[-0.5px] text-ink">
        CLUBPACK
      </div>
    </div>
  );
}

/** Requiere sesión iniciada. Si no hay, manda a /. */
export function RutaProtegida() {
  const { session, cargando } = useAuth();
  if (cargando) return <PantallaCargando />;
  if (!session) return <Navigate to="/" replace />;
  return <Outlet />;
}

/** Requiere además rol admin. Asume que ya está dentro de RutaProtegida. */
export function RutaAdmin() {
  const { perfil, cargando } = useAuth();
  if (cargando) return <PantallaCargando />;
  if (perfil && perfil.rol !== "admin") return <Navigate to="/catalogo" replace />;
  return <Outlet />;
}
