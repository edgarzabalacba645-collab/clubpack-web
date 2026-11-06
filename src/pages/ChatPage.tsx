import { useEffect, useRef, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { mensajeErrorAmigable } from "../lib/format";
import type { MensajeChat, MensajeChatInsert } from "../lib/types";

const LIMITE_HISTORIAL = 100;

export default function ChatPage() {
  const { session, perfil } = useAuth();
  const [mensajes, setMensajes] = useState<MensajeChat[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);

  const finRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let activo = true;

    (async () => {
      setCargando(true);
      try {
        const { data, error } = await supabase
          .from("mensajes_chat")
          .select("id, usuario_id, mensaje, fecha, perfiles(nombre_dj, email)")
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
    if (!session || !texto.trim()) return;
    setEnviando(true);
    setError(null);
    try {
      const nuevo: MensajeChatInsert = { usuario_id: session.user.id, mensaje: texto.trim() };
      const { error } = await supabase.from("mensajes_chat").insert(nuevo);
      if (error) throw error;
      setTexto("");
    } catch (e) {
      setError(mensajeErrorAmigable(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 h-full">
      <div>
        <h1 className="font-display font-extrabold text-3xl tracking-[-0.5px] m-0">Chat</h1>
        <p className="text-muted text-sm mt-1">
          Pedí un tema, una versión que te falte, o simplemente charlá con el grupo.
        </p>
      </div>

      <div className="bg-card rounded-2xl border border-border-soft flex flex-col h-[60vh] min-h-[360px]">
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
          {cargando && <p className="text-sm text-muted text-center m-0">Cargando…</p>}
          {!cargando && error && <p className="text-sm text-accent text-center m-0">{error}</p>}
          {!cargando && !error && mensajes.length === 0 && (
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
                  className={`flex flex-col gap-0.5 max-w-[80%] ${esPropio ? "self-end items-end" : "self-start items-start"}`}
                >
                  {!esPropio && <span className="text-xs font-semibold text-muted px-1">{nombre}</span>}
                  <div
                    className={`rounded-2xl px-4 py-2.5 text-sm break-words ${
                      esPropio ? "bg-ink text-cream" : "bg-cream border border-border-soft"
                    }`}
                  >
                    {m.mensaje}
                  </div>
                </div>
              );
            })}
          <div ref={finRef} />
        </div>

        <form onSubmit={enviar} className="flex items-center gap-2 px-4 py-3 border-t border-border-soft">
          <input
            type="text"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={perfil ? `Escribí algo, ${perfil.nombre_dj ?? ""}…` : "Escribí un mensaje…"}
            maxLength={1000}
            className="flex-1 px-3.5 py-2.5 rounded-xl border border-border text-sm bg-cream-soft focus:outline-2 focus:outline-accent"
          />
          <button
            type="submit"
            disabled={enviando || !texto.trim()}
            className="text-sm font-semibold bg-ink text-cream px-5 py-2.5 rounded-full appearance-none border-none cursor-pointer disabled:opacity-60 shrink-0"
          >
            Enviar
          </button>
        </form>
      </div>
    </div>
  );
}
