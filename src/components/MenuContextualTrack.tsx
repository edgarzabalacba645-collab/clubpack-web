import { useEffect, useRef, useState } from "react";
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

/**
 * Botón "⋮" con las acciones rápidas de un track: sumarlo a la cola,
 * mandarlo a una playlist (existente o nueva), y — solo cuando esta fila
 * vive dentro del panel "A continuación" (ver BarraReproductor en
 * AppShell) — sacarlo de la cola. Un solo componente reutilizado en
 * ListaTracks, CatalogoPage y el panel de cola, para no repetir el mismo
 * menú tres veces con lógica ligeramente distinta cada vez.
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
  const contenedorRef = useRef<HTMLDivElement>(null);
  const player = usePlayer();
  const guardarPlaylist = useGuardarPlaylist();

  useEffect(() => {
    if (!abierto) return;
    function alTocarFuera(e: MouseEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    }
    document.addEventListener("mousedown", alTocarFuera);
    return () => document.removeEventListener("mousedown", alTocarFuera);
  }, [abierto]);

  return (
    <div className="relative shrink-0" ref={contenedorRef}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-label={`Más opciones para ${track.titulo}`}
        title="Más opciones"
        className="w-8 h-8 flex items-center justify-center rounded-lg appearance-none bg-transparent border-none cursor-pointer text-muted hover:text-ink"
      >
        <IconoPuntos />
      </button>

      {abierto && (
        <div className="absolute right-0 top-full mt-1 z-30 bg-card border border-border-soft rounded-xl shadow-lg py-1.5 min-w-[230px] overflow-hidden">
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
        </div>
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
