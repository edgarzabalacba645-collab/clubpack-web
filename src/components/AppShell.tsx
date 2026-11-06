import { useState, type FormEvent, type ReactNode } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import BotonTema from "./BotonTema";

/* Iconos de línea simple, consistentes con los que ya usa LoginPage.tsx
   (stroke="currentColor", 2px, redondeados) — así el sidebar nuevo no
   introduce un segundo lenguaje visual de iconografía. */

function IconLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="12" fill="currentColor" />
      <path
        d="M7 14.5v-3a5 5 0 0 1 10 0v3"
        stroke="var(--color-ink)"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <rect x="5.3" y="13.3" width="2.6" height="4.4" rx="1.3" fill="var(--color-ink)" />
      <rect x="16.1" y="13.3" width="2.6" height="4.4" rx="1.3" fill="var(--color-ink)" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

function IconUpload() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 16V4M12 4 7 9M12 4l5 5" />
      <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

function IconHome() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6 10v9a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9" />
    </svg>
  );
}

function IconPlaylist() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M4 7h12M4 12h12M4 17h7" />
      <circle cx="19" cy="16" r="2.4" />
      <path d="M21.4 16V8l-3 .9" />
    </svg>
  );
}

function IconChat() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a7 7 0 0 1-10.3 6.2L4 19l1-5A7 7 0 1 1 21 12Z" />
    </svg>
  );
}

function IconTools() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14.5 6.5a3 3 0 0 0 4 4L14 15l-3 3-3.5-3.5 3-3 4.5-4.5a3 3 0 0 0-4 4L5.5 16.5a2 2 0 0 0 2.8 2.8L13 14.6" />
    </svg>
  );
}

function IconUser() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M4.8 19.5a7.2 7.2 0 0 1 14.4 0" />
    </svg>
  );
}

function IconCard() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5.5" width="18" height="13" rx="2.2" />
      <path d="M3 10h18" />
    </svg>
  );
}

function IconShield() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3.5 19 6.5v5c0 5-3 8-7 9-4-1-7-4-7-9v-5Z" />
      <path d="M9.3 12.2l1.8 1.8 3.6-3.6" />
    </svg>
  );
}

function IconMenu() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

const navItems: { to: string; label: string; icon: ReactNode }[] = [
  { to: "/catalogo", label: "Catálogo", icon: <IconHome /> },
  { to: "/playlists", label: "Playlists", icon: <IconPlaylist /> },
  { to: "/chat", label: "Comunidad", icon: <IconChat /> },
  { to: "/herramientas", label: "Herramientas DJ", icon: <IconTools /> },
  { to: "/cuenta", label: "Mi cuenta", icon: <IconUser /> },
  { to: "/suscripcion", label: "Suscripción", icon: <IconCard /> },
];

function sidebarLinkClass({ isActive }: { isActive: boolean }) {
  return [
    "flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold no-underline transition-colors",
    isActive
      ? "bg-accent/12 text-accent"
      : "text-body hover:bg-cream hover:text-ink",
  ].join(" ");
}

