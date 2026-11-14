import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { rotuloDia } from "../lib/tracks";

const DIAS = 10;
const MAX_TEMAS = 8;

interface TemaNuevo {
  id: string;
  titulo: string;
  remixer: string | null;
  fecha_subida: string;
}
interface HerramientaNueva {
  id: string;
  nombre: string;
  fecha_creacion: string;
}

function IconBell() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16Z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </svg>
  );
}

/**
 * Campanita del header: al tocarla muestra qué entró en los últimos 10
 * días — temas nuevos y herramientas DJ nuevas — y nada más. El puntito
 * rojo con el número cuenta lo que entró DESPUÉS de la última vez que
 * este usuario abrió el panel (se guarda en localStorage, por usuario):
 * al abrirlo, se da por visto.
 */
export default function CampanaNovedades({ usuarioId }: { usuarioId: string | undefined }) {
  const [abierto, setAbierto] = useState(false);
  const [temas, setTemas] = useState<TemaNuevo[]>([]);
  const [herramientas, setHerramientas] = useState<HerramientaNueva[]>([]);
  const [cargando, setCargando] = useState(false);
  const [ultimaVista, setUltimaVista] = useState<number>(0);
  const panelRef = useRef<HTMLDivElement>(null);

  const claveVista = `clubpack.novedades.vistas.${usuarioId ?? "anon"}`;

  useEffect(() => {
    try {
      const v = localStorage.getItem(claveVista);
      setUltimaVista(v ? Number(v) : 0);
    } catch {
      /* sin localStorage (modo privado, etc.) el badge simplemente cuenta todo */
    }
  }, [claveVista]);

  async function cargar() {
    setCargando(true);
    const desde = new Date(Date.now() - DIAS * 86400e3).toISOString();
    try {
      const [t, h] = await Promise.all([
        supabase
          .from("tracks")
          .select("id, titulo, remixer, fecha_subida")
          .eq("estado", "activo")
          .gte("fecha_subida", desde)
          .order("fecha_subida", { ascending: false })
          .limit(50),
        supabase
          .from("herramientas_dj")
          .select("id, nombre, fecha_creacion")
          .gte("fecha_creacion", desde)
          .order("fecha_creacion", { ascending: false })
          .limit(10),
      ]);
      if (!t.error && t.data) setTemas(t.data as TemaNuevo[]);
      if (!h.error && h.data) setHerramientas(h.data as HerramientaNueva[]);
    } catch {
      /* la campanita nunca debe romper el header */
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    void cargar();
  }, []);

  // Cerrar al tocar afuera o con Escape.
  useEffect(() => {
    if (!abierto) return;
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setAbierto(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [abierto]);

  const nuevosNoVistos =
    temas.filter((t) => new Date(t.fecha_subida).getTime() > ultimaVista).length +
    herramientas.filter((h) => new Date(h.fecha_creacion).getTime() > ultimaVista).length;

  function alternar() {
    const abriendo = !abierto;
    setAbierto(abriendo);
    if (abriendo) {
      void cargar();
      const ahora = Date.now();
      setUltimaVista(ahora);
      try {
        localStorage.setItem(claveVista, String(ahora));
      } catch {
        /* ídem arriba */
      }
    }
  }

  return (
    <div ref={panelRef} className="relative shrink-0">
      <button
        type="button"
        onClick={alternar}
        aria-label={nuevosNoVistos > 0 ? `Novedades: ${nuevosNoVistos} sin ver` : "Novedades"}
        aria-expanded={abierto}
        className="relative w-9 h-9 rounded-lg flex items-center justify-center appearance-none bg-transparent border border-border hover:border-ink transition-colors cursor-pointer text-body"
      >
        <IconBell />
        {nuevosNoVistos > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-white text-[10px] font-bold flex items-center justify-center">
            {nuevosNoVistos > 9 ? "9+" : nuevosNoVistos}
          </span>
        )}
      </button>

      {abierto && (
        <div className="fixed sm:absolute left-3 right-3 sm:left-auto sm:right-0 top-[4.25rem] sm:top-11 sm:w-[340px] bg-card border border-border-soft rounded-2xl shadow-xl z-40 overflow-hidden">
          <div className="px-4 py-3 border-b border-border-soft flex items-center justify-between">
            <span className="font-display font-bold text-sm">Novedades · últimos {DIAS} días</span>
            {cargando && <span className="text-xs text-muted">…</span>}
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {!cargando && temas.length === 0 && herramientas.length === 0 && (
              <p className="text-sm text-muted px-4 py-6 text-center m-0">Nada nuevo en los últimos {DIAS} días.</p>
            )}

            {temas.length > 0 && (
              <div className="px-4 py-3 flex flex-col gap-2">
                <div className="text-[11px] uppercase tracking-wide text-muted-2 font-semibold">
                  Temas nuevos · {temas.length}
                </div>
                <ul className="list-none m-0 p-0 flex flex-col gap-1.5">
                  {temas.slice(0, MAX_TEMAS).map((t) => (
                    <li key={t.id} className="flex items-baseline justify-between gap-3 min-w-0">
                      <span className="text-sm min-w-0 truncate">
                        {t.titulo}
                        {t.remixer && <span className="text-muted"> — {t.remixer}</span>}
                      </span>
                      <span className="text-[11px] text-muted-2 shrink-0">{rotuloDia(t.fecha_subida)}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  to="/novedades"
                  onClick={() => setAbierto(false)}
                  className="text-xs font-semibold text-accent no-underline self-start"
                >
                  {temas.length > MAX_TEMAS ? `Ver los ${temas.length} en Novedades →` : "Ver en Novedades →"}
                </Link>
              </div>
            )}

            {herramientas.length > 0 && (
              <div className="px-4 py-3 border-t border-border-soft flex flex-col gap-2">
                <div className="text-[11px] uppercase tracking-wide text-muted-2 font-semibold">
                  Herramientas DJ nuevas · {herramientas.length}
                </div>
                <ul className="list-none m-0 p-0 flex flex-col gap-1.5">
                  {herramientas.map((h) => (
                    <li key={h.id} className="flex items-baseline justify-between gap-3 min-w-0">
                      <span className="text-sm min-w-0 truncate">{h.nombre}</span>
                      <span className="text-[11px] text-muted-2 shrink-0">{rotuloDia(h.fecha_creacion)}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  to="/herramientas"
                  onClick={() => setAbierto(false)}
                  className="text-xs font-semibold text-accent no-underline self-start"
                >
                  Ver Herramientas DJ →
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
