import { useState, type FormEvent, type ReactNode } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { esLicenciaDj, useAuth } from "../lib/auth";
import { useConfiguracionCatalogo } from "../lib/configCatalogo";
import { usePlayer } from "../lib/player";
import { formatearDuracion } from "../lib/format";
import { abrirDescargaDirecta, ApiError, obtenerUrlDescarga } from "../lib/api";
import { useGuardarPlaylist, ModalGuardarPlaylist } from "../lib/guardarPlaylist";
import BotonTema from "./BotonTema";
import CampanaNovedades from "./CampanaNovedades";
import MenuContextualTrack from "./MenuContextualTrack";

/** Lo que AppShell le pasa a sus páginas hijas via useOutletContext. */
export interface AppShellContext {
  /** Si el sidebar de PC está desplegado (ver AppShell) — con esto en
   * false el contenido tiene más ancho real disponible. */
  sidebarEscritorioAbierto: boolean;
}

/* Iconos de línea simple, consistentes con los que ya usa LoginPage.tsx
   (stroke="currentColor", 2px, redondeados) — así el sidebar nuevo no
   introduce un segundo lenguaje visual de iconografía. */

function IconHeart() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20s-6.2-4-8.6-7.5C1.6 9.6 2.6 5.8 5.8 4.6c2-.8 4.1 0 5.3 1.6l.9 1.2.9-1.2c1.2-1.6 3.3-2.4 5.3-1.6 3.2 1.2 4.2 5 2.4 7.9C18.2 16 12 20 12 20Z" />
    </svg>
  );
}

function IconDownloadNav() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" />
      <path d="M4 17v2a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19v-2" />
    </svg>
  );
}

function IconSparkle() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.8L12 18.5l-1.8-5.9-5.7-1.8L10.2 9 12 3.5Z" />
      <path d="M19 16.5v3M17.5 18h3" />
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

function IconTrofeo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
      <path d="M7 5.5H4a3 3 0 0 0 3 4.5M17 5.5h3a3 3 0 0 1-3 4.5" />
      <path d="M12 14v3.5M9 20.5h6M9.5 17.5h5l.5 3h-6l.5-3Z" />
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

/* ⏮ / ⏭ — mismo gesto que los botones de "anterior"/"siguiente" de la
   pantalla de bloqueo y los auriculares (ver avanzarSiguiente/
   retrocederAnterior en lib/player.tsx), ahora también en la barra. */
function IconSiguienteMini() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6 4 L16 12 L6 20 Z" />
      <rect x="17" y="4" width="2.3" height="16" />
    </svg>
  );
}

function IconAnteriorMini() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="4.7" y="4" width="2.3" height="16" />
      <path d="M18 4 L8 12 L18 20 Z" />
    </svg>
  );
}

/* Mismo ícono de "Bajar" que usa la columna Acciones del catálogo (ver
   CatalogoPage) — se repite acá así el botón de descarga de la barra del
   reproductor es visualmente el mismo gesto. */
function IconDescargar() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 4v11.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path
        d="M7.5 11.5 12 16l4.5-4.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M5 19.5h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/* Ícono de reproducción continua (dos flechas en loop) — el botón que lo
   usa cambia de color cuando está activo, no hace falta que el ícono en
   sí tenga dos variantes. */
function IconRepetir() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 7.5h11a4 4 0 0 1 4 4V13"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M8 4 4 7.5 8 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M20 16.5H9a4 4 0 0 1-4-4V11"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M16 20 20 16.5 16 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* Ícono de "A continuación" (lista con una nota musical) — abre el panel
   de cola. */