export default function AppShell() {
  const { perfil, signOut } = useAuth();
  const navigate = useNavigate();
  const [busqueda, setBusqueda] = useState("");
  const [sidebarAbierto, setSidebarAbierto] = useState(false);

  function buscar(e: FormEvent) {
    e.preventDefault();
    navigate(`/catalogo${busqueda.trim() ? `?q=${encodeURIComponent(busqueda.trim())}` : ""}`);
    setSidebarAbierto(false);
  }

  const inicial = (perfil?.nombre_dj || perfil?.email || "DJ").trim().charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-cream text-ink font-sans">
      {/* Header fijo arriba, ancho completo */}
      <header className="sticky top-0 z-30 bg-card border-b border-border-soft">
        <div className="px-4 sm:px-6 h-16 flex items-center gap-3 sm:gap-5">
          <button
            type="button"
            onClick={() => setSidebarAbierto((v) => !v)}
            aria-label="Abrir menú"
            className="lg:hidden shrink-0 w-9 h-9 rounded-lg flex items-center justify-center appearance-none bg-transparent border-none cursor-pointer text-body"
          >
            {sidebarAbierto ? <IconClose /> : <IconMenu />}
          </button>

          <NavLink to="/catalogo" className="flex items-center gap-2.5 no-underline text-ink shrink-0">
            <span className="w-8 h-8 rounded-full bg-ink text-card flex items-center justify-center shrink-0">
              <IconLogo />
            </span>
            <span className="hidden sm:flex flex-col leading-none">
              <span className="font-display font-extrabold text-[17px] tracking-[-0.3px]">ClubPack</span>
              <span className="text-[11px] text-muted font-medium mt-0.5">Compartí. Mezclá. Disfrutá.</span>
            </span>
          </NavLink>

          <form onSubmit={buscar} className="flex-1 max-w-md hidden md:block">
            <label className="relative block">
              <span className="sr-only">Buscar en el catálogo</span>
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-2">
                <IconSearch />
              </span>
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por título, remixer, artista…"
                className="w-full pl-10 pr-3 py-2.5 rounded-full border border-border bg-cream text-sm focus:outline-2 focus:outline-accent"
              />
            </label>
          </form>

          <div className="flex-1 md:hidden" />

          <NavLink
            to="/subir"
            className="shrink-0 hidden sm:inline-flex items-center gap-2 bg-accent text-white text-sm font-semibold px-4 py-2.5 rounded-full no-underline"
          >
            <IconUpload />
            Subir Temas
          </NavLink>

          <BotonTema className="shrink-0" />

          <div className="shrink-0 flex items-center gap-2 pl-1">
            <span className="w-8 h-8 rounded-full bg-accent-violet text-white text-xs font-bold flex items-center justify-center">
              {inicial}
            </span>
            <span className="text-sm font-semibold hidden lg:inline truncate max-w-[120px]">
              {perfil?.nombre_dj ?? perfil?.email}
            </span>
            <button
              type="button"
              onClick={() => void signOut()}
              className="text-xs font-semibold px-3 py-2 rounded-lg border border-border hover:border-ink transition-colors appearance-none bg-transparent cursor-pointer"
            >
              Salir
            </button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Overlay mobile */}
        {sidebarAbierto && (
          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={() => setSidebarAbierto(false)}
            className="fixed inset-0 bg-overlay z-20 lg:hidden appearance-none border-none cursor-pointer"
          />
        )}

        {/* Sidebar */}
        <aside
          className={`fixed lg:sticky top-16 lg:top-16 left-0 z-20 w-64 h-[calc(100vh-4rem)] bg-card border-r border-border-soft flex flex-col gap-1 p-4 overflow-y-auto transition-transform duration-200 ${
            sidebarAbierto ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
          }`}
        >
          <form onSubmit={buscar} className="md:hidden mb-2">
            <label className="relative block">
              <span className="sr-only">Buscar en el catálogo</span>
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-2">
                <IconSearch />
              </span>
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar…"
                className="w-full pl-10 pr-3 py-2.5 rounded-full border border-border bg-cream text-sm focus:outline-2 focus:outline-accent"
              />
            </label>
          </form>

          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={sidebarLinkClass}
              onClick={() => setSidebarAbierto(false)}
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}

          {perfil?.rol === "admin" && (
            <NavLink to="/admin" className={sidebarLinkClass} onClick={() => setSidebarAbierto(false)}>
              <IconShield />
              Admin
            </NavLink>
          )}

          <div className="flex-1" />

          <NavLink
            to="/subir"
            onClick={() => setSidebarAbierto(false)}
            className="sm:hidden flex items-center justify-center gap-2 bg-accent text-white text-sm font-semibold px-4 py-2.5 rounded-full no-underline mt-2"
          >
            <IconUpload />
            Subir Temas
          </NavLink>

          <div className="rounded-xl bg-cream p-3.5 text-xs text-muted mt-2">
            ClubPack — hecho por DJs, para DJs. Catálogo cerrado, uso privado del grupo.
          </div>
        </aside>

        <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
