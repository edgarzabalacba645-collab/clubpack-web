import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";
import BotonTema from "./BotonTema";

const navLinkBase =
  "text-sm font-medium px-3 py-2 rounded-lg transition-colors no-underline";

function navLinkClass({ isActive }: { isActive: boolean }) {
  return isActive
    ? `${navLinkBase} bg-ink text-cream`
    : `${navLinkBase} text-muted hover:text-ink`;
}

export default function AppShell() {
  const { perfil, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-cream text-ink font-sans flex flex-col">
      <header className="max-w-[1240px] w-full mx-auto px-6 pt-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-baseline gap-0.5 font-display font-extrabold text-[22px] tracking-[-0.5px] leading-none">
          <span>CLUB</span>
          <span>PACK</span>
        </div>

        <nav className="flex items-center gap-1 flex-wrap">
          <NavLink to="/catalogo" className={navLinkClass}>
            Catálogo
          </NavLink>
          <NavLink to="/subir" className={navLinkClass}>
            Subir track
          </NavLink>
          <NavLink to="/playlists" className={navLinkClass}>
            Playlists
          </NavLink>
          <NavLink to="/chat" className={navLinkClass}>
            Chat
          </NavLink>
          <NavLink to="/herramientas" className={navLinkClass}>
            Herramientas DJ
          </NavLink>
          <NavLink to="/cuenta" className={navLinkClass}>
            Mi cuenta
          </NavLink>
          <NavLink to="/suscripcion" className={navLinkClass}>
            Suscripción
          </NavLink>
          {perfil?.rol === "admin" && (
            <NavLink to="/admin" className={navLinkClass}>
              Admin
            </NavLink>
          )}
        </nav>

        <div className="flex items-center gap-3">
          <span className="text-sm text-muted hidden sm:inline">
            {perfil?.nombre_dj ?? perfil?.email}
          </span>
          <BotonTema />
          <button
            type="button"
            onClick={() => void signOut()}
            className="text-sm font-semibold px-4 py-2 rounded-lg border border-border hover:border-ink transition-colors appearance-none bg-transparent cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
          >
            Salir
          </button>
        </div>
      </header>

      <main className="max-w-[1240px] w-full mx-auto px-6 py-10 flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-border-soft mt-6">
        <div className="max-w-[1240px] mx-auto px-6 py-6 flex flex-wrap gap-2 justify-between text-sm text-muted-2">
          <div>ClubPack — hecho por DJs, para DJs.</div>
          <div>Catálogo cerrado · uso privado del grupo</div>
        </div>
      </footer>
    </div>
  );
}
