import { useEffect, useMemo, useState } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import type { AppShellContext } from "../components/AppShell";
import CarruselHorizontal from "../components/CarruselHorizontal";
import { supabase } from "../lib/supabase";
import {
  abrirDescargaDirecta,
  ApiError,
  borrarTrackAdmin,
  descargarVariosDirecto,
  descargarZip,
  obtenerUrlDescarga,
  subirPortada,
} from "../lib/api";
import {
  CAMELOT_KEYS,
  formatearBpm,
  formatearDuracion,
  mensajeErrorAmigable,
} from "../lib/format";
import type { Genero, PlaylistInsert, PlaylistTrackInsert } from "../lib/types";
import { useAuth } from "../lib/auth";
import { usePlayer } from "../lib/player";
import Portada from "../components/Portada";

interface TrackFila {
  id: string;
  titulo: string;
  artista_original: string | null;
  remixer: string | null;
  bpm: number | null;
  key_armonica: string | null;
  duracion_seg: number | null;
  genero_id: string | null;
  generos: { nombre: string } | null;
  subido_por: string | null;
  tags: string[] | null;
  portada_url: string | null;
  fecha_subida: string | null;
  perfiles: { nombre_dj: string | null; email: string } | null;
}

/* Colores de acento que van rotando en los badges de género — puramente
   visual, no hay una columna de color en `generos`. Clases completas y
   literales (Tailwind v4 no genera clases armadas con template strings
   en runtime, necesita verlas tal cual en el código fuente). */
const BADGES_GENERO = [
  "bg-accent/15 text-accent",
  "bg-accent-teal/15 text-accent-teal",
  "bg-accent-violet/15 text-accent-violet",
  "bg-accent-lime/15 text-accent-lime",
  "bg-accent-pink/15 text-accent-pink",
];
function badgeGenero(i: number) {
  return BADGES_GENERO[i % BADGES_GENERO.length];
}

/* Íconos de la columna "Acciones" — antes eran botones de texto
   (Editar/Bajar/Borrar), ahora solo el ícono + aria-label/title para
   que siga siendo accesible y quede claro al pasar el mouse. */
