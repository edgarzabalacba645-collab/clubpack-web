import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "./supabase";
import { ApiError, analizarTrack, confirmarSubida, type DuplicadoCandidato } from "./api";
import { mensajeErrorAmigable } from "./format";
import type { Genero } from "./types";
import { useAuth } from "./auth";

export type EstadoFila = "pendiente" | "analizando" | "revision" | "subiendo" | "listo" | "error";

export interface FilaMasiva {
  id: string;
  archivo: File;
  estado: EstadoFila;
  error: string | null;

  // Mismos campos que la subida de a uno (SubirTrackPage) — nada nuevo,
  // solo uno de estos por archivo en vez de un formulario único.
  titulo: string;
  artistaOriginal: string;
  remixer: string;
  generoId: string;
  keyArmonica: string;
  bpm: string;
  tags: string;

  stagingId: string | null;
  duracionSeg: number | null;
  advertencias: string[];
  duplicados: DuplicadoCandidato[];
  confirmoDuplicado: boolean;
  tieneCaratulaOriginal: boolean;
  caratulaPreview: string | null;
  usarCaratulaOriginal: boolean;
}

function tituloDesdeNombreArchivo(nombre: string): string {
  const sinExtension = nombre.replace(/\.[^/.]+$/, "");
  let titulo = sinExtension.replace(/_+/g, " ").trim();
  // Saca el número de pista inicial que traen los rips de CD completos
  // ("01 - Nombre", "01. Nombre", "01 Nombre", "1) Nombre"), pero solo
  // cuando hay separador claro después del número — si no, puede ser
  // parte real del título (ej. "2step", "138 bpm") y se deja como está.
  titulo = titulo.replace(/^\d{1,3}(?:[-._)]|\s)+/, "").trim();
  return titulo;
}

