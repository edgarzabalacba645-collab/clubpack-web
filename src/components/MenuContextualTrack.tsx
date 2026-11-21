import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePlayer, type TrackCola } from "../lib/player";
import { useGuardarPlaylist, ModalGuardarPlaylist } from "../lib/guardarPlaylist";

function IconoPuntos() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="12" cy="19" r="1.8" />
    </svg>
  );
}

function ItemMenu({
  onClick,
  children,
  destructivo = false,
}: {
  onClick: () => void;
  children: React.ReactNode;
  destructivo?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-4 py-2.5 text-sm font-medium appearance-none bg-transparent border-none cursor-pointer hover:bg-cream ${
        destructivo ? "text-accent" : "text-ink"
      }`}
    >
      {children}
    </button>
  );
}

const ANCHO_MENU = 230;
const MARGEN_VIEWPORT = 8;
const ALTO_ESTIMADO_MENU = 180;

/**
 * Botón "⋮" con las acciones rápidas de un track: sumarlo a la cola,
 * mandarlo a una playlist (existente o nueva), y — solo cuando esta fila
 * vive dentro del panel "A continuación" (ver BarraReproductor en
 * AppShell) — sacarlo de la cola. Un solo componente reutilizado en
 * ListaTracks, CatalogoPage y el panel de cola, para no repetir el mismo
 * menú tres veces con lógica ligeramente distinta cada vez.
 *
 * El desplegable se dibuja en un portal a document.body (en vez de un
 * simple `absolute` dentro de este mismo div) porque tanto la fila de
 * ListaTracks/CatalogoPage como el panel "A continuación" tienen
 * `overflow-hidden` en un contenedor ancestro (para redondear las
 * esquinas) — eso recortaba el menú en celular (reportado por Edgar: se
 * veía "jar a la cola" en vez de "Agregar a la cola"). Al vivir en el
 * body, ningún contenedor lo recorta, y la posición se calcula a mano
 * desde `getBoundingClientRect()` del botón, siempre dentro del viewport.
 */
export default function MenuContextualTrack({
  track,
  enCola = false,
  onQuitarDeCola,
}: {
  track: TrackCola;
  /** true cuando esta fila es parte del panel "A continuación" — cambia
   * qué opciones tiene sentido mostrar (acá no se ofrece "agregar a la
   * cola": ya está en ella). */
  enCola?: boolean;
  onQuitarDeCola?: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const botonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const player = usePlayer();
  const guardarPlaylist = useGuardarPlaylist();

  function calcularPosicion() {
    const btn = botonRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    let left = r.right - ANCHO_MENU;
    left = Math.max(MARGEN_VIEWPORT, Math.min(left, window.innerWidth - ANCHO_MENU - MARGEN_VIEWPORT));
    let top = r.bottom + 4;
    if (top + ALTO_ESTIMADO_MENU > window.innerHeight - MARGEN_VIEWPORT) {
      top = Math.max(MARGEN_VIEWPORT, r.top - ALTO_ESTIMADO_MENU - 4);
    }
    setPos({ top, left });
  }

  useLayoutEffect(() => {
    if (!abierto) return;
    calcularPosicion();
    function alMoverse() {
      calcularPosicion();
    }
    // capture:true para enterarse de scroll en CUALQUIER contenedor
    // ancestro (p. ej. el panel "A continuación", que scrollea con
    // overflow-y-auto), no solo scroll de la ventana.
    window.addEventListener("scroll", alMoverse, true);
    window.addEventListener("resize", alMoverse);
    return () => {
      window.removeEventListener("scroll", alMoverse, true);
      window.removeEventListener("resize", alMoverse);
    };
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    function alTocarFuera(e: MouseEvent) {
      const destino = e.target as Node;
      const dentroDelBoton = botonRef.current?.contains(destino);
      const dentroDelMenu = menuRef.current?.contains(destino);
      if (!dentroDelBoton && !dentroDelMenu) {
        setAbierto(false);
      }
    }
    document.addEventListener("mousedown", alTocarFuera);
    return () => document.removeEventListener("mousedown", alTocarFuera);
  }, [abierto]);

  return (
    <div className="relative shrink-0">
      <button
        ref={botonRef}
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-label={`Más opciones para ${track.titulo}`}
        title="Más opciones"
        className="w-8 h-8 flex items-center justify-center rounded-lg appearance-none bg-transparent border-none cursor-pointer text-muted hover:text-ink"
      >
        <IconoPuntos />
      </button>

      {abierto &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: "fixed", top: pos.top, left: pos.left, width: ANCHO_MENU }}
            className="z-50 bg-card border border-border-soft rounded-xl shadow-lg py-1.5 overflow-hidden"
          >
            {!enCola && (
              <ItemMenu
                onClick={() => {
                  player.agregarACola([track]);
                  setAbierto(false);
                }}
              >
                Agregar a la cola
              </ItemMenu>
            )}
            <ItemMenu
              onClick={() => {
                setAbierto(false);
                void guardarPlaylist.abrir([track.id]);
              }}
            >
              Agregar a playlist
            </ItemMenu>
            <ItemMenu
              onClick={() => {
                setAbierto(false);
                void guardarPlaylist.abrir([track.id], track.titulo);
              }}
            >
              Crear playlist desde este tema
            </ItemMenu>
            {enCola && onQuitarDeCola && (
              <ItemMenu
                destructivo
                onClick={() => {
                  onQuitarDeCola();
                  setAbierto(false);
                }}
              >
                Sacar de la cola
              </ItemMenu>
            )}
          </div>,
          document.body,
        )}

      {guardarPlaylist.aviso && !guardarPlaylist.abierto && (
        <div className="absolute right-0 top-full mt-1 z-30 bg-ink text-cream text-xs font-medium rounded-lg px-3 py-2 max-w-[220px] shadow-lg">
          {guardarPlaylist.aviso}
          <button
            type="button"
            onClick={() => guardarPlaylist.setAviso(null)}
            className="ml-2 underline appearance-none bg-transparent border-none cursor-pointer text-cream"
          >
            Ok
          </button>
        </div>
      )}

      <ModalGuardarPlaylist estado={guardarPlaylist} />
    </div>
  );
}
