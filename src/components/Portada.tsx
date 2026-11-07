import { useEffect, useRef, useState } from "react";
import { urlImagen } from "../lib/api";

const GENERICA = "/portada-generica.svg";

/**
 * Carátula de un track (o imagen de herramienta DJ, mismo patrón):
 * `path` es la key en R2 (p.ej. "portadas/{id}.jpg"), que requiere pedir
 * una URL firmada al backend — si no hay portada, muestra la genérica
 * de ClubPack sin pedir nada.
 *
 * Esa URL firmada NO se pide apenas se monta el componente: se espera a
 * que la imagen esté a punto de entrar en pantalla (IntersectionObserver,
 * con 200px de margen para que llegue lista un poco antes). El atributo
 * `loading="lazy"` del <img> solo demora la DESCARGA de los bytes una
 * vez que `src` ya está puesto — no evita el pedido al backend, que
 * además dispara un chequeo de suscripción contra Supabase en cada
 * llamada (ver requiere_acceso_activo). Sin este freno, una página con
 * muchas tarjetas montadas de una (el catálogo completo, o un carrusel
 * con tarjetas fuera de vista a los costados) le pega al backend una
 * vez por cada portada aunque el usuario nunca llegue a verla.
 */
export default function Portada({
  path,
  alt,
  className,
}: {
  path: string | null;
  alt: string;
  className?: string;
}) {
  const [src, setSrc] = useState<string>(GENERICA);
  const [enVista, setEnVista] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const el = imgRef.current;
    if (!el || enVista) return;
    if (!("IntersectionObserver" in window)) {
      // Navegador sin soporte (rarísimo hoy): mejor pedirla siempre que
      // no mostrar nunca la portada real.
      setEnVista(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entradas) => {
        if (entradas[0]?.isIntersecting) {
          setEnVista(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [enVista]);

  useEffect(() => {
    if (!enVista) return;
    if (!path) {
      setSrc(GENERICA);
      return;
    }
    let activo = true;
    urlImagen(path)
      .then((url) => {
        if (activo) setSrc(url);
      })
      .catch(() => {
        if (activo) setSrc(GENERICA);
      });
    return () => {
      activo = false;
    };
  }, [path, enVista]);

  return <img ref={imgRef} src={src} alt={alt} className={className} loading="lazy" />;
}
