import { useEffect, useMemo, useState } from "react";
import { formatearTamano, mensajeErrorAmigable } from "../lib/format";
import { borrarOfflineDelTodo, espacioUsadoBytes, listarGuardados, onCambioOffline, type ItemOffline } from "../lib/offline";
import type { TrackResumen } from "../lib/tracks";
import { useAccionesLista } from "../lib/escucha";
import { useAuth, esLicenciaDj } from "../lib/auth";
import ListaTracks, { type AccionesFila } from "../components/ListaTracks";
import AvisoSuscripcionModal from "../components/AvisoSuscripcionModal";

/** Convierte la metadata guardada en IndexedDB a la forma que espera
 * <ListaTracks> — los campos que no se guardaron (género/fecha/subido
 * por) quedan en null, se ven igual con el "—" de siempre. */
function comoTrackResumen(item: ItemOffline): TrackResumen {
  const m = item.meta;
  return {
    id: m.id,
    titulo: m.titulo,
    artista_original: m.artista_original,
    remixer: m.remixer,
    bpm: m.bpm,
    key_armonica: null,
    duracion_seg: m.duracion_seg,
    genero_id: null,
    generos: m.genero_nombre ? { nombre: m.genero_nombre } : null,
    portada_url: m.portada_url,
    fecha_subida: null,
    perfiles: null,
  };
}

/**
 * Gestión de lo guardado para escuchar sin conexión (cifrado, en este
 * celular/navegador — ver lib/offline.ts). A diferencia de "Descargas"
 * (historial de descargas REALES, solo DJ), esto es para cualquier
 * usuario: temas guardados a mano desde cualquier lista, o bajados en
 * bloque desde una playlist completa.
 *
 * El ícono de cada fila acá SIEMPRE se ve "guardado" (todo lo que se
 * lista ya está offline, venga de donde venga) y tocarlo lo saca DEL
 * TODO — a diferencia del mismo ícono en el Catálogo/Favoritos/etc.,
 * donde solo maneja el guardado "a mano" (ver comentario en
 * useAccionesLista). Acá no hay ambigüedad posible: todo lo que se ve es
 * justamente lo guardado, así que "sacarlo" borra lo que sea.
 */
export default function SinConexionPage() {
  const { perfil } = useAuth();
  const [items, setItems] = useState<ItemOffline[]>([]);
  const [bytesTotal, setBytesTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quitandoId, setQuitandoId] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    const cargar = async () => {
      try {
        const [lista, bytes] = await Promise.all([listarGuardados(), espacioUsadoBytes()]);
        if (cancelado) return;
        setItems(lista);
        setBytesTotal(bytes);
      } catch (e) {
        if (!cancelado) setError(mensajeErrorAmigable(e));
      } finally {
        if (!cancelado) setCargando(false);
      }
    };
    void cargar();
    const quitarListener = onCambioOffline(() => void cargar());
    return () => {
      cancelado = true;
      quitarListener();
    };
  }, []);

  const tracks = useMemo(() => items.map(comoTrackResumen), [items]);
  const { acciones: accionesBase, escucha } = useAccionesLista(tracks);

  async function quitar(id: string) {
    setQuitandoId(id);
    try {
      await borrarOfflineDelTodo(id);
    } catch (e) {
      setError(mensajeErrorAmigable(e));
    } finally {
      setQuitandoId(null);
    }
  }

  // Mismo paquete de acciones (play/favorito funcionan igual), pero el
  // ícono de "sin conexión" se repisa: acá siempre está guardado, y
  // tocarlo lo quita del todo en vez de alternar el origen "manual".
  const acciones: AccionesFila = {
    ...accionesBase,
    esOffline: () => true,
    guardandoOfflineId: quitandoId,
    onToggleOffline: (track) => void quitar(track.id),
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display font-extrabold text-3xl tracking-[-0.5px] m-0">Sin conexión</h1>
        <p className="text-muted text-sm mt-1 m-0">
          Temas guardados en este celular/navegador para escuchar sin gastar datos — cifrados, no son
          archivos sueltos que se puedan copiar. Se guardan tocando el ícono en cualquier tema, o
          "Guardar sin conexión" en una playlist completa.
        </p>
        {!cargando && items.length > 0 && (
          <p className="text-xs text-muted-2 mt-1 m-0">
            {items.length} tema{items.length === 1 ? "" : "s"} · {formatearTamano(bytesTotal)} ocupados
          </p>
        )}
      </div>

      {escucha.avisoAccion && (
        <p className="text-sm bg-card border border-border-soft rounded-xl px-4 py-3 m-0">{escucha.avisoAccion}</p>
      )}
      {error && <p className="text-sm text-accent font-medium m-0">{error}</p>}
      {cargando && <p className="text-sm text-muted m-0">Cargando…</p>}

      {!cargando && (
        <ListaTracks
          tracks={tracks}
          acciones={acciones}
          vacio="Todavía no guardaste nada para escuchar sin conexión."
          puedeDescargar={esLicenciaDj(perfil)}
        />
      )}

      <AvisoSuscripcionModal mensaje={escucha.avisoSuscripcion} onCerrar={() => escucha.setAvisoSuscripcion(null)} />
    </div>
  );
}
