import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { Perfil } from "./types";

interface AuthContextValue {
  /** null mientras carga la sesión inicial; undefined no existe, siempre es Session | null una vez listo */
  session: Session | null;
  perfil: Perfil | null;
  cargando: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string,
  ) => Promise<{ error: string | null; necesitaConfirmacion: boolean }>;
  signOut: () => Promise<void>;
  recargarPerfil: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchPerfil(userId: string): Promise<Perfil | null> {
  const { data, error } = await supabase
    .from("perfiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.error("Error al cargar perfil:", error.message);
    return null;
  }
  return data ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let activo = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!activo) return;
      setSession(data.session);
      if (data.session) {
        const p = await fetchPerfil(data.session.user.id);
        if (activo) setPerfil(p);
      }
      if (activo) setCargando(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, nuevaSesion) => {
      if (!activo) return;
      setSession(nuevaSesion);
      if (nuevaSesion) {
        const p = await fetchPerfil(nuevaSesion.user.id);
        if (activo) setPerfil(p);
      } else {
        setPerfil(null);
      }
    });

    return () => {
      activo = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const signIn: AuthContextValue["signIn"] = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? traducirError(error.message) : null };
  };

  const signUp: AuthContextValue["signUp"] = async (email, password) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: traducirError(error.message), necesitaConfirmacion: false };
    return { error: null, necesitaConfirmacion: !data.session };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const recargarPerfil = async () => {
    if (!session) return;
    const p = await fetchPerfil(session.user.id);
    setPerfil(p);
  };

  return (
    <AuthContext.Provider
      value={{ session, perfil, cargando, signIn, signUp, signOut, recargarPerfil }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}

/**
 * Mismo criterio que la función SQL tiene_acceso_activo(): suscripción
 * activa, o rol admin. Pensado para chequear ANTES de mandar una
 * escritura que RLS va a rechazar igual si esto da false — así el aviso
 * es específico ("no tenés suscripción activa") en vez de depender del
 * mensaje crudo de Postgres que cae en el catch (ver el fallback
 * genérico para row-level security en mensajeErrorAmigable).
 */
export function tieneAccesoActivo(perfil: Perfil | null): boolean {
  return !!perfil && (perfil.estado_suscripcion === "activo" || perfil.rol === "admin");
}

export const MENSAJE_SIN_ACCESO_ACTIVO =
  "Tu cuenta no tiene una suscripción activa, así que no podés hacer esto todavía.";

function traducirError(mensaje: string): string {
  const m = mensaje.toLowerCase();
  if (m.includes("invalid login credentials")) return "Email o contraseña incorrectos.";
  if (m.includes("user already registered")) return "Ya existe una cuenta con ese email.";
  if (m.includes("password should be at least")) return "La contraseña debe tener al menos 6 caracteres.";
  if (m.includes("unable to validate email")) return "Ese email no parece válido.";
  return mensaje;
}
