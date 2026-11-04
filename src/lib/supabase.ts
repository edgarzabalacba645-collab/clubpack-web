import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Revisá el archivo .env (ver .env.example).",
  );
}

// Nota sobre el tipado: @supabase/supabase-js@2.119 (con su postgrest-js
// nuevo) solo infiere bien los tipos de un Database generado por la CLI
// de Supabase (`supabase gen types typescript`) — un Database escrito a
// mano (el nuestro, en ./types.ts) choca con su inferencia de .insert()/
// .update() y todo termina tipado `never`. Por eso el cliente va sin
// genérico acá: las formas de cada tabla (Track, Perfil, Genero, ...) de
// ./types.ts se siguen usando a mano — como tipo del dato que se manda a
// `.insert()/.update()` y casteando lo que devuelve `.select()` — así
// seguimos teniendo esos tipos como referencia sin pelear con la
// inferencia automática. El día que corran `supabase gen types
// typescript` contra el proyecto real, ese archivo generado sí se puede
// pasar a `createClient<Database>` sin este problema.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

/** Base URL del backend propio (FastAPI) — transcodificación, BPM, fingerprint, ZIP. */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
