import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Fila de tarjetas que se desliza horizontalmente sin mostrar la barra
 * de scroll nativa — en su lugar, una flechita flotante y
 * semitransparente aparece en cada borde cuando hay más contenido para
 * ese lado (con un pulso sutil para que se note que es clickeable), y
 * se oculta sola al llegar al principio/final.
 *
 * Las flechas solo se muestran desde sm: hacia arriba — en celular el
 * deslizamiento táctil ya alcanza y dos botones flotantes sobre
 * tarjetas angostas quedan apretados.
 */
export default function CarruselHorizontal({ children }: { children: ReactNode }) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const [puedeIzquierda, setPuedeIzquierda] = useState(false);
  const [puedeDerecha, setPuedeDerecha] = useState(false);

  function actualizarFlechas() {
    const el = contenedorRef.current;
    if (!el) return;
    setPuedeIzquierda(el.scrollLeft > 4);
    setPuedeDerecha(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }

  useEffect(() => {
    const el = contenedorRef.current;
    if (!el) return;
    actualizarFlechas();
    // Reacciona tanto a que cambie el ancho visible (ej. se abre/cierra
    // el sidebar) como a que cambien los hijos (otra tanda de tracks).
    const observer = new ResizeObserver(actualizarFlechas);
    observer.observe(el);
    return () => observer.disconnect();
  }, [children]);

  function desplazar(direccion: 1 | -1) {
    const el = contenedorRef.current;
    if (!el) return;
    el.scrollBy({ left: direccion * el.clientWidth * 0.8, behavior: "smooth" });
  }

  return (
    <div className="relative">
      <div
        ref={contenedorRef}
        onScroll={actualizarFlechas}
        className="flex gap-4 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide scroll-smooth"
      >
        {children}
      </div>

      {puedeIzquierda && (
        <button
          type="button"
          onClick={() => desplazar(-1)}
          aria-label="Ver anteriores"
          className="hidden sm:flex absolute left-0 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-ink/45 text-cream-soft items-center justify-center appearance-none border-none cursor-pointer backdrop-blur-sm animate-pulse"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M15 5 L8 12 L15 19"
              stroke="currentColor"
              strokeWidth="2.3"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
        </button>
      )}

      {puedeDerecha && (
        <button
          type="button"
          onClick={() => desplazar(1)}
          aria-label="Ver siguientes"
          className="hidden sm:flex absolute right-0 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-ink/45 text-cream-soft items-center justify-center appearance-none border-none cursor-pointer backdrop-blur-sm animate-pulse"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M9 5 L16 12 L9 19"
              stroke="currentColor"
              strokeWidth="2.3"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