function IconoEditar() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 20h4L19.5 8.5a2.121 2.121 0 0 0-3-3L5 17v3Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M14.2 6.8 17.2 9.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function IconoBajar() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 4v11.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path
        d="M7.5 11.5 12 16l4.5-4.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M5 19.5h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function IconoBorrar() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4.5 7h15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path
        d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7 7l0.9 12.1a1 1 0 0 0 1 .9h6.2a1 1 0 0 0 1-.9L17 7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10 10.5v6M14 10.5v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function CatalogoPage() {
  const { session, perfil } = useAuth();
  const player = usePlayer();
  const { sidebarEscritorioAbierto } = useOutletContext<AppShellContext>();
  const [searchParams] = useSearchParams();
  const [tracks, setTracks] = useState<TrackFila[]>([]);
  const [generos, setGeneros] = useState<Genero[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [busqueda, setBusqueda] = useState(() => searchParams.get("q") ?? "");
  const [generoId, setGeneroId] = useState("");
  const [bpmMin, setBpmMin] = useState("");
  const [bpmMax, setBpmMax] = useState("");
  const [key, setKey] = useState("");

  // "Catálogo completo" se pagina: cada Portada montada pide una URL
  // firmada al backend (ver src/components/Portada.tsx -> urlImagen), que
  // además chequea la suscripción contra Supabase — con todo el catálogo
  // renderizado de una, esos pedidos crecen junto con la cantidad de
  // temas y se notan cada vez más. Paginar acota cuántas Portadas están
  // montadas a la vez, sin importar qué tan grande sea el catálogo.
  const PAGINA_TAMANO = 40;
  const [pagina, setPagina] = useState(1);

  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  // Solo cubre el momentito de pedir la URL firmada antes de poder
  // arrancar la reproducción en sí — una vez que arranca, el estado
  // "de verdad" (sonando/pausado/cargando el audio) vive en el
  // reproductor global (usePlayer), que sobrevive si uno se va a otra
  // pantalla (ver src/lib/player.tsx).
  const [cargandoPreviewId, setCargandoPreviewId] = useState<string | null>(null);
  const [descargando, setDescargando] = useState<string | null>(null);
  const [procesandoZip, setProcesandoZip] = useState(false);
  const [guardandoPlaylist, setGuardandoPlaylist] = useState(false);
  const [nombrePlaylist, setNombrePlaylist] = useState("");
  const [mostrarFormPlaylist, setMostrarFormPlaylist] = useState(false);
  const [avisoAccion, setAvisoAccion] = useState<string | null>(null);

  const [editando, setEditando] = useState<TrackFila | null>(null);
  const [edTitulo, setEdTitulo] = useState("");
  const [edArtista, setEdArtista] = useState("");
  const [edRemixer, setEdRemixer] = useState("");
  const [edGeneroId, setEdGeneroId] = useState("");
  const [edKey, setEdKey] = useState("");
  const [edBpm, setEdBpm] = useState("");
  const [edTags, setEdTags] = useState("");
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [subiendoPortada, setSubiendoPortada] = useState(false);

  const [confirmandoBorrarId, setConfirmandoBorrarId] = useState<string | null>(null);
  const [borrandoId, setBorrandoId] = useState<string | null>(null);

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
        // el filtro de género simplemente queda vacío si esto falla
      }
    })();
  }, []);

  useEffect(() => {
    // Si el buscador del header manda a /catalogo?q=... estando ya en esta
    // página, el componente no se remonta — sin esto el campo de búsqueda
    // se quedaría con el valor viejo.
    const q = searchParams.get("q") ?? "";
    setBusqueda((prev) => (prev === q ? prev : q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    setPagina(1);
    const handle = setTimeout(() => {
      cargarTracks();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda, generoId, bpmMin, bpmMax, key]);

  async function cargarTracks() {
    setCargando(true);
    setError(null);

    try {
      let query = supabase
        .from("tracks")
        .select(
          "id, titulo, artista_original, remixer, bpm, key_armonica, duracion_seg, genero_id, generos(nombre), subido_por, tags, portada_url, fecha_subida, perfiles(nombre_dj, email)",
        )
        .eq("estado", "activo")
        .order("fecha_subida", { ascending: false });

      if (busqueda.trim()) {
        const q = busqueda.trim();
        query = query.or(
          `titulo.ilike.%${q}%,remixer.ilike.%${q}%,artista_original.ilike.%${q}%`,
        );
      }
      if (generoId) query = query.eq("genero_id", generoId);
      if (key) query = query.eq("key_armonica", key);
      if (bpmMin) query = query.gte("bpm", Number(bpmMin));
      if (bpmMax) query = query.lte("bpm", Number(bpmMax));

      const { data, error } = await query.limit(300);

      if (error) {
        setError(mensajeErrorAmigable(error));
        setTracks([]);
      } else {
        setTracks((data ?? []) as unknown as TrackFila[]);
      }
    } catch (e) {
      setError(mensajeErrorAmigable(e));
      setTracks([]);
    } finally {
      setCargando(false);
    }
  }

  function limpiarFiltros() {
    setBusqueda("");
    setGeneroId("");
    setBpmMin("");
    setBpmMax("");
    setKey("");
  }

  function toggleSeleccion(id: string) {
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // `filaEl`: el elemento de la fila/tarjeta que disparó esto — lo
  // llevamos a la vista si la barra fija del reproductor (que recién
  // aparece ahora) lo tapa parcialmente. `scroll-mb-*` en cada fila (ver
  // más abajo) le dice al navegador cuánto margen dejar abajo.
  async function reproducir(track: TrackFila, filaEl?: HTMLElement | null) {
    filaEl?.scrollIntoView({ behavior: "smooth", block: "nearest" });

    if (player.trackActual?.id === track.id) {
      // ya está activo este track (sonando o en pausa) — solo togglear
      player.togglePlay();
      return;
    }

    setAvisoAccion(null);
    setCargandoPreviewId(track.id);
    try {
      const { url, duracion_seg, peaks } = await obtenerUrlDescarga(track.id, false);
      player.reproducir(
        {
          id: track.id,
          titulo: track.titulo,
          artista_original: track.artista_original,
          remixer: track.remixer,
          duracion_seg: duracion_seg ?? track.duracion_seg,
          url,
          peaks,
        },
        {
          // La cola es el catálogo tal cual está filtrado en este momento
          // (no solo la página actual) — en reproducción continua sigue
          // uno detrás del otro por todo lo filtrado, no solo lo
          // paginado en pantalla.
          cola: tracks.map((t) => ({
            id: t.id,
            titulo: t.titulo,
            artista_original: t.artista_original,
            remixer: t.remixer,
            duracion_seg: t.duracion_seg,
          })),
          resolverUrl: async (id) => {
            const r = await obtenerUrlDescarga(id, false);
            return { url: r.url, duracion_seg: r.duracion_seg, peaks: r.peaks };
          },
        },
      );
    } catch (e) {
      setAvisoAccion(e instanceof ApiError ? e.message : "No se pudo reproducir el preview.");
    } finally {
      setCargandoPreviewId(null);
    }
  }

  async function descargarIndividual(track: TrackFila) {
    setDescargando(track.id);
    setAvisoAccion(null);
    try {
      const { url } = await obtenerUrlDescarga(track.id, true);
      abrirDescargaDirecta(url);
    } catch (e) {
      setAvisoAccion(e instanceof ApiError ? e.message : "No se pudo descargar el track.");
    } finally {
      setDescargando(null);
    }
  }

  async function descargarSeleccionZip() {
    if (seleccion.size === 0) return;
    setProcesandoZip(true);
    setAvisoAccion(null);
    try {
      const { archivos } = await descargarZip([...seleccion]);
      await descargarVariosDirecto(archivos);
    } catch (e) {
      setAvisoAccion(e instanceof ApiError ? e.message : "No se pudo descargar la selección.");
    } finally {
      setProcesandoZip(false);
    }
  }

  async function guardarComoPlaylist() {
    if (!session || seleccion.size === 0 || !nombrePlaylist.trim()) return;
    setGuardandoPlaylist(true);
    setAvisoAccion(null);
    try {
      const nuevaPlaylist: PlaylistInsert = {
        nombre: nombrePlaylist.trim(),
        creado_por: session.user.id,
      };
      const { data: playlist, error: errPlaylist } = await supabase
        .from("playlists")
        .insert(nuevaPlaylist)
        .select()
        .single();
      if (errPlaylist || !playlist) throw new Error(errPlaylist?.message ?? "No se pudo crear la playlist.");

      const filas: PlaylistTrackInsert[] = [...seleccion].map((trackId, i) => ({
        playlist_id: playlist.id as string,
        track_id: trackId,
        orden: i,
      }));
      const { error: errTracks } = await supabase.from("playlist_tracks").insert(filas);
      if (errTracks) throw new Error(errTracks.message);

      setAvisoAccion(`Playlist "${playlist.nombre}" creada con ${filas.length} tracks.`);
      setMostrarFormPlaylist(false);
      setNombrePlaylist("");
      setSeleccion(new Set());
    } catch (e) {
      setAvisoAccion(mensajeErrorAmigable(e));
    } finally {
      setGuardandoPlaylist(false);
    }
  }

  function abrirEdicion(track: TrackFila) {
    setEditando(track);
    setEdTitulo(track.titulo);
    setEdArtista(track.artista_original ?? "");
    setEdRemixer(track.remixer ?? "");
    setEdGeneroId(track.genero_id ?? "");
    setEdKey(track.key_armonica ?? "");
    setEdBpm(track.bpm != null ? String(track.bpm) : "");
    setEdTags((track.tags ?? []).join(", "));
  }

  async function guardarEdicion() {
    if (!editando) return;
    if (!edTitulo.trim()) {
      setAvisoAccion("El título no puede quedar vacío.");
      return;
    }
    setGuardandoEdicion(true);
    setAvisoAccion(null);
    try {
      const tagsArr = edTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const { error } = await supabase
        .from("tracks")
        .update({
          titulo: edTitulo.trim(),
          artista_original: edArtista.trim() || null,
          remixer: edRemixer.trim() || null,
          genero_id: edGeneroId || null,
          key_armonica: edKey || null,
          bpm: edBpm ? Number(edBpm) : null,
          tags: tagsArr,
        })
        .eq("id", editando.id);
      if (error) throw error;

      setAvisoAccion(`"${edTitulo.trim()}" actualizado.`);
      setEditando(null);
      await cargarTracks();
    } catch (e) {
      setAvisoAccion(mensajeErrorAmigable(e));
    } finally {
      setGuardandoEdicion(false);
    }
  }

  async function borrarTrack(track: TrackFila) {
    setBorrandoId(track.id);
    setAvisoAccion(null);
    try {
      await borrarTrackAdmin(track.id);
      setConfirmandoBorrarId(null);
      setTracks((prev) => prev.filter((t) => t.id !== track.id));
      setAvisoAccion(`"${track.titulo}" se borró del catálogo.`);
    } catch (e) {
      setAvisoAccion(e instanceof ApiError ? e.message : "No se pudo borrar el track.");
    } finally {
      setBorrandoId(null);
    }
  }

  async function cambiarPortada(file: File) {
    if (!editando) return;
    setSubiendoPortada(true);
    setAvisoAccion(null);
    try {
      const { path } = await subirPortada(editando.id, file);
      setTracks((prev) =>
        prev.map((t) => (t.id === editando.id ? { ...t, portada_url: path } : t)),
      );
      setEditando((prev) => (prev ? { ...prev, portada_url: path } : prev));
    } catch (e) {
      setAvisoAccion(e instanceof ApiError ? e.message : "No se pudo subir la portada.");
    } finally {
      setSubiendoPortada(false);
    }
  }

  const hayFiltrosActivos = useMemo(
    () => !!(busqueda || generoId || bpmMin || bpmMax || key),
    [busqueda, generoId, bpmMin, bpmMax, key],
  );

  const mostrarDescubrimiento = !hayFiltrosActivos && !cargando && tracks.length > 0;
  // "Recién subidos" es ahora un carrusel (ver CarruselHorizontal) en vez
  // de una fila fija, así que puede mostrar bastantes más portadas sin
  // amontonarlas — con el sidebar de PC escondido hay más ancho real
  // disponible de entrada (ver AppShellContext), se suman unas pocas más.
  const destacados = tracks.slice(0, sidebarEscritorioAbierto ? 14 : 18);

  const totalPaginas = Math.max(1, Math.ceil(tracks.length / PAGINA_TAMANO));
  // Por si la lista se achica (un filtro, un borrado) y la página en la
  // que uno estaba ya no existe más.
  const paginaSegura = Math.min(pagina, totalPaginas);
  const tracksPagina = tracks.slice(
    (paginaSegura - 1) * PAGINA_TAMANO,
    paginaSegura * PAGINA_TAMANO,
  );

  // Mismos controles arriba y abajo de la lista — en un catálogo largo
  // (5+ páginas) volver a bajar hasta el pie solo para pasar de página
  // es incómodo.
  const controlesPaginacion = totalPaginas > 1 && (
    <div className="flex items-center justify-center gap-3">
      <button
        type="button"
        onClick={() => setPagina((p) => Math.max(1, p - 1))}
        disabled={paginaSegura <= 1}
        className="text-sm font-semibold px-4 py-2 rounded-lg border border-border hover:border-ink transition-colors appearance-none bg-transparent cursor-pointer disabled:opacity-40 disabled:cursor-default"
      >
        Anterior
      </button>
      <span className="text-sm text-muted">
        Página {paginaSegura} de {totalPaginas}
      </span>
      <button
        type="button"
        onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
        disabled={paginaSegura >= totalPaginas}
        className="text-sm font-semibold px-4 py-2 rounded-lg border border-border hover:border-ink transition-colors appearance-none bg-transparent cursor-pointer disabled:opacity-40 disabled:cursor-default"
      >
        Siguiente
      </button>
    </div>
  );

  return (
    <div className="flex flex-col gap-8">
      {/* Banner de bienvenida */}
      <div className="relative overflow-hidden rounded-2xl px-6 sm:px-9 py-9 sm:py-11 bg-ink">
        {/* Modo claro: la foto trae de fábrica un texto de relleno "fantasma"
            incrustado (es un mockup, no una foto limpia) — con un scrim
            débil ese texto se transparentaba detrás del título real y
            quedaba doble. El scrim tiene que ser fuerte justo donde va el
            texto (misma lógica que ya usa el modo oscuro, solo que acá en
            blanco) para taparlo del todo, y mucho más suave hacia la
            derecha, donde no hay texto y sí conviene que se note el color
            original de la foto. */}
        <img
          src="/hero-light.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover dark:hidden"
        />
        <img
          src="/hero-dark.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover opacity-60 hidden dark:block"
        />
        <div
          className="absolute inset-0 dark:hidden"
          style={{
            background:
              "linear-gradient(100deg, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.78) 40%, rgba(255,255,255,0.4) 70%, rgba(255,255,255,0.1) 100%)",
          }}
        />
        {/* Modo oscuro: sin cambios. */}
        <div
          className="absolute inset-0 hidden dark:block"
          style={{
            background:
              "linear-gradient(100deg, rgba(10,10,20,0.88) 0%, rgba(10,10,20,0.6) 55%, rgba(10,10,20,0.25) 100%)",
          }}
        />
        <div className="relative max-w-xl">
          <h1 className="font-display font-extrabold text-[clamp(1.6rem,3.5vw,2.4rem)] leading-[1.08] tracking-[-0.5px] m-0 text-ink dark:text-white">
            El catálogo colaborativo de música para DJs
          </h1>
          <p className="mt-3 text-ink/75 dark:text-white/75 text-sm sm:text-base m-0">
            {cargando
              ? "Cargando…"
              : `Descubrí, escuchá y descargá los ${tracks.length} track${tracks.length === 1 ? "" : "s"} que compartió el grupo.`}
          </p>
        </div>

        {/* Tagline manuscrito — solo modo oscuro, como en la referencia de diseño.
            Oculto en mobile: a ese ancho se superpone con el título. */}
        <p
          className="hidden dark:sm:block absolute right-9 top-9 font-script text-3xl leading-[1.05] text-white/90 rotate-[-4deg] m-0 text-right"
          style={{ textShadow: "0 2px 10px rgba(0,0,0,0.35)" }}
          aria-hidden="true"
        >
          Juntos
          <br />
          hacemos crecer
          <br />
          el catálogo
        </p>
      </div>

      {/* Aviso de acceso gratuito limitado — solo para quien todavía no tiene
          suscripción activa. Puede escuchar Cuarteto/Cachengue sin pagar
          (ver policy "ver_tracks_con_acceso" en sql/006_*.sql); el resto del
          catálogo y cualquier descarga quedan atrás de la suscripción. */}
      {perfil && perfil.estado_suscripcion !== "activo" && perfil.rol !== "admin" && (
        <p className="text-sm bg-accent/10 border border-accent/30 rounded-xl px-4 py-3 m-0">
          Por ahora podés escuchar gratis los temas de <strong>Cuarteto</strong> y{" "}
          <strong>Cachengue</strong>. Para ver todo el catálogo y descargar, necesitás una
          suscripción mensual —{" "}
          <Link to="/suscripcion" className="underline font-semibold">
            suscribite acá
          </Link>
          .
        </p>
      )}

      {/* Pills de género */}
      {generos.length > 0 && (
        <div className="flex flex-wrap gap-2 -mt-2">
          <button
            type="button"
            onClick={() => setGeneroId("")}
            className={`text-sm font-semibold px-4 py-2 rounded-full appearance-none border-none cursor-pointer transition-colors ${
              generoId === "" ? "bg-ink text-cream" : "bg-card border border-border text-body hover:border-ink"
            }`}
          >
            Todos
          </button>
          {generos.map((g, i) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setGeneroId(g.id === generoId ? "" : g.id)}
              className={`text-sm font-semibold px-4 py-2 rounded-full appearance-none cursor-pointer transition-colors ${
                generoId === g.id
                  ? "border-none bg-accent text-white"
                  : `border-none ${badgeGenero(i)}`
              }`}
            >
              {g.nombre}
            </button>
          ))}
        </div>
      )}

      {/* Filtros */}
      <div className="bg-card rounded-2xl p-5 border border-border-soft flex flex-wrap gap-4 items-end">
        <div className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
          <label htmlFor="busqueda" className="text-xs font-semibold text-body">
            Buscar
          </label>
          <input
            id="busqueda"
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Título, remixer, artista…"
            className="px-3 py-2 rounded-lg border border-border text-sm bg-cream-soft focus:outline-2 focus:outline-accent"
          />
        </div>

        <div className="flex flex-col gap-1.5 min-w-[160px]">
          <label htmlFor="genero" className="text-xs font-semibold text-body">
            Género
          </label>
          <select
            id="genero"
            value={generoId}
            onChange={(e) => setGeneroId(e.target.value)}
            className="px-3 py-2 rounded-lg border border-border text-sm bg-cream-soft"
          >
            <option value="">Todos</option>
            {generos.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nombre}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5 w-24">
          <label htmlFor="bpmMin" className="text-xs font-semibold text-body">
            BPM min
          </label>
          <input
            id="bpmMin"
            type="number"
            value={bpmMin}
            onChange={(e) => setBpmMin(e.target.value)}
            className="px-3 py-2 rounded-lg border border-border text-sm bg-cream-soft"
          />
        </div>

        <div className="flex flex-col gap-1.5 w-24">
          <label htmlFor="bpmMax" className="text-xs font-semibold text-body">
            BPM max
          </label>
          <input
            id="bpmMax"
            type="number"
            value={bpmMax}
            onChange={(e) => setBpmMax(e.target.value)}
            className="px-3 py-2 rounded-lg border border-border text-sm bg-cream-soft"
          />
        </div>

        <div className="flex flex-col gap-1.5 w-28">
          <label htmlFor="key" className="text-xs font-semibold text-body">
            Tonalidad
          </label>
          <select
            id="key"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            className="px-3 py-2 rounded-lg border border-border text-sm bg-cream-soft"
          >
            <option value="">Todas</option>
            {CAMELOT_KEYS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>

        {hayFiltrosActivos && (
          <button
            type="button"
            onClick={limpiarFiltros}
            className="text-sm font-semibold text-muted hover:text-ink appearance-none bg-transparent border-none cursor-pointer px-2 py-2"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {avisoAccion && (
        <p className="text-sm bg-card border border-border-soft rounded-xl px-4 py-3 m-0">
          {avisoAccion}
        </p>
      )}
      {error && <p className="text-sm text-accent font-medium">{error}</p>}

      {/* Recién subidos — los últimos subidos, como tarjetas en un carrusel */}
      {mostrarDescubrimiento && (
        <div className="flex flex-col gap-3.5">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-bold text-lg m-0">Recién subidos</h2>
          </div>
          <CarruselHorizontal>
            {destacados.map((t) => {
              const esElSonando = player.trackActual?.id === t.id;
              const mostrandoSpinner =
                cargandoPreviewId === t.id || (esElSonando && player.estado === "cargando");
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={(e) => reproducir(t, e.currentTarget)}
                  className="group relative shrink-0 w-44 text-left appearance-none bg-transparent border-none cursor-pointer p-0 scroll-mb-20"
                >
                  <div className="relative w-44 h-44 rounded-2xl overflow-hidden border border-border-soft">
                    <Portada path={t.portada_url} alt="" className="w-full h-full object-cover" />
                    <span className="absolute inset-0 bg-ink/0 group-hover:bg-ink/30 transition-colors" />
                    <span className="absolute bottom-2.5 right-2.5 w-9 h-9 rounded-full bg-white text-ink-fixed flex items-center justify-center shadow">
                      {mostrandoSpinner ? (
                        <span className="text-xs">…</span>
                      ) : esElSonando && player.estado === "sonando" ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                          <rect x="5" y="4" width="5" height="16" />
                          <rect x="14" y="4" width="5" height="16" />
                        </svg>
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M6 4 L20 12 L6 20 Z" />
                        </svg>
                      )}
                    </span>
                  </div>
                  <div className="mt-2 px-0.5">
                    <div className="font-semibold text-sm truncate">{t.titulo}</div>
                    <div className="text-xs text-muted truncate">
                      {t.remixer || t.perfiles?.nombre_dj || t.perfiles?.email || "—"}
                      {t.bpm != null ? ` · ${formatearBpm(t.bpm)} bpm` : ""}
                    </div>
                  </div>
                </button>
              );
            })}
          </CarruselHorizontal>
        </div>
      )}

      {/* Lista completa */}
      <div className="flex flex-col gap-3.5">
        {mostrarDescubrimiento && <h2 className="font-display font-bold text-lg m-0">Catálogo completo</h2>}
        {controlesPaginacion}
        <div className="bg-card rounded-2xl border border-border-soft overflow-hidden">
        {!cargando && tracks.length === 0 && (
          <div className="p-8 text-center text-muted text-sm">
            No hay tracks que coincidan con estos filtros.
          </div>
        )}

        {/* Encabezados — solo desde sm: (ahí es donde las columnas de la
            derecha dejan de estar ocultas). Los anchos/gaps de cada <span>
            tienen que calcar exactamente a los de la fila de abajo para
            que quede alineado — "Acciones" incluido, con w-56 fijo en
            ambos lados aunque la fila tenga 1 botón (Bajar solo) o 3
            (+ Editar/Borrar según quién sea): si "Acciones" no fuera de
            ancho fijo, "Tema" (el único flex-1) terminaría midiendo
            distinto en el encabezado que en cada fila y todo se
            correría de nuevo. */}
        {tracksPagina.length > 0 && (
          <div className="hidden sm:flex items-center gap-x-4 px-5 py-2.5 border-b border-border-soft text-xs font-semibold text-muted uppercase">
            <span className="w-4 shrink-0" aria-hidden="true" />
            <span className="w-9 shrink-0" aria-hidden="true" />
            <span className="w-9 shrink-0" aria-hidden="true" />
            <span className="min-w-[150px] flex-1">Tema</span>
            <span className="w-28 shrink-0 text-center">Género</span>
            <span className="w-16 shrink-0 text-center">BPM</span>
            <span className="w-20 shrink-0 text-center">Tonalidad</span>
            <span className="w-20 shrink-0 text-center">Duración</span>
            <span className="w-56 shrink-0 text-center">Acciones</span>
          </div>
        )}

        {tracksPagina.map((t) => {
          const seleccionado = seleccion.has(t.id);
          const esElSonando = player.trackActual?.id === t.id;
          const mostrandoSpinner =
            cargandoPreviewId === t.id || (esElSonando && player.estado === "cargando");
          const puedeEditar = t.subido_por === session?.user.id || perfil?.rol === "admin";
          const esAdmin = perfil?.rol === "admin";
          const iGenero = generos.findIndex((g) => g.id === t.genero_id);
          return (
            <div
              key={t.id}
              data-fila-track
              className={`flex flex-col border-b border-border-soft last:border-b-0 scroll-mb-20 ${seleccionado ? "bg-cream" : ""}`}
            >
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
                <input
                  type="checkbox"
                  checked={seleccionado}
                  onChange={() => toggleSeleccion(t.id)}
                  aria-label={`Seleccionar ${t.titulo}`}
                  className="w-4 h-4 accent-accent shrink-0"
                />

                <button
                  type="button"
                  onClick={(e) => reproducir(t, e.currentTarget.closest<HTMLElement>("[data-fila-track]"))}
                  aria-label={esElSonando && player.estado === "sonando" ? "Pausar" : "Reproducir preview"}
                  className="shrink-0 w-9 h-9 rounded-full bg-ink text-cream flex items-center justify-center appearance-none border-none cursor-pointer"
                >
                  {mostrandoSpinner ? (
                    <span className="text-xs">…</span>
                  ) : esElSonando && player.estado === "sonando" ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="5" y="4" width="5" height="16" />
                      <rect x="14" y="4" width="5" height="16" />
                    </svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M6 4 L20 12 L6 20 Z" />
                    </svg>
                  )}
                </button>

                <Portada
                  path={t.portada_url}
                  alt=""
                  className="hidden sm:block shrink-0 w-9 h-9 rounded-lg object-cover border border-border-soft"
                />

                <div className="min-w-[150px] flex-1">
                  <div className="font-semibold text-sm truncate">{t.titulo}</div>
                  <div className="text-xs text-muted truncate">
                    {t.remixer ? `Remix: ${t.remixer}` : ""}
                    {t.remixer && t.artista_original ? " · " : ""}
                    {t.artista_original ? `Original: ${t.artista_original}` : ""}
                  </div>
                </div>

                <div className="hidden sm:flex justify-center w-28 shrink-0">
                  {t.generos?.nombre ? (
                    <span
                      title={t.generos.nombre}
                      className={`inline-block max-w-full truncate text-xs font-semibold px-2.5 py-1 rounded-full ${badgeGenero(
                        iGenero < 0 ? 0 : iGenero,
                      )}`}
                    >
                      {t.generos.nombre}
                    </span>
                  ) : (
                    <span className="text-xs text-muted">—</span>
                  )}
                </div>
                <div className="hidden sm:block text-xs text-muted w-16 shrink-0 text-center">
                  {formatearBpm(t.bpm)} bpm
                </div>
                <div className="hidden sm:block text-xs text-muted w-20 shrink-0 text-center">
                  {t.key_armonica ?? "—"}
                </div>
                <div className="hidden sm:block text-xs text-muted w-20 shrink-0 text-center">
                  {formatearDuracion(t.duracion_seg)}
                </div>

                {/* Ancho fijo (no shrink/grow) para que esta columna mida
                    siempre lo mismo sin importar cuántos botones entren
                    en cada fila (Editar es del dueño o admin, Borrar
                    solo admin) — así "Tema" (el único flex-1 de la fila)
                    termina midiendo siempre igual que en el encabezado,
                    que es lo que los mantiene alineados. Ver el <span>
                    "Acciones" del encabezado, más arriba, con el mismo
                    w-56. */}
                <div className="w-56 shrink-0 flex flex-wrap items-center justify-center gap-2">
                  {puedeEditar && (
                    <button
                      type="button"
                      onClick={() => abrirEdicion(t)}
                      aria-label={`Editar ${t.titulo}`}
                      title="Editar"
                      className="shrink-0 p-2 flex items-center justify-center rounded-lg border border-border hover:border-ink transition-colors appearance-none bg-transparent cursor-pointer"
                    >
                      <IconoEditar />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => descargarIndividual(t)}
                    disabled={descargando === t.id}
                    aria-label={`Bajar ${t.titulo}`}
                    title="Bajar"
                    className="shrink-0 p-2 flex items-center justify-center rounded-lg border border-border hover:border-ink transition-colors appearance-none bg-transparent cursor-pointer disabled:opacity-50"
                  >
                    {descargando === t.id ? <span className="text-xs px-0.5">…</span> : <IconoBajar />}
                  </button>

                  {esAdmin && confirmandoBorrarId !== t.id && (
                    <button
                      type="button"
                      onClick={() => setConfirmandoBorrarId(t.id)}
                      aria-label={`Borrar ${t.titulo}`}
                      title="Borrar"
                      className="shrink-0 p-2 flex items-center justify-center rounded-lg border border-border hover:border-accent hover:text-accent transition-colors appearance-none bg-transparent cursor-pointer"
                    >
                      <IconoBorrar />
                    </button>
                  )}
                  {esAdmin && confirmandoBorrarId === t.id && (
                    <div className="shrink-0 flex items-center gap-1.5">
                      <span className="text-xs text-muted">¿Seguro?</span>
                      <button
                        type="button"
                        onClick={() => borrarTrack(t)}
                        disabled={borrandoId === t.id}
                        className="text-xs font-semibold px-2.5 py-2 rounded-lg bg-accent text-white appearance-none border-none cursor-pointer disabled:opacity-60"
                      >
                        {borrandoId === t.id ? "…" : "Sí, borrar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmandoBorrarId(null)}
                        disabled={borrandoId === t.id}
                        className="text-xs text-muted hover:text-ink appearance-none bg-transparent border-none cursor-pointer disabled:opacity-60"
                      >
                        No
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        </div>

        {controlesPaginacion}
      </div>

      {/* Barra de selección */}
      {/* "bottom" sube cuando hay reproductor activo (barra fija abajo de
          todo, ver AppShell) para no quedar tapada ni tapar sus controles —
          antes quedaban las dos superpuestas, ver captura de Edgar. */}
      {seleccion.size > 0 && (
        <div
          className={`sticky self-center bg-ink text-cream rounded-full px-5 py-3 flex items-center gap-4 shadow-lg ${
            player.trackActual ? "bottom-24" : "bottom-4"
          }`}
        >
          <span className="text-sm font-semibold">{seleccion.size} seleccionados</span>
          <button
            type="button"
            onClick={descargarSeleccionZip}
            disabled={procesandoZip}
            className="text-sm font-semibold bg-accent text-white px-4 py-2 rounded-full appearance-none border-none cursor-pointer disabled:opacity-60"
          >
            {procesandoZip ? "Descargando…" : "Descargar selección"}
          </button>
          <button
            type="button"
            onClick={() => setMostrarFormPlaylist(true)}
            className="text-sm font-semibold bg-transparent text-cream px-2 py-2 appearance-none border-none cursor-pointer underline"
          >
            Guardar como playlist
          </button>
          <button
            type="button"
            onClick={() => setSeleccion(new Set())}
            className="text-sm text-cream/70 hover:text-cream appearance-none bg-transparent border-none cursor-pointer"
          >
            Cancelar
          </button>
        </div>
      )}

      {mostrarFormPlaylist && (
        <div className="fixed inset-0 bg-overlay flex items-center justify-center z-50 px-4">
          <div className="bg-card rounded-2xl p-6 max-w-sm w-full flex flex-col gap-4">
            <h2 className="font-display font-bold text-lg m-0">Nueva playlist</h2>
            <input
              type="text"
              autoFocus
              value={nombrePlaylist}
              onChange={(e) => setNombrePlaylist(e.target.value)}
              placeholder="Nombre de la playlist"
              className="px-3 py-2.5 rounded-lg border border-border text-sm bg-cream-soft"
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setMostrarFormPlaylist(false)}
                className="text-sm font-semibold px-4 py-2 rounded-lg appearance-none bg-transparent border-none cursor-pointer text-muted"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={guardarComoPlaylist}
                disabled={guardandoPlaylist || !nombrePlaylist.trim()}
                className="text-sm font-semibold px-4 py-2 rounded-lg bg-accent text-white appearance-none border-none cursor-pointer disabled:opacity-60"
              >
                {guardandoPlaylist ? "Guardando…" : "Crear"}
              </button>
            </div>
          </div>
        </div>
      )}

      {editando && (
        <div className="fixed inset-0 bg-overlay flex items-center justify-center z-50 px-4">
          <div className="bg-card rounded-2xl p-6 max-w-lg w-full flex flex-col gap-4">
            <h2 className="font-display font-bold text-lg m-0">Editar track</h2>

            <div className="flex items-center gap-4">
              <Portada
                path={editando.portada_url}
                alt=""
                className="w-16 h-16 rounded-xl object-cover border border-border-soft shrink-0"
              />
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-body">Portada</label>
                <label className="text-xs font-semibold underline text-ink cursor-pointer self-start">
                  {subiendoPortada ? "Subiendo…" : "Cambiar imagen"}
                  <input
                    type="file"
                    accept="image/*"
                    disabled={subiendoPortada}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void cambiarPortada(file);
                      e.target.value = "";
                    }}
                    className="hidden"
                  />
                </label>
                <span className="text-xs text-muted">Si no subís una, queda la genérica de ClubPack.</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1 sm:col-span-2">
                <label className="text-xs font-semibold text-body">Título *</label>
                <input
                  type="text"
                  autoFocus
                  value={edTitulo}
                  onChange={(e) => setEdTitulo(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-border text-sm bg-cream-soft"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-body">Remixer</label>
                <input
                  type="text"
                  value={edRemixer}
                  onChange={(e) => setEdRemixer(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-border text-sm bg-cream-soft"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-body">Artista original</label>
                <input
                  type="text"
                  value={edArtista}
                  onChange={(e) => setEdArtista(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-border text-sm bg-cream-soft"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-body">Género</label>
                <select
                  value={edGeneroId}
                  onChange={(e) => setEdGeneroId(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-border text-sm bg-cream-soft"
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
                  value={edKey}
                  onChange={(e) => setEdKey(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-border text-sm bg-cream-soft"
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
                  value={edBpm}
                  onChange={(e) => setEdBpm(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-border text-sm bg-cream-soft"
                />
              </div>
              <div className="flex flex-col gap-1 sm:col-span-2">
                <label className="text-xs font-semibold text-body">Tags</label>
                <input
                  type="text"
                  value={edTags}
                  onChange={(e) => setEdTags(e.target.value)}
                  placeholder="separados, por, coma"
                  className="px-3 py-2 rounded-lg border border-border text-sm bg-cream-soft"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-1">
              <button
                type="button"
                onClick={() => setEditando(null)}
                disabled={guardandoEdicion}
                className="text-sm font-semibold px-4 py-2 rounded-lg appearance-none bg-transparent border-none cursor-pointer text-muted disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={guardarEdicion}
                disabled={guardandoEdicion || !edTitulo.trim()}
                className="text-sm font-semibold px-4 py-2 rounded-lg bg-accent text-white appearance-none border-none cursor-pointer disabled:opacity-60"
              >
                {guardandoEdicion ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
