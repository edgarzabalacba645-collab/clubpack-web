import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth, tieneAccesoActivo, MENSAJE_SIN_ACCESO_ACTIVO } from "../lib/auth";
import { mensajeErrorAmigable } from "../lib/format";
import { ApiError, limpiarChat, obtenerUrlAudioChat, subirAudioChat } from "../lib/api";
import { useSubida } from "../lib/subida";
import type { MensajeChat, MensajeChatInsert } from "../lib/types";

const LIMITE_HISTORIAL = 100;

// Mismas 3 extensiones que acepta el backend (ver EXTENSIONES_PERMITIDAS
// en app/routers/chat.py) — esto es solo para el filtro del selector de
// archivos y un aviso rápido; la validación que de verdad importa es la
// del backend.
const EXTENSIONES_AUDIO_PERMITIDAS = ["mp3", "wav", "flac"];
const MENSAJE_SIN_TEXTO_CON_AUDIO = "🎵 Audio compartido";

function IconPaperclip() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21.44 11.05 12.25 20.24a5 5 0 0 1-7.07-7.07l9.19-9.19a3.5 3.5 0 0 1 4.95 4.95l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

function IconPlay() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function formatearDuracionCorta(segundos: number | null): string {
  if (segundos == null) return "";
  const m = Math.floor(segundos / 60);
  const s = Math.round(segundos % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function ReproductorAudioChat({ mensaje }: { mensaje: MensajeChat }) {
  const { perfil } = useAuth();
  const { handleAnalizarDesdeChat } = useSubida();
  const navigate = useNavigate();
  const [url, setUrl] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reproducir() {
    setCargando(true);
    setError(null);
    try {
      const { url } = await obtenerUrlAudioChat(mensaje.id);
      setUrl(url);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : mensajeErrorAmigable(e));
    } finally {
      setCargando(false);
    }
  }

  async function subirAlCatalogo() {
    setSubiendo(true);
    setError(null);
    // handleAnalizarDesdeChat ya se guarda el resultado (o el error) en
    // el contexto de subida (ver subida.tsx) — por eso acá no hace falta
    // try/catch: si falla, /subir va a mostrar ese error en su propia
    // pantalla en vez de quedarnos nosotros mostrándolo acá.
    await handleAnalizarDesdeChat(mensaje.id, mensaje.audio_nombre_original ?? "audio.mp3");
    navigate("/subir");
  }

  return (
    <div className="flex flex-col gap-1.5 min-w-0 w-[220px] max-w-full">
      {/* min-w-0 en la fila y en el span del nombre es lo que deja que
          "truncate" corte de verdad: un <span> dentro de un flex row no se
          achica por debajo de su contenido salvo que se le fuerce min-w-0,
          así que un nombre de archivo largo (sin espacios donde cortar)
          empujaba todo el mensaje más ancho que la pantalla en el celular. */}
      <div className="flex items-center gap-2 text-xs opacity-80 min-w-0">
        <span className="shrink-0">🎵</span>
        <span className="truncate min-w-0 flex-1">{mensaje.audio_nombre_original ?? "audio"}</span>
        {mensaje.audio_tamano_mb != null && <span className="shrink-0">· {mensaje.audio_tamano_mb}MB</span>}
        {mensaje.audio_duracion_seg != null && (
          <span className="shrink-0">· {formatearDuracionCorta(mensaje.audio_duracion_seg)}</span>
        )}
      </div>
      {url ? (
        <audio controls autoPlay src={url} className="h-9 w-full" />
      ) : (
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={reproducir}
            disabled={cargando}
            className="self-start inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-black/10 dark:bg-white/15 appearance-none border-none cursor-pointer disabled:opacity-60"
          >
            <IconPlay />
            {cargando ? "Cargando…" : "Reproducir"}
          </button>
          {perfil?.rol === "admin" && (
            <button
              type="button"
              onClick={subirAlCatalogo}
              disabled={subiendo}
              title="Analiza este audio y lo deja listo para completar los datos y subirlo al catálogo"
              className="self-start inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-accent text-white appearance-none border-none cursor-pointer disabled:opacity-60"
            >
              {subiendo ? "Abriendo…" : "Subir al catálogo"}
            </button>
          )}
        </div>
      )}
      {error && <p className="text-xs text-accent m-0">{error}</p>}
    </div>
  );
}

export default function ChatPage() {
  const { session, perfil } = useAuth();
  const [mensajes, setMensajes] = useState<MensajeChat[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [archivoAudio, setArchivoAudio] = useState<File | null>(null);
  const [limpiando, setLimpiando] = useState(false);

  const finRef = useRef<HTMLDivElement | null>(null);
  const inputAudioRef = useRef<HTMLInputElement | null>(null);

  function elegirAudio(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file) {
      setArchivoAudio(null);
      return;
    }
    const extension = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
    if (!EXTENSIONES_AUDIO_PERMITIDAS.includes(extension)) {
      setError("Ese formato no se puede compartir en el chat — subí mp3, wav o flac.");
      if (inputAudioRef.current) inputAudioRef.current.value = "";
      return;
    }
    setError(null);
    setArchivoAudio(file);
  }

  useEffect(() => {
    let activo = true;

    (async () => {
      setCargando(true);
      try {
        const { data, error } = await supabase
          .from("mensajes_chat")
          .select(
            "id, usuario_id, mensaje, fecha, audio_storage_path, audio_nombre_original, audio_tamano_mb, audio_duracion_seg, perfiles(nombre_dj, email)",
          )
          .order("fecha", { ascending: false })
          .limit(LIMITE_HISTORIAL);
        if (error) throw error;
        if (activo) setMensajes(((data ?? []) as unknown as MensajeChat[]).reverse());
      } catch (e) {
        if (activo) setError(mensajeErrorAmigable(e));
      } finally {
        if (activo) setCargando(false);
      }
    })();

    // Realtime: cada mensaje nuevo (de cualquiera) llega sin recargar.
    // El insert ya viene con los campos de la tabla, pero no con el join a
    // perfiles — se pide aparte para mostrar el nombre de quien lo mandó.
    const canal = supabase
      .channel("mensajes_chat-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "mensajes_chat" },
        async (payload) => {
          const nuevo = payload.new as MensajeChat;
          const { data: perfilAutor } = await supabase
            .from("perfiles")
            .select("nombre_dj, email")
            .eq("id", nuevo.usuario_id)
            .maybeSingle();
          if (!activo) return;
          setMensajes((prev) => {
            if (prev.some((m) => m.id === nuevo.id)) return prev;
            return [...prev, { ...nuevo, perfiles: perfilAutor }];
          });
        },
      )
      // Para que "Limpiar chat" (ver handleLimpiar) se refleje al toque
      // en el resto de los que tienen el chat abierto, no solo recargando.
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "mensajes_chat" },
        (payload) => {
          const borrado = payload.old as Partial<MensajeChat>;
          if (!activo || !borrado.id) return;
          setMensajes((prev) => prev.filter((m) => m.id !== borrado.id));
        },
      )
      .subscribe();

    return () => {
      activo = false;
      supabase.removeChannel(canal);
    };
  }, []);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [mensajes.length]);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!session || (!texto.trim() && !archivoAudio)) return;
    // Mismo chequeo que en Catálogo/Playlists — si no, el insert lo
    // rechaza igual por RLS, pero con el mensaje crudo de Postgres.
    if (!tieneAccesoActivo(perfil)) {
      setError(MENSAJE_SIN_ACCESO_ACTIVO);
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      const nuevo: MensajeChatInsert = {
        usuario_id: session.user.id,
        mensaje: texto.trim() || MENSAJE_SIN_TEXTO_CON_AUDIO,
      };

      if (archivoAudio) {
        // El audio sube primero (necesita las credenciales de R2, por eso
        // pasa por el backend) — recién con la referencia en mano se
        // inserta el mensaje, para no dejar un mensaje "a medio subir".
        const subido = await subirAudioChat(archivoAudio);
        nuevo.audio_storage_path = subido.storage_path;
        nuevo.audio_nombre_original = subido.nombre_original;
        nuevo.audio_tamano_mb = subido.tamano_mb;
        nuevo.audio_duracion_seg = subido.duracion_seg;
      }

      const { error } = await supabase.from("mensajes_chat").insert(nuevo);
      if (error) throw error;
      setTexto("");
      setArchivoAudio(null);
      if (inputAudioRef.current) inputAudioRef.current.value = "";
    } catch (e) {
      setError(e instanceof ApiError ? e.message : mensajeErrorAmigable(e));
    } finally {
      setEnviando(false);
    }
  }

  async function handleLimpiar() {
    if (!window.confirm("¿Vaciar todo el chat? Se borran todos los mensajes (y los audios adjuntos). No se puede deshacer.")) {
      return;
    }
    setLimpiando(true);
    setError(null);
    try {
      await limpiarChat();
      setMensajes([]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : mensajeErrorAmigable(e));
    } finally {
      setLimpiando(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 h-full">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display font-extrabold text-3xl tracking-[-0.5px] m-0">Chat</h1>
          <p className="text-muted text-sm mt-1">
            Pedí un tema, una versión que te falte, o simplemente charlá con el grupo.
          </p>
        </div>
        {perfil?.rol === "admin" && mensajes.length > 0 && (
          <button
            type="button"
            onClick={handleLimpiar}
            disabled={limpiando}
            className="shrink-0 text-xs font-semibold text-accent px-3 py-2 rounded-full border border-accent/30 bg-transparent appearance-none cursor-pointer disabled:opacity-60"
          >
            {limpiando ? "Vaciando…" : "Limpiar chat"}
          </button>
        )}
      </div>

      <div className="bg-card rounded-2xl border border-border-soft flex flex-col h-[60vh] min-h-[360px]">
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
          {cargando && <p className="text-sm text-muted text-center m-0">Cargando…</p>}
          {!cargando && error && <p className="text-sm text-accent text-center m-0">{error}</p>}
          {/* Igual que en Herramientas: sin acceso activo, RLS devuelve el
              historial vacío (no un error) — sin esto se veía igual que
              "no hay mensajes todavía" aunque el chat esté lleno. */}
          {!cargando && !error && mensajes.length === 0 && !tieneAccesoActivo(perfil) && (
            <p className="text-sm text-muted text-center m-0">
              El chat es parte de la suscripción mensual — suscribite para verlo y participar.
            </p>
          )}
          {!cargando && !error && mensajes.length === 0 && tieneAccesoActivo(perfil) && (
            <p className="text-sm text-muted text-center m-0">
              Todavía no hay mensajes — arrancá la charla.
            </p>
          )}
          {!cargando &&
            !error &&
            mensajes.map((m) => {
              const esPropio = m.usuario_id === session?.user.id;
              const nombre = m.perfiles?.nombre_dj || m.perfiles?.email || "DJ";
              return (
                <div
                  key={m.id}
                  className={`flex flex-col gap-0.5 max-w-[80%] min-w-0 ${esPropio ? "self-end items-end" : "self-start items-start"}`}
                >
                  {!esPropio && <span className="text-xs font-semibold text-muted px-1">{nombre}</span>}
                  <div
                    className={`rounded-2xl px-4 py-2.5 text-sm break-words overflow-hidden flex flex-col gap-2 ${
                      esPropio ? "bg-ink text-cream" : "bg-cream border border-border-soft"
                    }`}
                  >
                    {m.mensaje}
                    {m.audio_storage_path && <ReproductorAudioChat mensaje={m} />}
                  </div>
                </div>
              );
            })}
          <div ref={finRef} />
        </div>

        {archivoAudio && (
          <div className="flex items-center gap-2 px-4 pt-3 text-xs text-muted">
            <span className="truncate">🎵 {archivoAudio.name}</span>
            <button
              type="button"
              onClick={() => {
                setArchivoAudio(null);
                if (inputAudioRef.current) inputAudioRef.current.value = "";
              }}
              className="shrink-0 font-semibold text-accent appearance-none border-none bg-transparent cursor-pointer p-0"
            >
              Quitar
            </button>
          </div>
        )}

        <form onSubmit={enviar} className="flex items-center gap-2 px-4 py-3 border-t border-border-soft">
          <input
            ref={inputAudioRef}
            type="file"
            accept=".mp3,.wav,.flac,audio/mpeg,audio/wav,audio/x-wav,audio/flac"
            onChange={elegirAudio}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => inputAudioRef.current?.click()}
            title="Adjuntar audio (mp3, wav o flac)"
            className="shrink-0 w-10 h-10 flex items-center justify-center rounded-full border border-border bg-cream-soft text-body appearance-none cursor-pointer"
          >
            <IconPaperclip />
          </button>
          <input
            type="text"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={perfil ? `Escribí algo, ${perfil.nombre_dj ?? ""}…` : "Escribí un mensaje…"}
            maxLength={1000}
            className="flex-1 min-w-0 px-3.5 py-2.5 rounded-xl border border-border text-sm bg-cream-soft focus:outline-2 focus:outline-accent"
          />
          <button
            type="submit"
            disabled={enviando || (!texto.trim() && !archivoAudio)}
            className="text-sm font-semibold bg-ink text-cream px-5 py-2.5 rounded-full appearance-none border-none cursor-pointer disabled:opacity-60 shrink-0"
          >
            {enviando && archivoAudio ? "Subiendo…" : "Enviar"}
          </button>
        </form>
      </div>
    </div>
  );
}
