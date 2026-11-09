import { useEffect, useRef } from "react";
import { CAMELOT_KEYS, formatearDuracion } from "../lib/format";
import { useSubida } from "../lib/subida";
import CargaMasiva from "../components/CargaMasiva";
import AudioPreviewLocal from "../components/AudioPreviewLocal";

export default function SubirTrackPage() {
  const {
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
  } = useSubida();

  const inputArchivoRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    // El <input type="file"> es un elemento del DOM de esta página, no
    // del contexto (que sobrevive a la navegación) — si se reinicia todo
    // (archivo === null) hay que limpiar también lo que el navegador
    // muestra como "elegido" en el input nativo.
    if (archivo === null && inputArchivoRef.current) {
      inputArchivoRef.current.value = "";
    }
  }, [archivo]);

  const hayDuplicados = (analisis?.duplicados_sospechosos.length ?? 0) > 0;
  const puedeConfirmar = !hayDuplicados || confirmoDuplicado;

  if (modo === "masivo") {
    return (
      <div className="flex flex-col gap-6">
        <SelectorModo modo={modo} onCambiar={setModo} />
        <CargaMasiva />
      </div>
    );
  }

  if (fase === "listo") {
    return (
      <div className="flex flex-col items-start gap-4 py-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-lime text-ink-fixed text-xs font-semibold">
          Subido
        </div>
        <h1 className="font-display font-extrabold text-3xl tracking-[-0.5px] m-0">
          "{tituloSubido}" ya está en el catálogo
        </h1>
        <p className="text-body text-base leading-relaxed m-0">
          Ya lo pueden ver y descargar el resto de los DJs del club.
        </p>
        <button
          type="button"
          onClick={reiniciarTodo}
          className="text-sm font-semibold bg-ink text-cream px-5 py-2.5 rounded-full appearance-none border-none cursor-pointer"
        >
          Subir otro track
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <SelectorModo modo={modo} onCambiar={setModo} />
      <div>
        <h1 className="font-display font-extrabold text-3xl tracking-[-0.5px] m-0">Subir track</h1>
        <p className="text-muted text-sm mt-1">
          Se transcodea a MP3 320kbps, se detecta BPM y tonalidad, y se chequea contra el catálogo por si ya existe.
        </p>
      </div>

      {error && (
        <p className="text-sm text-accent font-medium bg-card border border-border-soft rounded-xl px-4 py-3 m-0">
          {error}
        </p>
      )}

      <div className="bg-card rounded-2xl border border-border-soft p-6 flex flex-col gap-5">
        {/* Archivo */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-body">Archivo de audio</label>
          <input
            ref={inputArchivoRef}
            type="file"
            accept="audio/*"
            disabled={fase !== "formulario"}
            onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
            className="hidden"
            id="archivo"
          />
          <label
            htmlFor="archivo"
            className={`flex items-center justify-between gap-3 px-4 py-3.5 rounded-lg border border-dashed border-border text-sm cursor-pointer bg-cream-soft ${fase !== "formulario" ? "opacity-60 pointer-events-none" : "hover:border-ink"}`}
          >
            <span className={archivo ? "font-medium" : "text-muted"}>
              {archivo ? archivo.name : "Elegí un archivo (MP3, WAV, FLAC, lo que sea)"}
            </span>
            <span className="text-xs font-semibold text-muted shrink-0">
              {archivo ? `${(archivo.size / (1024 * 1024)).toFixed(1)} MB` : "Elegir"}
            </span>
          </label>
          {archivo && <AudioPreviewLocal archivo={archivo} />}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="titulo" className="text-xs font-semibold text-body">
              Título *
            </label>
            <input
              id="titulo"
              type="text"
              value={titulo}
              disabled={fase !== "formulario"}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Nombre del remix/edit"
              className="px-3 py-2 rounded-lg border border-border text-sm bg-cream-soft focus:outline-2 focus:outline-accent disabled:opacity-60"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="remixer" className="text-xs font-semibold text-body">
              Remixer
            </label>
            <input
              id="remixer"
              type="text"
              value={remixer}
              disabled={fase !== "formulario"}
              onChange={(e) => setRemixer(e.target.value)}
              placeholder="Tu nombre de DJ"
              className="px-3 py-2 rounded-lg border border-border text-sm bg-cream-soft disabled:opacity-60"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="artistaOriginal" className="text-xs font-semibold text-body">
              Artista original
            </label>
            <input
              id="artistaOriginal"
              type="text"
              value={artistaOriginal}
              disabled={fase !== "formulario"}
              onChange={(e) => setArtistaOriginal(e.target.value)}
              placeholder="Opcional"
              className="px-3 py-2 rounded-lg border border-border text-sm bg-cream-soft disabled:opacity-60"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="genero" className="text-xs font-semibold text-body">
              Género
            </label>
            <select
              id="genero"
              value={generoId}
              disabled={fase !== "formulario"}
              onChange={(e) => setGeneroId(e.target.value)}
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

          <div className="flex flex-col gap-1.5">
            <label htmlFor="key" className="text-xs font-semibold text-body">
              Tonalidad (Camelot){analisis?.key_detectada ? " — detectada, editable" : ""}
            </label>
            <select
              id="key"
              value={keyArmonica}
              disabled={fase !== "formulario" && fase !== "revision"}
              onChange={(e) => setKeyArmonica(e.target.value)}
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

          <div className="flex flex-col gap-1.5">
            <label htmlFor="tags" className="text-xs font-semibold text-body">
              Tags
            </label>
            <input
              id="tags"
              type="text"
              value={tags}
              disabled={fase !== "formulario" && fase !== "revision"}
              onChange={(e) => setTags(e.target.value)}
              placeholder="separados, por, coma"
              className="px-3 py-2 rounded-lg border border-border text-sm bg-cream-soft disabled:opacity-60"
            />
          </div>
        </div>

        {fase === "formulario" && (
          <button
            type="button"
            onClick={handleAnalizar}
            className="self-start text-sm font-semibold bg-ink text-cream px-5 py-2.5 rounded-full appearance-none border-none cursor-pointer"
          >
            Analizar archivo
          </button>
        )}

        {fase === "analizando" && (
          <p className="text-sm text-muted font-medium m-0">
            Transcodificando a MP3 320, detectando BPM/tonalidad y buscando duplicados…
          </p>
        )}
      </div>

      {(fase === "revision" || fase === "confirmando") && analisis && (
        <div className="bg-card rounded-2xl border border-border-soft p-6 flex flex-col gap-5">
          <div>
            <h2 className="font-display font-bold text-lg m-0">Resultado del análisis</h2>
            <p className="text-xs text-muted mt-1 m-0">
              Archivo original: {analisis.nombre_original} · {analisis.tamano_mb.toFixed(1)} MB
            </p>
          </div>

          <div className="flex flex-wrap gap-6">
            <div>
              <div className="text-xs font-semibold text-muted">Duración</div>
              <div className="text-sm font-semibold">{formatearDuracion(analisis.duracion_seg)}</div>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="bpmManual" className="text-xs font-semibold text-muted">
                BPM detectado (editable)
              </label>
              <input
                id="bpmManual"
                type="number"
                step="0.1"
                value={bpmManual}
                disabled={fase === "confirmando"}
                onChange={(e) => setBpmManual(e.target.value)}
                className="w-24 px-2 py-1.5 rounded-lg border border-border text-sm bg-cream-soft disabled:opacity-60"
              />
            </div>
          </div>

          {analisis.advertencias.length > 0 && (
            <div className="bg-cream rounded-xl px-4 py-3 flex flex-col gap-1">
              {analisis.advertencias.map((a, i) => (
                <p key={i} className="text-xs text-muted m-0">
                  ⚠ {a}
                </p>
              ))}
            </div>
          )}

          {analisis.tiene_caratula_original && (
            <div className="bg-cream rounded-xl p-4 flex flex-col gap-3">
              <p className="text-sm font-semibold m-0">Este archivo trae una portada propia</p>
              <div className="flex items-start gap-4">
                {analisis.caratula_original_preview && (
                  <img
                    src={analisis.caratula_original_preview}
                    alt="Portada embebida en el archivo"
                    className="w-20 h-20 rounded-lg object-cover border border-border-soft shrink-0"
                  />
                )}
                <div className="flex flex-col gap-2">
                  <label className="flex items-start gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="caratula"
                      checked={usarCaratulaOriginal}
                      disabled={fase === "confirmando"}
                      onChange={() => setUsarCaratulaOriginal(true)}
                      className="w-4 h-4 accent-accent mt-0.5"
                    />
                    <span>Mantener la portada que trae el archivo</span>
                  </label>
                  <label className="flex items-start gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="caratula"
                      checked={!usarCaratulaOriginal}
                      disabled={fase === "confirmando"}
                      onChange={() => setUsarCaratulaOriginal(false)}
                      className="w-4 h-4 accent-accent mt-0.5"
                    />
                    <span>Usar la portada de ClubPack (por si la original es de otro servicio y no queda bien)</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {hayDuplicados && (
            <div className="bg-accent/5 border border-accent/30 rounded-xl p-4 flex flex-col gap-3">
              <p className="text-sm font-semibold text-accent m-0">
                Encontramos {analisis.duplicados_sospechosos.length} track(s) parecido(s) ya en el catálogo:
              </p>
              <ul className="flex flex-col gap-1.5 m-0 pl-0 list-none">
                {analisis.duplicados_sospechosos.map((d) => (
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
                  checked={confirmoDuplicado}
                  disabled={fase === "confirmando"}
                  onChange={(e) => setConfirmoDuplicado(e.target.checked)}
                  className="w-4 h-4 accent-accent"
                />
                Confirmo que no es un duplicado, quiero subirlo igual.
              </label>
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleConfirmar}
              disabled={!puedeConfirmar || fase === "confirmando"}
              className="text-sm font-semibold bg-accent text-white px-5 py-2.5 rounded-full appearance-none border-none cursor-pointer disabled:opacity-60"
            >
              {fase === "confirmando" ? "Subiendo…" : "Confirmar subida"}
            </button>
            <button
              type="button"
              onClick={volverAFormulario}
              disabled={fase === "confirmando"}
              className="text-sm font-semibold text-muted hover:text-ink px-3 py-2.5 appearance-none bg-transparent border-none cursor-pointer disabled:opacity-60"
            >
              Cambiar archivo o datos
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SelectorModo({
  modo,
  onCambiar,
}: {
  modo: "individual" | "masivo";
  onCambiar: (m: "individual" | "masivo") => void;
}) {
  return (
    <div className="inline-flex self-start rounded-full border border-border bg-cream-soft p-1 gap-1">
      <button
        type="button"
        onClick={() => onCambiar("individual")}
        className={`text-xs font-semibold px-3 py-1.5 rounded-full appearance-none border-none cursor-pointer ${
          modo === "individual" ? "bg-ink text-cream" : "bg-transparent text-muted"
        }`}
      >
        Uno por uno
      </button>
      <button
        type="button"
        onClick={() => onCambiar("masivo")}
        className={`text-xs font-semibold px-3 py-1.5 rounded-full appearance-none border-none cursor-pointer ${
          modo === "masivo" ? "bg-ink text-cream" : "bg-transparent text-muted"
        }`}
      >
        Carga masiva
      </button>
    </div>
  );
}
