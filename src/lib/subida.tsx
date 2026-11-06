import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "./supabase";
import { ApiError, analizarTrack, confirmarSubida, type AnalisisTrack } from "./api";
import { mensajeErrorAmigable } from "./format";
import type { Genero } from "./types";
import { useAuth } from "./auth";

export type FaseSubida = "formulario" | "analizando" | "revision" | "confirmando" | "listo";
export type ModoSubida = "individual" | "masivo";

interface SubidaContextValue {
  modo: ModoSubida;
  setModo: (m: ModoSubida) => void;
  fase: FaseSubida;
  generos: Genero[];

  archivo: File | null;
  setArchivo: (f: File | null) => void;
  titulo: string;
  setTitulo: (v: string) => void;
  artistaOriginal: string;
  setArtistaOriginal: (v: string) => void;
  remixer: string;
  setRemixer: (v: string) => void;
  generoId: string;
  setGeneroId: (v: string) => void;
  keyArmonica: string;
  setKeyArmonica: (v: string) => void;
  bpmManual: string;
  setBpmManual: (v: string) => void;
  tags: string;
  setTags: (v: string) => void;

  analisis: AnalisisTrack | null;
  usarCaratulaOriginal: boolean;
  setUsarCaratulaOriginal: (v: boolean) => void;
  confirmoDuplicado: boolean;
  setConfirmoDuplicado: (v: boolean) => void;
  error: string | null;
  tituloSubido: string;

  reiniciarTodo: () => void;
  volverAFormulario: () => void;
  handleAnalizar: () => Promise<void>;
  handleConfirmar: () => Promise<void>;
}

const SubidaContext = createContext<SubidaContextValue | null>(null);

/**
 * Todo el estado de "Subir Track" en modo individual (archivo elegido,
 * formulario, resultado del análisis, fase en la que está) vive acá.
 *
 * Antes esto era estado local de SubirTrackPage: al navegar a otra
 * pantalla (por ejemplo para escuchar algo en el Catálogo mientras se
 * decide qué tonalidad poner) React desmontaba la página y se perdía
 * todo — el archivo elegido, el análisis ya hecho, todo. Este contexto
 * se monta una sola vez por encima de las rutas (ver App.tsx) para que
 * sobreviva a la navegación; SubirTrackPage ahora solo lo consume y
 * dibuja la pantalla.
 */
export function SubidaProvider({ children }: { children: ReactNode }) {
  const { perfil } = useAuth();
  const [modo, setModo] = useState<ModoSubida>("individual");
  const [fase, setFase] = useState<FaseSubida>("formulario");
  const [generos, setGeneros] = useState<Genero[]>([]);

  const [archivo, setArchivo] = useState<File | null>(null);
  const [titulo, setTitulo] = useState("");
  const [artistaOriginal, setArtistaOriginal] = useState("");
  const [remixer, setRemixer] = useState("");
  const [generoId, setGeneroId] = useState("");
  const [keyArmonica, setKeyArmonica] = useState("");
  const [bpmManual, setBpmManual] = useState("");
  const [tags, setTags] = useState("");

  const [analisis, setAnalisis] = useState<AnalisisTrack | null>(null);
  const [usarCaratulaOriginal, setUsarCaratulaOriginal] = useState(true);
  const [confirmoDuplicado, setConfirmoDuplicado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tituloSubido, setTituloSubido] = useState("");

  useEffect(() => {
    // Prellenar el remixer con el nombre de DJ del perfil, si lo tiene.
    if (perfil?.nombre_dj) setRemixer(perfil.nombre_dj);
  }, [perfil?.nombre_dj]);

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

  function reiniciarTodo() {
    setArchivo(null);
    setTitulo("");
    setArtistaOriginal("");
    setRemixer(perfil?.nombre_dj ?? "");
    setGeneroId("");
    setKeyArmonica("");
    setBpmManual("");
    setTags("");
    setAnalisis(null);
    setUsarCaratulaOriginal(true);
    setConfirmoDuplicado(false);
    setError(null);
    setFase("formulario");
  }

  function volverAFormulario() {
    // Vuelve a editar sin perder lo ya tipeado, pero descarta el análisis
    // (el archivo en staging en el backend queda ahí hasta que venza, no pasa nada).
    setAnalisis(null);
    setUsarCaratulaOriginal(true);
    setConfirmoDuplicado(false);
    setFase("formulario");
  }

  async function handleAnalizar() {
    setError(null);
    if (!archivo) {
      setError("Elegí un archivo de audio primero.");
      return;
    }
    if (!titulo.trim()) {
      setError("Poné un título para el track.");
      return;
    }

    setFase("analizando");
    try {
      const resultado = await analizarTrack(archivo, titulo.trim(), remixer.trim());
      setAnalisis(resultado);
      if (resultado.bpm_detectado != null) {
        setBpmManual(
          resultado.bpm_detectado % 1 === 0
            ? String(resultado.bpm_detectado)
            : resultado.bpm_detectado.toFixed(1),
        );
      }
      if (resultado.key_detectada) {
        setKeyArmonica(resultado.key_detectada);
      }
      setFase("revision");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : mensajeErrorAmigable(e));
      setFase("formulario");
    }
  }

  async function handleConfirmar() {
    if (!analisis) return;
    setError(null);
    setFase("confirmando");
    try {
      const tagsArr = tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      await confirmarSubida({
        staging_id: analisis.staging_id,
        titulo: titulo.trim(),
        artista_original: artistaOriginal.trim() || null,
        remixer: remixer.trim() || null,
        genero_id: generoId || null,
        bpm: bpmManual ? Number(bpmManual) : null,
        key_armonica: keyArmonica || null,
        tags: tagsArr,
        usar_caratula_original: usarCaratulaOriginal,
      });

      setTituloSubido(titulo.trim());
      setFase("listo");
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        // El staging venció (30 min) — hay que volver a analizar el archivo.
        setError(`${e.message} Volvé a analizarlo.`);
        setAnalisis(null);
        setFase("formulario");
      } else {
        setError(e instanceof ApiError ? e.message : mensajeErrorAmigable(e));
        setFase("revision");
      }
    }
  }

  return (
    <SubidaContext.Provider
      value={{
        modo,
        setModo,
        fase,
        generos,
        archivo,
        setArchivo,
        titulo,
        setTitulo,
        artistaOriginal,
        setArtistaOriginal,
        remixer,
        setRemixer,
        generoId,
        setGeneroId,
        keyArmonica,
        setKeyArmonica,
        bpmManual,
        setBpmManual,
        tags,
        setTags,
        analisis,
        usarCaratulaOriginal,
        setUsarCaratulaOriginal,
        confirmoDuplicado,
        setConfirmoDuplicado,
        error,
        tituloSubido,
        reiniciarTodo,
        volverAFormulario,
        handleAnalizar,
        handleConfirmar,
      }}
    >
      {children}
    </SubidaContext.Provider>
  );
}

export function useSubida(): SubidaContextValue {
  const ctx = useContext(SubidaContext);
  if (!ctx) throw new Error("useSubida debe usarse dentro de <SubidaProvider>");
  return ctx;
}