function IconCola() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 6h11M4 12h11M4 18h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="18.5" cy="17" r="2.2" fill="currentColor" />
      <path d="M20.5 17V7l-2 .6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconMezclar() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 6h3.5l9 12H20M4 18h3.5l2.4-3.2M13.6 9.2 16.5 6H20"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M17.5 4 20 6l-2.5 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17.5 14 20 16l-2.5 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
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
  const {
    trackActual,
    estado,
    error,
    modoContinuo,
    toggleModoContinuo,
    contenedorRef,
    togglePlay,
    siguiente,
    anterior,
    cerrar,
    cola,
    mezclarCola,
    vaciarCola,
    quitarDeCola,
  } = usePlayer();
  const { perfil } = useAuth();
  const [descargando, setDescargando] = useState(false);
  const [errorDescarga, setErrorDescarga] = useState<string | null>(null);
  const [colaAbierta, setColaAbierta] = useState(false);
  const guardarPlaylist = useGuardarPlaylist();

  // Lo que "sigue" en la cola es todo lo que viene DESPUÉS del tema
  // actual — lo anterior ya sonó, no tiene sentido mostrarlo acá (para
  // volver a un tema ya pasado está el botón "Anterior").
  const idxActual = trackActual ? cola.findIndex((t) => t.id === trackActual.id) : -1;
  const aContinuacion = idxActual >= 0 ? cola.slice(idxActual + 1) : [];

  // Bajar el tema que está sonando ahora mismo, sin tener que volver al
  // catálogo a buscar su fila — pensado para cuando uno reconoce el tema
  // al escucharlo pero no se acordaba del nombre.
  async function descargarActual() {
    if (!trackActual) return;
    setDescargando(true);
    setErrorDescarga(null);
    try {
      const { url } = await obtenerUrlDescarga(trackActual.id, true);
      abrirDescargaDirecta(url);
    } catch (e) {
      setErrorDescarga(e instanceof ApiError ? e.message : "No se pudo descargar el track.");
    } finally {
      setDescargando(false);
    }
  }

  if (!trackActual) return null;

  const subtitulo = [
    trackActual.artista_original ? `Original: ${trackActual.artista_original}` : null,
    trackActual.remixer ? `Remix: ${trackActual.remixer}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 bg-card border-t border-border-soft px-4 sm:px-6 py-2 flex flex-col gap-1">
      <div className="flex items-center gap-3 sm:gap-4">
        <button
          type="button"
          onClick={anterior}
          aria-label="Tema anterior"
          title="Anterior"
          className="flex shrink-0 w-7 h-7 rounded-full items-center justify-center appearance-none bg-transparent border-none cursor-pointer text-muted hover:text-ink"
        >
          <IconAnteriorMini />
        </button>

        <button
          type="button"
          onClick={togglePlay}
          aria-label={estado === "sonando" ? "Pausar" : "Reproducir"}
          className="shrink-0 w-9 h-9 rounded-full bg-ink text-cream flex items-center justify-center appearance-none border-none cursor-pointer"
        >
          {estado === "cargando" ? (
            <span className="text-xs">…</span>
          ) : estado === "sonando" ? (
            <IconPauseMini />
          ) : (
            <IconPlayMini />
          )}
        </button>

        <button
          type="button"
          onClick={siguiente}
          aria-label="Tema siguiente"
          title="Siguiente"
          className="flex shrink-0 w-7 h-7 rounded-full items-center justify-center appearance-none bg-transparent border-none cursor-pointer text-muted hover:text-ink"
        >
          <IconSiguienteMini />
        </button>

        <div className="hidden sm:block w-44 shrink-0 min-w-0">
          <div className="font-semibold text-sm truncate leading-tight">{trackActual.titulo}</div>
          {subtitulo && <div className="text-xs text-muted truncate leading-tight">{subtitulo}</div>}
        </div>

        <div ref={contenedorRef} className="flex-1 min-w-0 cursor-pointer" />

        {trackActual.duracion_seg != null && (
          <span className="hidden sm:inline shrink-0 text-xs text-muted tabular-nums">
            {formatearDuracion(trackActual.duracion_seg)}
          </span>
        )}

        {/* Licencia Simple no descarga (sql/019_tipo_licencia.sql). */}
        {esLicenciaDj(perfil) && (
          <button
            type="button"
            onClick={descargarActual}
            disabled={descargando}
            aria-label={`Bajar ${trackActual.titulo}`}
            title="Bajar"
            className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center appearance-none bg-transparent border-none cursor-pointer text-muted hover:text-ink disabled:opacity-50"
          >
            {descargando ? <span className="text-xs">…</span> : <IconDescargar />}
          </button>
        )}

        <button
          type="button"
          onClick={toggleModoContinuo}
          aria-pressed={modoContinuo}
          aria-label={modoContinuo ? "Desactivar reproducción continua" : "Activar reproducción continua"}
          title={modoContinuo ? "Reproducción continua: activada" : "Reproducción continua: desactivada"}
          className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center appearance-none border-none cursor-pointer transition-colors ${
            modoContinuo ? "bg-accent/15 text-accent" : "bg-transparent text-muted hover:text-ink"
          }`}
        >
          <IconRepetir />
        </button>

        <button
          type="button"
          onClick={() => setColaAbierta((v) => !v)}
          aria-pressed={colaAbierta}
          aria-label="A continuación"
          title="A continuación"
          className={`relative shrink-0 w-8 h-8 rounded-full flex items-center justify-center appearance-none border-none cursor-pointer transition-colors ${
            colaAbierta ? "bg-accent/15 text-accent" : "bg-transparent text-muted hover:text-ink"
          }`}
        >
          <IconCola />
          {aContinuacion.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-0.5 rounded-full bg-accent text-white text-[9px] font-bold leading-[15px] text-center">
              {aContinuacion.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={cerrar}
          aria-label="Cerrar reproductor"
          className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center appearance-none bg-transparent border-none cursor-pointer text-muted hover:text-ink"
        >
          <IconClose />
        </button>
      </div>

      {/* Panel "A continuación" — se abre/cierra con el botón de arriba,
          siempre arriba de la barra fija (bottom-full) para no tapar los
          controles. Mismo <ModalGuardarPlaylist> que usa el menú
          contextual de cada fila (ver MenuContextualTrack): acá se abre
          con TODA la cola completa (lo que ya sonó + el actual + lo que
          sigue), no solo "lo que falta" — tiene más sentido guardar la
          sesión entera como playlist. */}
      {colaAbierta && (
        <div className="absolute bottom-full left-0 right-0 max-h-[60vh] flex flex-col bg-card border-t border-x border-border-soft rounded-t-2xl shadow-lg overflow-hidden">
          <div className="shrink-0 flex items-center justify-between gap-2 px-4 sm:px-6 py-3 border-b border-border-soft">
            <h3 className="font-display font-bold text-sm m-0">A continuación</h3>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={mezclarCola}
                disabled={aContinuacion.length < 2}
                title="Mezclar lo que sigue"
                className="text-xs font-semibold px-2.5 py-1.5 rounded-full border border-border hover:border-ink transition-colors appearance-none bg-transparent cursor-pointer disabled:opacity-40 flex items-center gap-1.5"
              >
                <IconMezclar />
                <span className="hidden sm:inline">Shuffle Play</span>
              </button>
              <button
                type="button"
                onClick={() => void guardarPlaylist.abrir(cola.map((t) => t.id), "Mi cola")}
                disabled={cola.length === 0}
                title="Guardar cola como playlist"
                className="text-xs font-semibold px-2.5 py-1.5 rounded-full border border-border hover:border-ink transition-colors appearance-none bg-transparent cursor-pointer disabled:opacity-40"
              >
                <span className="sm:hidden">Playlist</span>
                <span className="hidden sm:inline">Guardar como playlist</span>
              </button>
              <button
                type="button"
                onClick={vaciarCola}
                disabled={aContinuacion.length === 0}
                title="Vaciar cola"
                className="text-xs font-semibold px-2.5 py-1.5 rounded-full border border-border hover:border-accent hover:text-accent transition-colors appearance-none bg-transparent cursor-pointer disabled:opacity-40"
              >
                Vaciar
              </button>
              <button
                type="button"
                onClick={() => setColaAbierta(false)}
                aria-label="Cerrar panel de cola"
                className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center appearance-none bg-transparent border-none cursor-pointer text-muted hover:text-ink"
              >
                <IconClose />
              </button>
            </div>
          </div>

          <div className="overflow-y-auto">
            {aContinuacion.length === 0 && (
              <p className="text-sm text-muted text-center py-8 px-4 m-0">
                No hay nada más en cola — cuando termine este tema, se corta acá.
              </p>
            )}
            {aContinuacion.map((t) => {
              const subtituloFila = [
                t.artista_original ? `Original: ${t.artista_original}` : null,
                t.remixer ? `Remix: ${t.remixer}` : null,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <div
                  key={t.id}
                  className="flex items-center gap-3 px-4 sm:px-6 py-2.5 border-b border-border-soft last:border-b-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate">{t.titulo}</div>
                    {subtituloFila && <div className="text-xs text-muted truncate">{subtituloFila}</div>}
                  </div>
                  <MenuContextualTrack track={t} enCola onQuitarDeCola={() => quitarDeCola(t.id)} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      <ModalGuardarPlaylist estado={guardarPlaylist} />

      {/* Antes esto tenía "hidden lg:block" — en el celular, que es
          justo donde más pasan estos errores (bloqueo de pantalla,
          políticas de reproducción en segundo plano), el reproductor se
          cerraba en silencio sin mostrar nunca por qué. Ahora se ve en
          cualquier tamaño de pantalla, en su propia línea para no apretar
          los íconos de arriba. */}
      {(errorDescarga || error) && (
        <p className="text-xs text-accent m-0 break-words">{errorDescarga ?? error}</p>
      )}
    </div>
  );
}

const NAV_ITEMS_BASE: { to: string; label: string; icon: ReactNode }[] = [
  { to: "/catalogo", label: "Inicio", icon: <IconHome /> },
  { to: "/novedades", label: "Novedades", icon: <IconSparkle /> },
  { to: "/favoritos", label: "Favoritos", icon: <IconHeart /> },
  { to: "/descargas", label: "Descargas", icon: <IconDownloadNav /> },
  { to: "/playlists", label: "Listas", icon: <IconPlaylist /> },
  { to: "/top50", label: "Ranking", icon: <IconTrofeo /> },
  { to: "/chat", label: "Comunidad", icon: <IconChat /> },
  { to: "/herramientas", label: "Herramientas DJ", icon: <IconTools /> },
  { to: "/cuenta", label: "Mi Perfil", icon: <IconUser /> },
  { to: "/suscripcion", label: "Suscripción", icon: <IconCard /> },
];

/* Card "Hazte socio" al pie de la sidebar — solo para quien no tiene
   acceso activo (admin y suscriptos ven el pie de siempre). */
function PieSidebar({ perfil, onNavegar }: { perfil: ReturnType<typeof useAuth>["perfil"]; onNavegar?: () => void }) {
  const sinAcceso = !!perfil && perfil.rol !== "admin" && perfil.estado_suscripcion !== "activo";
  if (!sinAcceso) {
    return (
      <div className="rounded-xl bg-cream p-3.5 text-xs text-muted mt-2">
        PLAYLIST — hecho por DJs, para DJs. Catálogo cerrado, uso privado del grupo.
      </div>
    );
  }
  return (
    <div className="rounded-2xl bg-gradient-to-br from-accent/15 to-accent-violet/15 border border-accent/20 p-4 mt-2 text-center flex flex-col items-center gap-2">
      <span className="text-2xl" aria-hidden="true">
        👑
      </span>
      <div className="font-display font-bold text-sm">Hazte socio</div>
      <p className="text-xs text-muted m-0 leading-snug">
        Escuchá y descargá todo el catálogo, y armá tus listas.
      </p>
      <NavLink
        to="/suscripcion"
        onClick={onNavegar}
        className="mt-1 w-full text-center bg-accent text-white text-xs font-semibold px-4 py-2.5 rounded-full no-underline"
      >
        Suscribirme
      </NavLink>
    </div>
  );
}

/* Pie de página, dentro del <main> para que respete el padding que deja
   la barra del reproductor. Redes: cuando haya links, van acá. */
function PiePagina() {
  const claseLink = "text-xs text-muted hover:text-ink no-underline";
  return (
    <footer className="mt-12 pt-5 border-t border-border-soft flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
      <nav className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <NavLink to="/terminos" className={claseLink}>
          Términos y Condiciones
        </NavLink>
        <NavLink to="/privacidad" className={claseLink}>
          Política de Privacidad
        </NavLink>
        <NavLink to="/contacto" className={claseLink}>
          Contacto
        </NavLink>
      </nav>
      <span className="text-xs text-muted-2">
        <strong className="text-muted">PLAYLIST</strong> — La música nos une
      </span>
    </footer>
  );
}

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
  const { permiteSubidaColaboradores } = useConfiguracionCatalogo();
  // El admin siempre ve el botón de subir (es quien sube cuando está
  // cerrado para el resto) — ver sql/010_control_subidas.sql. Desde
  // sql/019_tipo_licencia.sql, además hace falta licencia DJ: un
  // usuario Simple no sube temas aunque el admin tenga las subidas de
  // colaboradores habilitadas en general.
  const puedeVerBotonSubir = perfil?.rol === "admin" || (permiteSubidaColaboradores && esLicenciaDj(perfil));
  // "Herramientas DJ" y "Descargas" quedan fuera del menú para licencia
  // Simple — ver HerramientasPage.tsx y DescargasPage.tsx, que además
  // tienen su propio gate por si alguien entra por URL directa.
  const RUTAS_SOLO_DJ = ["/herramientas", "/descargas"];
  const navItems = NAV_ITEMS_BASE.filter((item) => !RUTAS_SOLO_DJ.includes(item.to) || esLicenciaDj(perfil));
  const { trackActual } = usePlayer();
  const navigate = useNavigate();
  const [busqueda, setBusqueda] = useState("");
  // Drawer de celular: lo abre/cierra el botón hamburguesa del header.
  const [sidebarAbierto, setSidebarAbierto] = useState(false);
  // Sidebar de la versión de PC (lg+): ya no es ni fijo-siempre-visible ni
  // a click — ahora se muestra solo mientras el mouse está encima (acerca
  // el mouse al borde izquierdo y se despliega, lo saca y se esconde),
  // como un dock con auto-hide. El resto del contenido no queda fijo: se
  // encoge un poco cuando el sidebar está visible y se expande cuando no
  // (ver <aside> más abajo — sigue en el flujo normal del flex, nunca es
  // "fixed", así que empuja/libera espacio de verdad en vez de flotar
  // encima del contenido).
  const [sidebarEscritorioAbierto, setSidebarEscritorioAbierto] = useState(false);

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
            <span className="w-8 h-8 shrink-0 flex items-center justify-center">
              <img src="/logo-mark.png" alt="" className="w-full h-full object-contain" />
            </span>
            <span className="flex flex-col leading-none">
              <span className="font-display font-extrabold text-[17px] tracking-[-0.3px]">PLAYLIST</span>
              <span className="hidden sm:block text-[11px] text-muted font-medium mt-0.5">Compartí. Mezclá. Disfrutá.</span>
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

          {puedeVerBotonSubir && (
            <NavLink
              to="/subir"
              className="shrink-0 hidden sm:inline-flex items-center gap-2 bg-accent text-white text-sm font-semibold px-4 py-2.5 rounded-full no-underline"
            >
              <IconUpload />
              Subir Temas
            </NavLink>
          )}

          <CampanaNovedades usuarioId={perfil?.id} />

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
        {/* Overlay solo de celular — oscurece el fondo y cierra el drawer
            al tocar afuera. En PC no hace falta: el sidebar ahí no tapa
            contenido (empuja, no flota encima) y se cierra solo al sacar
            el mouse. */}
        {sidebarAbierto && (
          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={() => setSidebarAbierto(false)}
            className="fixed inset-0 bg-overlay z-20 lg:hidden appearance-none border-none cursor-pointer"
          />
        )}

        {/* Drawer de celular — tapa el contenido (fixed), lo abre/cierra
            el botón hamburguesa del header. No existe en PC (lg:hidden):
            ahí el sidebar de abajo hace ese trabajo de otra forma. */}
        <aside
          className={`fixed lg:hidden top-16 left-0 z-20 w-64 h-[calc(100vh-4rem)] bg-card border-r border-border-soft flex flex-col gap-1 p-4 overflow-y-auto transition-transform duration-200 ${
            trackActual ? "pb-20" : ""
          } ${sidebarAbierto ? "translate-x-0" : "-translate-x-full"}`}
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

          {puedeVerBotonSubir && (
            <NavLink
              to="/subir"
              onClick={() => setSidebarAbierto(false)}
              className="sm:hidden flex items-center justify-center gap-2 bg-accent text-white text-sm font-semibold px-4 py-2.5 rounded-full no-underline mt-2"
            >
              <IconUpload />
              Subir Temas
            </NavLink>
          )}

          <PieSidebar perfil={perfil} onNavegar={() => setSidebarAbierto(false)} />
        </aside>

        {/* Sidebar de PC — auto-hide por hover, como un dock. Nunca es
            "fixed": sigue en el flujo normal del flex, así que animar su
            ancho empuja/libera espacio del contenido de verdad (encoge al
            mostrarse, expande al esconderse) en vez de flotar encima.
            Colapsado queda una tira angosta (de ahí el "w-3" de reposo)
            que sirve de zona de hover para volver a mostrarlo — el
            contenido de adentro mantiene su ancho real (w-64) todo el
            tiempo y el overflow-hidden del borde lo recorta, así no hay
            texto reacomodándose feo durante la animación. */}
        <aside
          onMouseEnter={() => setSidebarEscritorioAbierto(true)}
          onMouseLeave={() => setSidebarEscritorioAbierto(false)}
          className={`hidden lg:block shrink-0 sticky top-16 h-[calc(100vh-4rem)] bg-card border-r border-border-soft overflow-hidden transition-[width] duration-200 ${
            sidebarEscritorioAbierto ? "w-64" : "w-3"
          }`}
        >
          <div
            className={`w-64 h-full flex flex-col gap-1 p-4 overflow-y-auto ${trackActual ? "pb-20" : ""}`}
          >
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} className={sidebarLinkClass}>
                {item.icon}
                {item.label}
              </NavLink>
            ))}

            {perfil?.rol === "admin" && (
              <NavLink to="/admin" className={sidebarLinkClass}>
                <IconShield />
                Admin
              </NavLink>
            )}

            <div className="flex-1" />

            <PieSidebar perfil={perfil} />
          </div>
        </aside>

        <main
          // El padding inferior va aparte de "py-*" a propósito: un
          // ternario que agrega "pb-24" cuando hay reproductor NO le gana
          // a "sm:py-8" en pantallas >=640px (Tailwind mete las variantes
          // "sm:" en un bloque @media que cae después de las utilidades
          // planas en el CSS generado, así que "sm:py-8" terminaba
          // pisando el "pb-24" aunque apareciera antes en el className).
          // Separando pt-*/pb-* evitamos que compitan por la misma
          // propiedad y el padding extra sí se aplica.
          className={`flex-1 min-w-0 px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8 ${
            trackActual ? "pb-24" : "pb-6 sm:pb-8"
          }`}
        >
          {/* Las páginas hijas (ver CatalogoPage) pueden leer si el sidebar
              de PC está desplegado con useOutletContext — por ejemplo para
              sumar más portadas por fila cuando el contenido tiene más
              ancho disponible al estar escondido. */}
          <Outlet context={{ sidebarEscritorioAbierto } satisfies AppShellContext} />
          <PiePagina />
        </main>
      </div>

      <BarraReproductor />
    </div>
  );
}
