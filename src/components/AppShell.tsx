import { useState, type FormEvent, type ReactNode } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { usePlayer } from "../lib/player";
import BotonTema from "./BotonTema";

/* Iconos de línea simple, consistentes con los que ya usa LoginPage.tsx
   (stroke="currentColor", 2px, redondeados) — así el sidebar nuevo no
   introduce un segundo lenguaje visual de iconografía. */

/* Badge circular — se usa en modo claro, igual que antes. */
function IconLogoBadge() {
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

/* Auricular "pelado", sin fondo circular — así lo usa la referencia de
   diseño en modo oscuro (ícono violeta suelto junto al wordmark, en vez
   del badge). currentColor: el span que lo envuelve define el color
   (text-accent, violeta en modo oscuro). */
function IconLogoBare() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 14.5v-3a7 7 0 0 1 14 0v3"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        fill="none"
      />
      <rect x="3.3" y="13" width="3.4" height="6" rx="1.7" fill="currentColor" />
      <rect x="17.3" y="13" width="3.4" height="6" rx="1.7" fill="currentColor" />
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

/* Flecha de la pestaña que abre/cierra el sidebar en la versión de PC —
   apunta a la derecha ("abrir") por defecto; se rota 180° cuando el
   sidebar está abierto, para que apunte a la izquierda ("cerrar"). */
function IconChevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

function IconPlayMini() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6 4 L20 12 L6 20 Z" />
    </svg>
  );
}

function IconPauseMini() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="5" y="4" width="5" height="16" />
      <rect x="14" y="4" width="5" height="16" />
    </svg>
  );
}

/*
 * Barra fija con el reproductor global (ver src/lib/player.tsx) — vive
 * acá, adentro de AppShell, que no se desmonta al navegar entre
 * pantallas protegidas, así que un tema sonando sigue sonando sin
 * importar a qué pantalla se vaya después. Solo se dibuja algo cuando
 * hay un track activo.
 */
