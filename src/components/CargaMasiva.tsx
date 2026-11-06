import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  ApiError,
  analizarTrack,
  confirmarSubida,
  type DuplicadoCandidato,
} from "../lib/api";
import { CAMELOT_KEYS, formatearDuracion, mensajeErrorAmigable } from "../lib/format";
import type { Genero } from "../lib/types";
import { useAuth } from "../lib/auth";

type EstadoFila = "pendiente" | "analizando" | "revision" | "subiendo" | "listo" | "error";

interface FilaMasiva {
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
}

function tituloDesdeNombreArchivo(nombre: string): string {
  const sinExtension = nombre.replace(/\.[^/.]+$/, "");
  return sinExtension.replace(/_+/g, " ").trim();
}

function idFila(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

export default function CargaMasiva() {
  const { perfil } = useAuth();
  const [generos, setGeneros] = useState<Genero[]>([]);
  const [filas, setFilas] = useState<FilaMasiva[]>([]);
  const [analizandoTodos, setAnalizandoTodos] = useState(false);
  const [confirmandoTodos, setConfirmandoTodos] = useState(false);
  const [remixerMasivo, setRemixerMasivo] = useState("");
  const [generoMasivoId, setGeneroMasivoId] = useState("");

  const inputArchivosRef = useRef<HTMLInputElement | null>(null);

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
    }));
    setFilas((prev) => [...prev, ...nuevas]);
    if (inputArchivosRef.current) inputArchivosRef.current.value = "";
  }

  function actualizarFila(id: string, cambios: Partial<FilaMasiva>) {
    setFilas((prev) => prev.map((f) => (f.id === id ? { ...f, ...cambios } : f)));
  }

  function quitarFila(id: string) {
    setFilas((prev) => prev.filter((f) => f.id !== id));
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

  const hayPendientesDeAnalizar = filas.some((f) => f.estado === "pendiente" || f.estado === "error");
  const hayListasParaConfirmar = filas.some(
    (f) => f.estado === "revision" && (f.duplicados.length === 0 || f.confirmoDuplicado),
  );
  const totalListo = filas.filter((f) => f.estado === "listo").length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display font-extrabold text-3xl tracking-[-0.5px] m-0">Carga masiva</h1>
        <p className="text-muted text-sm mt-1">
          Mismo proceso que subir de a uno (transcodifica, detecta BPM/tonalidad, chequea duplicados) pero
          para varios archivos juntos. Primero se analizan todos, después revisás/ajustás cada uno y
          confirmás.
        </p>
      </div>

      <div className="bg-card rounded-2xl border border-border-soft p-6 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-body">Archivos de audio</label>
          <input
            ref={inputArchivosRef}
            type="file"
            accept="audio/*"
            multiple
            onChange={(e) => agregarArchivos(e.target.files)}
            className="hidden"
            id="archivosMasivo"
          />
          <label
            htmlFor="archivosMasivo"
            className="flex items-center justify-between gap-3 px-4 py-3.5 rounded-lg border border-dashed border-border text-sm cursor-pointer bg-cream-soft hover:border-ink"
          >
            <span className="text-muted">Elegí uno o más archivos (podés sumar más después)</span>
            <span className="text-xs font-semibold text-muted shrink-0">Elegir</span>
          </label>
        </div>

        {filas.length > 0 && (
          <div className="flex flex-wrap items-end gap-3 pt-1">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-body">Remixer para todos</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={remixerMasivo}
                  onChange={(e) => setRemixerMasivo(e.target.value)}
                  placeholder="Tu nombre de DJ"
                  className="px-3 py-2 rounded-lg border border-border text-sm bg-cream-soft w-40"
                />
                <button
                  type="button"
                  onClick={aplicarRemixerATodos}
                  className="text-xs font-semibold px-3 py-2 rounded-lg border border-border hover:border-ink appearance-none bg-transparent cursor-pointer"
                >
                  Aplicar a todos
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-body">Género para todos</label>
              <div className="flex gap-2">
                <select
                  value={generoMasivoId}
                  onChange={(e) => setGeneroMasivoId(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-border text-sm bg-cream-soft w-40"
                >
                  <option value="">Elegir…</option>
                  {generos.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.nombre}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={aplicarGeneroATodos}
                  className="text-xs font-semibold px-3 py-2 rounded-lg border border-border hover:border-ink appearance-none bg-transparent cursor-pointer"
                >
                  Aplicar a todos
                </button>
              </div>
            </div>
          </div>
        )}

        {filas.length > 0 && (
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={analizarTodas}
              disabled={analizandoTodos || !hayPendientesDeAnalizar}
              className="text-sm font-semibold bg-ink text-cream px-5 py-2.5 rounded-full appearance-none border-none cursor-pointer disabled:opacity-60"
            >
              {analizandoTodos ? "Analizando…" : "Analizar todos"}
            </button>
            <button
              type="button"
              onClick={confirmarTodasListas}
              disabled={confirmandoTodos || !hayListasParaConfirmar}
              className="text-sm font-semibold bg-accent text-white px-5 py-2.5 rounded-full appearance-none border-none cursor-pointer disabled:opacity-60"
            >
              {confirmandoTodos ? "Subiendo…" : "Confirmar todos los listos"}
            </button>
            {totalListo > 0 && (
              <span className="text-sm text-muted self-center">{totalListo} ya subido{totalListo === 1 ? "" : "s"}</span>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4">
        {filas.map((f) => (
          <FilaMasivaCard
            key={f.id}
            fila={f}
            generos={generos}
            onCambiar={(cambios) => actualizarFila(f.id, cambios)}
            onQuitar={() => quitarFila(f.id)}
            onAnalizar={() => analizarUna(f)}
            onConfirmar={() => confirmarUna(f)}
          />
        ))}
      </div>
    </div>
  );
}

function FilaMasivaCard({
  fila,
  generos,
  onCambiar,
  onQuitar,
  onAnalizar,
  onConfirmar,
}: {
  fila: FilaMasiva;
  generos: Genero[];
  onCambiar: (cambios: Partial<FilaMasiva>) => void;
  onQuitar: () => void;
  onAnalizar: () => void;
  onConfirmar: () => void;
}) {
  const bloqueada = fila.estado === "analizando" || fila.estado === "subiendo" || fila.estado === "listo";
  const hayDuplicados = fila.duplicados.length > 0;
  const puedeConfirmar = fila.estado === "revision" && (!hayDuplicados || fila.confirmoDuplicado);

  return (
    <div className="bg-card rounded-2xl border border-border-soft p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate m-0">{fila.archivo.name}</p>
          <p className="text-xs text-muted m-0">
            {(fila.archivo.size / (1024 * 1024)).toFixed(1)} MB
            {fila.duracionSeg != null ? ` · ${formatearDuracion(fila.duracionSeg)}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <EstadoBadge estado={fila.estado} />
          {fila.estado !== "listo" && (
            <button
              type="button"
              onClick={onQuitar}
              className="text-xs text-muted hover:text-accent appearance-none bg-transparent border-none cursor-pointer px-1"
              aria-label="Quitar de la lista"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {fila.error && <p className="text-xs text-accent font-medium m-0">{fila.error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-body">Título *</label>
          <input
            type="text"
            value={fila.titulo}
            disabled={bloqueada}
            onChange={(e) => onCambiar({ titulo: e.target.value })}
            className="px-3 py-2 rounded-lg border border-border text-sm bg-cream-soft disabled:opacity-60"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-body">Remixer</label>
          <input
            type="text"
            value={fila.remixer}
            disabled={bloqueada}
            onChange={(e) => onCambiar({ remixer: e.target.value })}
            className="px-3 py-2 rounded-lg border border-border text-sm bg-cream-soft disabled:opacity-60"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-body">Artista original</label>
          <input
            type="text"
            value={fila.artistaOriginal}
            disabled={bloqueada}
            onChange={(e) => onCambiar({ artistaOriginal: e.target.value })}
            placeholder="Opcional"
            className="px-3 py-2 rounded-lg border border-border text-sm bg-cream-soft disabled:opacity-60"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-body">Género</label>
          <select
            value={fila.generoId}
            disabled={bloqueada}
            onChange={(e) => onCambiar({ generoId: e.target.value })}
            className="px-3 py-2 rounded-lg border border-border text-sm bg-cream-soft disabled:opacity-60"
          >
            <option value="">Sin especificar</option>
            {generos.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-body">Tonalidad</label>
          <select
            value={fila.keyArmonica}
            disabled={fila.estado === "analizando" || fila.estado === "subiendo" || fila.estado === "listo"}
            onChange={(e) => onCambiar({ keyArmonica: e.target.value })}
            className="px-3 py-2 rounded-lg border border-border text-sm bg-cream-soft disabled:opacity-60"
          >
            <option value="">Sin especificar</option>
            {CAMELOT_KEYS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-body">BPM</label>
          <input
            type="number"
            step="0.1"
            value={fila.bpm}
            disabled={fila.estado === "analizando" || fila.estado === "subiendo" || fila.estado === "listo"}
            onChange={(e) => onCambiar({ bpm: e.target.value })}
            className="px-3 py-2 rounded-lg border border-border text-sm bg-cream-soft disabled:opacity-60"
          />
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2 lg:col-span-3">
          <label className="text-xs font-semibold text-body">Tags</label>
          <input
            type="text"
            value={fila.tags}
            disabled={bloqueada}
            onChange={(e) => onCambiar({ tags: e.target.value })}
            placeholder="separados, por, coma"
            className="px-3 py-2 rounded-lg border border-border text-sm bg-cream-soft disabled:opacity-60"
          />
        </div>
      </div>

      {fila.advertencias.length > 0 && (
        <div className="bg-cream rounded-xl px-4 py-3 flex flex-col gap-1">
          {fila.advertencias.map((a, i) => (
            <p key={i} className="text-xs text-muted m-0">
              ⚠ {a}
            </p>
          ))}
        </div>
      )}

      {hayDuplicados && (
        <div className="bg-accent/5 border border-accent/30 rounded-xl p-4 flex flex-col gap-3">
          <p className="text-sm font-semibold text-accent m-0">
            Encontramos {fila.duplicados.length} track(s) parecido(s) ya en el catálogo:
          </p>
          <ul className="flex flex-col gap-1.5 m-0 pl-0 list-none">
            {fila.duplicados.map((d) => (
              <li key={d.id} className="text-sm flex items-center justify-between gap-3">
                <span>
                  {d.titulo}
                  {d.remixer ? ` · ${d.remixer}` : ""}
                </span>
                <span className="text-xs text-muted shrink-0">{Math.round(d.similitud * 100)}% similar</span>
              </li>
            ))}
          </ul>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={fila.confirmoDuplicado}
              disabled={fila.estado === "subiendo" || fila.estado === "listo"}
              onChange={(e) => onCambiar({ confirmoDuplicado: e.target.checked })}
              className="w-4 h-4 accent-accent"
            />
            Confirmo que no es un duplicado, quiero subirlo igual.
          </label>
        </div>
      )}

      <div className="flex gap-3">
        {(fila.estado === "pendiente" || fila.estado === "error") && (
          <button
            type="button"
            onClick={onAnalizar}
            disabled={!fila.titulo.trim()}
            className="text-sm font-semibold bg-ink text-cream px-4 py-2 rounded-full appearance-none border-none cursor-pointer disabled:opacity-60"
          >
            Analizar
          </button>
        )}
        {fila.estado === "revision" && (
          <button
            type="button"
            onClick={onConfirmar}
            disabled={!puedeConfirmar}
            className="text-sm font-semibold bg-accent text-white px-4 py-2 rounded-full appearance-none border-none cursor-pointer disabled:opacity-60"
          >
            Confirmar subida
          </button>
        )}
      </div>
    </div>
  );
}

function EstadoBadge({ estado }: { estado: EstadoFila }) {
  const estilos: Record<EstadoFila, string> = {
    pendiente: "bg-cream text-muted",
    analizando: "bg-accent-teal/20 text-ink-fixed",
    revision: "bg-accent-violet/10 text-accent-violet",
    subiendo: "bg-accent-teal/20 text-ink-fixed",
    listo: "bg-accent-lime text-ink-fixed",
    error: "bg-accent/10 text-accent",
  };
  const etiquetas: Record<EstadoFila, string> = {
    pendiente: "Pendiente",
    analizando: "Analizando…",
    revision: "Para revisar",
    subiendo: "Subiendo…",
    listo: "Subido",
    error: "Error",
  };
  return (
    <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full shrink-0 ${estilos[estado]}`}>
      {etiquetas[estado]}
    </span>
  );
}
