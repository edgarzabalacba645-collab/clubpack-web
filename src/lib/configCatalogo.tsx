import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { ConfiguracionCatalogo } from "./types";

/**
 * Lectura compartida de configuracion_catalogo (ver
 * sql/010_control_subidas.sql) — lo usan AppShell (mostrar u ocultar el
 * botón "Subir Temas"), CatalogoPage (texto del hero) y SubirTrackPage
 * (bloquear la página si el admin cerró las subidas). La policy RLS de
 * esta tabla deja verla a cualquier usuario logueado, tenga o no
 * suscripción activa — hace falta para decidir qué mostrar incluso a
 * alguien sin acceso activo.
 *
 * A propósito por defecto `permiteSubidaColaboradores` es `true`
 * mientras carga (y si falla la lectura): más vale mostrar de más por
 * un instante que ocultar el botón de subir de alguien que sí puede —
 * el chequeo real que importa de verdad es el de RLS/backend al
 * confirmar, esto es solo para la UI.
 */
export function useConfiguracionCatalogo() {
  const [permiteSubidaColaboradores, setPermiteSubidaColaboradores] = useState(true);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("configuracion_catalogo")
          .select("permite_subida_colaboradores")
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        const fila = data as Pick<ConfiguracionCatalogo, "permite_subida_colaboradores"> | null;
        if (!cancelado && fila) {
          setPermiteSubidaColaboradores(fila.permite_subida_colaboradores);
        }
      } catch {
        // Ver nota arriba: si falla, queda en true (el valor por defecto).
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  return { permiteSubidaColaboradores, cargando };
}