function BarraReproductor() {
  const { trackActual, estado, error, contenedorRef, togglePlay, cerrar } = usePlayer();
  if (!trackActual) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 bg-card border-t border-border-soft px-4 sm:px-6 py-2.5 flex items-center gap-3 sm:gap-4">
      <button
        type="button"
        onClick={togglePlay}
        aria-label={estado === "sonando" ? "Pausar" : "Reproducir"}
        className="shrink-0 w-10 h-10 rounded-full bg-ink text-cream flex items-center justify-center appearance-none border-none cursor-pointer"
      >
        {estado === "cargando" ? (
          <span className="text-xs">…</span>
        ) : estado === "sonando" ? (
          <IconPauseMini />
        ) : (
          <IconPlayMini />
        )}
      </button>

      <div className="hidden sm:block w-40 shrink-0 min-w-0">
        <div className="font-semibold text-sm truncate">{trackActual.titulo}</div>
        {trackActual.remixer && <div className="text-xs text-muted truncate">Remix: {trackActual.remixer}</div>}
      </div>

      <div ref={contenedorRef} className="flex-1 min-w-0 cursor-pointer" />

      {error && (
        <p className="hidden lg:block text-xs text-accent m-0 max-w-[220px] truncate shrink-0" title={error}>
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={cerrar}
        aria-label="Cerrar reproductor"
        className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center appearance-none bg-transparent border-none cursor-pointer text-muted hover:text-ink"
      >
        <IconClose />
      </button>
    </div>
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
  const { trackActual } = usePlayer();
  const navigate = useNavigate();
  const [busqueda, setBusqueda] = useState("");
  const [sidebarAbierto, setSidebarAbierto] = useState(false);
  // Sidebar de la versión de PC (lg+): antes quedaba siempre fijo ocupando
  // espacio; ahora arranca escondido a la izquierda y se despliega con la
  // pestaña-flecha (ver más abajo), igual que el drawer de celular pero
  // con su propio estado — así en pantallas grandes también se puede
  // ganar todo el ancho para el contenido cuando no se lo necesita.
  const [sidebarEscritorioAbierto, setSidebarEscritorioAbierto] = useState(false);

  function cerrarSidebars() {
    setSidebarAbierto(false);
    setSidebarEscritorioAbierto(false);
  }

  function buscar(e: FormEvent) {
    e.preventDefault();
    navigate(`/catalogo${busqueda.trim() ? `?q=${encodeURIComponent(busqueda.trim())}` : ""}`);
    cerrarSidebars();
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
            <span className="w-8 h-8 rounded-full bg-ink text-card flex items-center justify-center shrink-0 dark:hidden">
              <IconLogoBadge />
            </span>
            <span className="hidden dark:flex items-center justify-center w-8 h-8 text-accent shrink-0">
              <IconLogoBare />
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
        {/* Overlay — en celular oscurece el fondo; en PC queda invisible
            pero sigue capturando el click afuera para cerrar el drawer. */}
        {(sidebarAbierto || sidebarEscritorioAbierto) && (
          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={cerrarSidebars}
            className="fixed inset-0 bg-overlay lg:bg-transparent z-20 appearance-none border-none cursor-pointer"
          />
        )}

        {/* Sidebar — en celular lo maneja sidebarAbierto (botón hamburguesa
            del header); en PC lo maneja sidebarEscritorioAbierto (pestaña
            con flecha de al lado). Fixed en los dos casos: así, cuando
            está escondido, el contenido aprovecha todo el ancho. */}
        <aside
          className={`fixed top-16 left-0 z-20 w-64 h-[calc(100vh-4rem)] bg-card border-r border-border-soft flex flex-col gap-1 p-4 overflow-y-auto transition-transform duration-200 ${
            trackActual ? "pb-20" : ""
          } ${sidebarAbierto ? "translate-x-0" : "-translate-x-full"} ${
            sidebarEscritorioAbierto ? "lg:translate-x-0" : "lg:-translate-x-full"
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
              onClick={cerrarSidebars}
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}

          {perfil?.rol === "admin" && (
            <NavLink to="/admin" className={sidebarLinkClass} onClick={cerrarSidebars}>
              <IconShield />
              Admin
            </NavLink>
          )}

          <div className="flex-1" />

          <NavLink
            to="/subir"
            onClick={cerrarSidebars}
            className="sm:hidden flex items-center justify-center gap-2 bg-accent text-white text-sm font-semibold px-4 py-2.5 rounded-full no-underline mt-2"
          >
            <IconUpload />
            Subir Temas
          </NavLink>

          <div className="rounded-xl bg-cream p-3.5 text-xs text-muted mt-2">
            ClubPack — hecho por DJs, para DJs. Catálogo cerrado, uso privado del grupo.
          </div>
        </aside>

        {/* Pestaña con flecha para abrir/cerrar el sidebar en PC — en
            celular no hace falta, ahí ya está el botón hamburguesa del
            header. Se mueve junto con el borde del sidebar (left-0 ↔
            left-64) así siempre queda pegada a su borde visible. */}
        <button
          type="button"
          onClick={() => setSidebarEscritorioAbierto((v) => !v)}
          aria-label={sidebarEscritorioAbierto ? "Esconder menú" : "Mostrar menú"}
          className={`hidden lg:flex fixed top-1/2 -translate-y-1/2 z-20 w-6 h-14 items-center justify-center rounded-r-lg border border-l-0 border-border-soft bg-card text-muted-2 hover:text-ink appearance-none cursor-pointer transition-[left] duration-200 ${
            sidebarEscritorioAbierto ? "left-64" : "left-0"
          }`}
        >
          <span className={sidebarEscritorioAbierto ? "rotate-180 flex" : "flex"}>
            <IconChevron />
          </span>
        </button>

        <main
          className={`flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-6 sm:py-8 ${trackActual ? "pb-24" : ""}`}
        >
          <Outlet />
        </main>
      </div>

      <BarraReproductor />
    </div>
  );
}
