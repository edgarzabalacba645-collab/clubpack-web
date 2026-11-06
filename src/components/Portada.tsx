import { useEffect, useState } from "react";
import { urlImagen } from "../lib/api";

const GENERICA = "/portada-generica.svg";

/**
 * Carátula de un track (o imagen de herramienta DJ, mismo patrón):
 * `path` es la key en R2 (p.ej. "portadas/{id}.jpg"), que requiere pedir
 * una URL firmada al backend — si no hay portada, muestra la genérica
 * de ClubPack sin pedir nada.
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

  useEffect(() => {
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
  }, [path]);

  return <img src={src} alt={alt} className={className} loading="lazy" />;
}