function idFila(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

interface CargaMasivaContextValue {
  generos: Genero[];
  filas: FilaMasiva[];
  analizandoTodos: boolean;
  confirmandoTodos: boolean;
  artistaOriginalMasivo: string;
  setArtistaOriginalMasivo: (v: string) => void;
  remixerMasivo: string;
  setRemixerMasivo: (v: string) => void;
  generoMasivoId: string;
  setGeneroMasivoId: (v: string) => void;

  agregarArchivos: (lista: FileList | null) => void;
  actualizarFila: (id: string, cambios: Partial<FilaMasiva>) => void;
  quitarFila: (id: string) => void;
  limpiarTodo: () => void;
  limpiarSubidos: () => void;
  aplicarArtistaOriginalATodos: () => void;
  aplicarRemixerATodos: () => void;
  aplicarGeneroATodos: () => void;
  analizarUna: (fila: FilaMasiva) => Promise<void>;
  analizarTodas: () => Promise<void>;
  confirmarUna: (fila: FilaMasiva) => Promise<void>;
  confirmarTodasListas: () => Promise<void>;
}

const CargaMasivaContext = createContext<CargaMasivaContextValue | null>(null);

/**
 * Toda la cola de carga masiva (los archivos agregados, su estado de
 * análisis/subida, los datos de cada fila) vive acá.
 *
 * Antes esto era estado local de CargaMasiva: al navegar a otra pantalla
 * (por ejemplo para escuchar un track en el Catálogo mientras se espera
 * terminar de revisar un disco completo recién analizado) React
 * desmontaba el componente y se perdía toda la cola — había que volver a
 * elegir y analizar los archivos de nuevo. Este contexto se monta una
 * sola vez por encima de las rutas (ver App.tsx) para que la cola
 * sobreviva a la navegación; CargaMasiva ahora solo lo consume y dibuja
 * la pantalla.
 */
export function CargaMasivaProvider({ children }: { children: ReactNode }) {
  const { perfil } = useAuth();
  const [generos, setGeneros] = useState<Genero[]>([]);
  const [filas, setFilas] = useState<FilaMasiva[]>([]);
  const [analizandoTodos, setAnalizandoTodos] = useState(false);
  const [confirmandoTodos, setConfirmandoTodos] = useState(false);
  const [artistaOriginalMasivo, setArtistaOriginalMasivo] = useState("");
  const [remixerMasivo, setRemixerMasivo] = useState("");
  const [generoMasivoId, setGeneroMasivoId] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from("generos")
          .select("*")
          .eq("activo", true)
          .order("orden");
        if (!error && data) setGeneros(data);
      } catch {
        // el selector de género simplemente queda vacío si esto falla
      }
    })();
  }, []);

  function agregarArchivos(lista: FileList | null) {
    if (!lista || lista.length === 0) return;
    const nuevas: FilaMasiva[] = Array.from(lista).map((archivo) => ({
      id: idFila(),
      archivo,
      estado: "pendiente",
      error: null,
      titulo: tituloDesdeNombreArchivo(archivo.name),
      artistaOriginal: "",
      remixer: perfil?.nombre_dj ?? "",
      generoId: "",
      keyArmonica: "",
      bpm: "",
      tags: "",
      stagingId: null,
      duracionSeg: null,
      advertencias: [],
      duplicados: [],
      confirmoDuplicado: false,
      tieneCaratulaOriginal: false,
      caratulaPreview: null,
      usarCaratulaOriginal: true,
    }));
    setFilas((prev) => [...prev, ...nuevas]);
  }

  function actualizarFila(id: string, cambios: Partial<FilaMasiva>) {
    setFilas((prev) => prev.map((f) => (f.id === id ? { ...f, ...cambios } : f)));
  }

  function quitarFila(id: string) {
    setFilas((prev) => prev.filter((f) => f.id !== id));
  }

  // Vacía toda la cola — el botón "Limpiar todo" en CargaMasiva.tsx pide
  // confirmación antes de llamar a esto si hay filas sin subir todavía.
  function limpiarTodo() {
    setFilas([]);
  }

  // Sólo saca de la lista las filas que ya se subieron ("listo") — las
  // que todavía están pendientes/en revisión/con error quedan intactas.
  // Pensado para despejar la vista después de una tanda grande sin perder
  // lo que falta terminar.
  function limpiarSubidos() {
    setFilas((prev) => prev.filter((f) => f.estado !== "listo"));
  }

  function aplicarArtistaOriginalATodos() {
    if (!artistaOriginalMasivo.trim()) return;
    setFilas((prev) =>
      prev.map((f) => (f.estado === "listo" ? f : { ...f, artistaOriginal: artistaOriginalMasivo.trim() })),
    );
  }

  function aplicarRemixerATodos() {
    if (!remixerMasivo.trim()) return;
    setFilas((prev) =>
      prev.map((f) => (f.estado === "listo" ? f : { ...f, remixer: remixerMasivo.trim() })),
    );
  }

  function aplicarGeneroATodos() {
    if (!generoMasivoId) return;
    setFilas((prev) => prev.map((f) => (f.estado === "listo" ? f : { ...f, generoId: generoMasivoId })));
  }

  async function analizarUna(fila: FilaMasiva) {
    actualizarFila(fila.id, { estado: "analizando", error: null });
    try {
      const resultado = await analizarTrack(fila.archivo, fila.titulo.trim(), fila.remixer.trim());
      actualizarFila(fila.id, {
        estado: "revision",
        stagingId: resultado.staging_id,
        duracionSeg: resultado.duracion_seg,
        advertencias: resultado.advertencias,
        duplicados: resultado.duplicados_sospechosos,
        tieneCaratulaOriginal: resultado.tiene_caratula_original,
        caratulaPreview: resultado.caratula_original_preview,
        usarCaratulaOriginal: true,
        bpm:
          resultado.bpm_detectado != null
            ? resultado.bpm_detectado % 1 === 0
              ? String(resultado.bpm_detectado)
              : resultado.bpm_detectado.toFixed(1)
            : "",
        keyArmonica: resultado.key_detectada ?? fila.keyArmonica,
      });
    } catch (e) {
      actualizarFila(fila.id, {
        estado: "error",
        error: e instanceof ApiError ? e.message : mensajeErrorAmigable(e),
      });
    }
  }

  async function analizarTodas() {
    setAnalizandoTodos(true);
    // Secuencial, no en paralelo — el backend transcodifica/analiza con
    // ffmpeg+librosa (pesado) en un solo worker, así que mandarle varios
    // archivos a la vez solo lo satura sin ganar velocidad real.
    for (const fila of filas) {
      if (fila.estado === "pendiente" || fila.estado === "error") {
        if (!fila.titulo.trim()) {
          actualizarFila(fila.id, { estado: "error", error: "Falta el título." });
          continue;
        }
        await analizarUna(fila);
      }
    }
    setAnalizandoTodos(false);
  }

  async function confirmarUna(fila: FilaMasiva) {
    if (!fila.stagingId) return;
    actualizarFila(fila.id, { estado: "subiendo", error: null });
    try {
      const tagsArr = fila.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      await confirmarSubida({
        staging_id: fila.stagingId,
        titulo: fila.titulo.trim(),
        artista_original: fila.artistaOriginal.trim() || null,
        remixer: fila.remixer.trim() || null,
        genero_id: fila.generoId || null,
        bpm: fila.bpm ? Number(fila.bpm) : null,
        key_armonica: fila.keyArmonica || null,
        tags: tagsArr,
        usar_caratula_original: fila.usarCaratulaOriginal,
      });
      actualizarFila(fila.id, { estado: "listo" });
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        actualizarFila(fila.id, {
          estado: "error",
          error: `${e.message} Volvé a analizarlo.`,
          stagingId: null,
        });
      } else {
        actualizarFila(fila.id, {
          estado: "error",
          error: e instanceof ApiError ? e.message : mensajeErrorAmigable(e),
        });
      }
    }
  }

  async function confirmarTodasListas() {
    setConfirmandoTodos(true);
    for (const fila of filas) {
      const bloqueadaPorDuplicado = fila.duplicados.length > 0 && !fila.confirmoDuplicado;
      if (fila.estado === "revision" && !bloqueadaPorDuplicado) {
        await confirmarUna(fila);
      }
    }
    setConfirmandoTodos(false);
  }

  return (
    <CargaMasivaContext.Provider
      value={{
        generos,
        filas,
        analizandoTodos,
        confirmandoTodos,
        artistaOriginalMasivo,
        setArtistaOriginalMasivo,
        remixerMasivo,
        setRemixerMasivo,
        generoMasivoId,
        setGeneroMasivoId,
        agregarArchivos,
        actualizarFila,
        quitarFila,
        limpiarTodo,
        limpiarSubidos,
        aplicarArtistaOriginalATodos,
        aplicarRemixerATodos,
        aplicarGeneroATodos,
        analizarUna,
        analizarTodas,
        confirmarUna,
        confirmarTodasListas,
      }}
    >
      {children}
    </CargaMasivaContext.Provider>
  );
}

export function useCargaMasiva(): CargaMasivaContextValue {
  const ctx = useContext(CargaMasivaContext);
  if (!ctx) throw new Error("useCargaMasiva debe usarse dentro de <CargaMasivaProvider>");
  return ctx;
}
